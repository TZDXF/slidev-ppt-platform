/**
 * 流式 ops 收集器：把 Claude SSE 的内容块流归一化为「reason 文本流 + ops」。
 *
 * 两种模式产出同一组回调：
 * - tool_use 模式：text_delta → reason；input_json_delta → 累积 tool 输入，结束后解析为 ops。
 *   兜底：部分代理（如 step-3.7-flash 经 Aether 代理）不完整支持 tool_use，
 *   会忽略 tools/tool_choice，把 ops 当正文 text 输出。此时 tool input 为空，
 *   finish() 会从累积的正文里用 ```json 围栏 / 裸 JSON 容错提取 ops。
 * - json 模式：正文先写自然语言说明，末尾用 ```json {"ops":[...]} ``` 代码块提交 ops。
 *   收集器在流中识别 ```json 围栏，围栏之前的内容作为 reason 流式转发，
 *   围栏之内累积为 ops JSON。流式漏切围栏时，finish() 再从全文兜底提取。
 *
 * thinking_delta 一律忽略（不外泄思维链，也不污染 reason）。
 */
import type { EditOp } from '@slidev-ppt/shared';
import type { OpsMode } from './models.js';
import { normalizeOps } from './ops-schema.js';

export interface OpsCollectorHandlers {
  onReasonDelta: (text: string) => void;
  onOps: (ops: EditOp[]) => void;
}

export class OpsCollector {
  private mode: OpsMode;
  private h: OpsCollectorHandlers;
  private fullText = '';
  private emittedUpTo = 0;
  private inJson = false;
  private jsonBuf = '';
  private toolBuf = '';
  private finished = false;

  constructor(mode: OpsMode, h: OpsCollectorHandlers) {
    this.mode = mode;
    this.h = h;
  }

  /** text 内容块增量。 */
  feedText(delta: string): void {
    if (this.mode === 'tool_use') {
      // tool_use 模式：正文就是给用户的说明，直接流式转发；
      // 同时累积全文，供 finish() 在代理不支持 tool_use 时从正文兜底提取 ops。
      this.fullText += delta;
      this.h.onReasonDelta(delta);
      return;
    }
    // json 模式：从正文中切出 ```json 围栏。
    if (this.inJson) {
      this.jsonBuf += delta;
      return;
    }
    this.fullText += delta;
    const FENCE = '```json';
    const hold = FENCE.length; // 暂留尾部，避免把半个围栏当成 reason 转发
    const searchFrom = Math.max(0, this.emittedUpTo - hold);
    const idx = this.fullText.indexOf(FENCE, searchFrom);
    const safeEnd = this.fullText.length - hold;
    if (idx !== -1 && idx <= safeEnd) {
      // 命中围栏：转发围栏前的 reason，剩余转入 json 缓冲。
      if (idx > this.emittedUpTo) {
        this.h.onReasonDelta(this.fullText.slice(this.emittedUpTo, idx));
      }
      this.emittedUpTo = this.fullText.length;
      this.inJson = true;
      this.jsonBuf = this.fullText.slice(idx + FENCE.length).replace(/^\n/, '');
    } else if (safeEnd > this.emittedUpTo) {
      this.h.onReasonDelta(this.fullText.slice(this.emittedUpTo, safeEnd));
      this.emittedUpTo = safeEnd;
    }
  }

  /** tool_use 内容块的 input_json 增量。 */
  feedToolJson(delta: string): void {
    this.toolBuf += delta;
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;

    if (this.mode === 'tool_use') {
      // 标准路径：累积的 tool input JSON。
      if (this.toolBuf.trim()) {
        try {
          this.h.onOps(normalizeOps(JSON.parse(this.toolBuf)));
          return;
        } catch {
          // 解析失败：落到正文兜底（代理可能把 tool input 当正文转发）。
        }
      }
      // 兜底：代理不支持 tool_use 时，AI 可能把 ops 写进正文（```json 围栏或裸 JSON）。
      const fromText = tryParseOpsFromText(this.fullText);
      this.h.onOps(fromText ?? []);
      return;
    }

    // json 模式
    if (!this.inJson) {
      // 流式没切到围栏：把剩余 reason 补发，再从全文兜底提取。
      if (this.emittedUpTo < this.fullText.length) {
        this.h.onReasonDelta(this.fullText.slice(this.emittedUpTo));
      }
      const ops = tryParseOpsFromText(this.fullText);
      if (ops === null) {
        throw new Error('未在 AI 回复中找到 ops JSON 代码块');
      }
      this.h.onOps(ops);
      return;
    }

    // 流式已切到围栏：jsonBuf 首选，全文次选（围栏内 JSON 被截断时兜底）。
    const ops = tryParseOpsFromText(this.jsonBuf) ?? tryParseOpsFromText(this.fullText);
    if (ops === null) {
      throw new Error('未在 AI 回复中找到 ops JSON 代码块');
    }
    this.h.onOps(ops);
  }
}

/**
 * 从可能带 ```json 围栏 / 前后说明文字的文本里容错抠出 ops 并归一化。
 * 提取或解析失败返回 null（调用方决定回退策略）。
 *
 * 兼容三种 AI 输出形态：
 *  - ```` ```json { "ops": [...] } ``` ```` 标准围栏
 *  - ```` ``` { "ops": [...] } ``` ```` 无语言标记围栏
 *  - 裸 JSON：`说明文字 { "ops": [...] }`（取第一个 {/[ 到最后一个 }/]）
 */
function tryParseOpsFromText(text: string): EditOp[] | null {
  if (!text || !text.trim()) return null;
  const jsonStr = extractOpsJson(text);
  if (!jsonStr) return null;
  try {
    return normalizeOps(JSON.parse(jsonStr));
  } catch {
    return null;
  }
}

/** 从可能带围栏 / 前后说明文字的文本里抠出 JSON 字符串。 */
function extractOpsJson(text: string): string | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1] && fence[1].trim()) return fence[1].trim();
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (lastBrace > start) return text.slice(start, lastBrace + 1);
  return null;
}
