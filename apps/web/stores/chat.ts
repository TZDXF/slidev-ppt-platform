import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { EditOp } from '@slidev-ppt/shared';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** AI 回复是否仍在流式接收中 */
  streaming?: boolean;
  /** AI 返回的编辑 ops（破坏性 ops 由 UI 弹确认后再 apply） */
  ops?: EditOp[];
  /** 该条消息是否为错误回复 */
  error?: boolean;
}

interface StreamTextChunk { type: 'text'; delta: string }
interface StreamDoneChunk { type: 'done'; reply?: string; ops?: EditOp[] }
interface StreamErrorChunk { type: 'error'; message: string }
type StreamChunk = StreamTextChunk | StreamDoneChunk | StreamErrorChunk;

function genId(): string {
  // 轻量 id 生成（crypto.randomUUID 在浏览器与 Node 均可用，降级兜底）
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 对话 store —— 会话级历史 + SSE 流式接收。
 *
 * sendMessage 向 /api/ai/update 发 POST，按 SSE chunk 增量更新 assistant 消息：
 *  - text  → 追加到 content（打字机效果）
 *  - done  → 写入 ops，结束 streaming
 *  - error → 标记错误，结束 streaming
 */
export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([]);
  const sending = ref(false);

  function push(msg: ChatMessage) {
    messages.value.push(msg);
  }

  /** 解析 SSE 流的 data 行并分发 chunk */
  async function consumeStream(
    res: Response,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<void> {
    if (!res.body) throw new Error('响应无 body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 以双换行分隔事件块
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of rawEvent.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            onChunk(JSON.parse(payload) as StreamChunk);
          } catch {
            // 忽略无法解析的行，避免整条流中断
          }
        }
      }
    }
  }

  async function sendMessage(text: string, docMd: string): Promise<void> {
    const content = text.trim();
    if (!content || sending.value) return;

    push({ id: genId(), role: 'user', content });
    const assistantId = genId();
    push({ id: assistantId, role: 'assistant', content: '', streaming: true });

    sending.value = true;
    try {
      const res = await fetch('/api/ai/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docMd, message: content, history: messages.value.slice(0, -1) }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        patchMessage(assistantId, {
          content: `请求失败（${res.status}）：${errText || res.statusText}`,
          streaming: false,
          error: true,
        });
        return;
      }

      const ctype = res.headers.get('content-type') || '';
      // 兼容：骨架若返回普通 JSON（非 SSE），直接整段展示
      if (ctype.includes('text/event-stream')) {
        await consumeStream(res, (chunk) => {
          if (chunk.type === 'text') {
            appendDelta(assistantId, chunk.delta);
          } else if (chunk.type === 'done') {
            patchMessage(assistantId, {
              streaming: false,
              ops: chunk.ops,
              content: chunk.reply ?? getMessage(assistantId)!.content,
            });
          } else if (chunk.type === 'error') {
            patchMessage(assistantId, {
              streaming: false,
              error: true,
              content: getMessage(assistantId)!.content + `\n\n[错误] ${chunk.message}`,
            });
          }
        });
        // 流结束仍标记为完成（防止 done 事件缺失时卡住）
        const cur = getMessage(assistantId);
        if (cur?.streaming) patchMessage(assistantId, { streaming: false });
      } else {
        const data = await res.json();
        patchMessage(assistantId, {
          streaming: false,
          ops: data.ops,
          content: data.reply ?? '(空回复)',
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      patchMessage(assistantId, {
        content: `网络错误：${msg}`,
        streaming: false,
        error: true,
      });
    } finally {
      sending.value = false;
    }
  }

  function getMessage(id: string): ChatMessage | undefined {
    return messages.value.find((m) => m.id === id);
  }

  function patchMessage(id: string, patch: Partial<ChatMessage>) {
    const m = getMessage(id);
    if (m) Object.assign(m, patch);
  }

  function appendDelta(id: string, delta: string) {
    const m = getMessage(id);
    if (m) m.content += delta;
  }

  function clear() {
    messages.value = [];
  }

  return { messages, sending, sendMessage, clear };
});
