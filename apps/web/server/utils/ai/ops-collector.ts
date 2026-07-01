/**
 * 流式 ops 收集器：把 Claude SSE 的内容块流归一化为「reason 文本流 + ops」。
 *
 * 两种模式产出同一组回调：
 * - tool_use 模式：text_delta → reason；input_json_delta → 累积 tool 输入，结束后解析为 ops。
 * - json 模式：正文先写自然语言说明，末尾用 ```json {"ops":[...]} ``` 代码块提交 ops。
 *   收集器在流中识别 ```json 围栏，围栏之前的内容作为 reason 流式转发，
 *   围栏之内累积为 ops JSON。
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
      // tool_use 模式：正文就是给用户的说明，直接流式转发。
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
      if (!this.toolBuf.trim()) {
        this.h.onOps([]);
        return;
      }
      this.h.onOps(normalizeOps(JSON.parse(this.toolBuf)));
      return;
    }

    // json 模式
    if (!this.inJson) {
      // 没找到围栏：把剩余 reason 转发，再尝试整段当 JSON 解析。
      if (this.emittedUpTo < this.fullText.length) {
        this.h.onReasonDelta(this.fullText.slice(this.emittedUpTo));
      }
      const trimmed = this.fullText.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        this.h.onOps(normalizeOps(JSON.parse(trimmed)));
        return;
      }
      throw new Error('未在 AI 回复中找到 ops JSON 代码块');
    }

    const j = this.jsonBuf.trim().replace(/```$/, '').trim();
    this.h.onOps(normalizeOps(JSON.parse(j)));
  }
}
