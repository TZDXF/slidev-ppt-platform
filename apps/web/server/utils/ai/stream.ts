/**
 * Anthropic SDK 流式消费的薄封装，屏蔽事件类型细节，给上层统一的回调。
 *
 * - streamText: 文本块增量 → onText(text)
 * - tool_use input 增量 → onToolJson(partial)
 * - thinking 增量 → 忽略（不外泄思维链）
 *
 * 同时提供 completeJson：非流式取一条消息里的纯文本，剥围栏后 JSON.parse，
 * 用于大纲生成（结构化、无需流式）。
 */
import type Anthropic from '@anthropic-ai/sdk';

export interface StreamHandlers {
  onText: (text: string) => void;
  onToolJson: (partial: string) => void;
}

/** 消息参数（流式）。宽松类型，兼容不同 SDK 版本与 tool_use/json 两种模式。 */
export type StreamMessagesParams = Record<string, unknown>;

/**
 * 消费 client.messages.stream(params)，把内容块增量分发到 handlers。
 * 返回最终 stop_reason。
 */
export async function streamMessages(
  client: Anthropic,
  params: StreamMessagesParams,
  h: StreamHandlers,
): Promise<string | null> {
  // SDK 0.32 的 messages.stream 返回 MessageStream，可 async iterate 出事件。
  const msgStream = (client.messages as unknown as {
    stream: (p: StreamMessagesParams) => AsyncIterable<StreamEvent>;
  }).stream(params);

  let stopReason: string | null = null;
  for await (const ev of msgStream) {
    switch (ev.type) {
      case 'content_block_delta': {
        const delta = ev.delta;
        if (!delta) break;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          h.onText(delta.text);
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          h.onToolJson(delta.partial_json);
        }
        // thinking_delta / 其它：忽略
        break;
      }
      case 'message_delta': {
        const sr = (ev.delta as { stop_reason?: string | null }).stop_reason;
        if (sr) stopReason = sr;
        break;
      }
      default:
        break;
    }
  }
  return stopReason;
}

/** 非流式：取一条消息里所有 text 块拼接，剥 ```json 围栏后 JSON.parse。 */
export async function completeJson<T = unknown>(
  client: Anthropic,
  params: StreamMessagesParams,
): Promise<T> {
  const res = await (client.messages as unknown as {
    create: (p: StreamMessagesParams) => Promise<MessageResult>;
  }).create(params);

  const text = (res.content ?? [])
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const stripped = stripJsonFence(text).trim();
  return JSON.parse(stripped) as T;
}

/** 从可能带 ```json 围栏 / 前后说明文字的文本里抠出 JSON 字符串。 */
export function stripJsonFence(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  // 没有围栏：尝试截取第一个 { 或 [ 到最后一个 } 或 ]
  const start = text.search(/[{[]/);
  if (start === -1) return text;
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (lastBrace > start) return text.slice(start, lastBrace + 1);
  return text;
}

// ---- 仅用于类型收敛的最小局部类型（不依赖 SDK 内部导出） ----
interface StreamEvent {
  type: string;
  delta?: { type: string; text?: string; partial_json?: string; stop_reason?: string | null };
}
interface MessageResult {
  content?: Array<{ type: string; text?: string }>;
}
