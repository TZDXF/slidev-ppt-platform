import { defineStore } from 'pinia';
import { ref } from 'vue';
import { applyOps, type EditOp } from '@slidev-ppt/shared';
import { useDocumentStore } from './document';

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
  /** 破坏性操作待确认（pending_confirm chunk 暂存）；用户应用 / 取消后清除 */
  pendingConfirm?: {
    requestId: string;
    ops: EditOp[];
    message: string;
  };
}

interface StreamTextChunk { type: 'text'; delta: string }
interface StreamPendingConfirmChunk {
  type: 'pending_confirm';
  requestId: string;
  ops: EditOp[];
  message: string;
}
interface StreamDoneChunk {
  type: 'done';
  ops?: EditOp[];
  /** apply 后的完整新 MD（破坏性操作首次请求不发，确认回流后发） */
  md?: string;
  slides?: number;
  snapshotId?: string;
  previousMd?: string;
}
interface StreamErrorChunk { type: 'error'; message: string }
type StreamChunk =
  | StreamTextChunk
  | StreamPendingConfirmChunk
  | StreamDoneChunk
  | StreamErrorChunk;

function genId(): string {
  // 轻量 id 生成（crypto.randomUUID 在浏览器与 Node 均可用，降级兜底）
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 对话 store —— 会话级历史 + SSE 流式接收。
 *
 * sendMessage 向 /api/ai/update 发 POST，按 SSE chunk 增量更新 assistant 消息：
 *  - text             → 追加到 content（打字机效果）
 *  - pending_confirm  → 暂存破坏性 ops 为待确认，UI 弹确认卡片，不结束交互
 *  - done             → 写入 ops；若带 md 则回写 document store 触发预览刷新
 *  - error            → 标记错误，结束 streaming
 *
 * 破坏性操作（deleteSlide / moveSlide）流程：
 *   首次请求后端先发 pending_confirm 再紧跟一个 done（仅 ops，不 apply）——
 *   前者暂存待确认 ops，后者不结束交互；用户点「应用」后以
 *   { confirm: true, requestId } 重新请求，后端直接 apply 缓存 ops 并发最终 done（带 md）。
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

  /** 把单个 chunk 应用到指定 assistant 消息上 */
  function handleChunk(assistantId: string, chunk: StreamChunk): void {
    if (chunk.type === 'text') {
      appendDelta(assistantId, chunk.delta);
    } else if (chunk.type === 'pending_confirm') {
      patchMessage(assistantId, {
        pendingConfirm: {
          requestId: chunk.requestId,
          ops: chunk.ops,
          message: chunk.message,
        },
      });
    } else if (chunk.type === 'done') {
      // 破坏性操作：pending_confirm 后紧跟的 done 只回传 ops，不结束交互，
      // 等用户确认回流后的最终 done（带 md）再 apply。
      if (getMessage(assistantId)?.pendingConfirm) {
        patchMessage(assistantId, { ops: chunk.ops });
        return;
      }
      finishDone(assistantId, chunk);
    } else if (chunk.type === 'error') {
      patchMessage(assistantId, {
        streaming: false,
        error: true,
        content: getMessage(assistantId)!.content + `\n\n[错误] ${chunk.message}`,
      });
    }
  }

  /** done chunk：文档真相源以 chunk.md 为准；缺失则本地 applyOps 兜底 */
  function finishDone(assistantId: string, chunk: StreamDoneChunk): void {
    if (chunk.md) {
      useDocumentStore().setContent(chunk.md);
    } else if (chunk.ops?.length) {
      const docStore = useDocumentStore();
      docStore.setParsedDoc(applyOps(docStore.parsed, chunk.ops));
    }
    patchMessage(assistantId, {
      streaming: false,
      ops: chunk.ops,
    });
  }

  /** 发起一次 /api/ai/update 流式请求，把 chunk 分发到指定 assistant 消息 */
  async function streamUpdate(
    assistantId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const res = await fetch('/api/ai/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
      await consumeStream(res, (chunk) => handleChunk(assistantId, chunk));
      // 流结束仍标记为完成（防止 done 事件缺失时卡住；待确认态不覆盖）
      const cur = getMessage(assistantId);
      if (cur?.streaming && !cur.pendingConfirm) {
        patchMessage(assistantId, { streaming: false });
      }
    } else {
      const data = await res.json();
      finishDone(assistantId, {
        type: 'done',
        ops: data.ops,
        md: data.md,
      });
      patchMessage(assistantId, { content: data.reply ?? '(空回复)' });
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
      await streamUpdate(assistantId, {
        docMd,
        message: content,
        history: messages.value.slice(0, -1),
      });
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

  /** 用户点「应用」：以 { confirm: true, requestId } 重新请求，后端直接 apply 缓存 ops */
  async function confirmPending(messageId: string, docMd: string): Promise<void> {
    const m = getMessage(messageId);
    if (!m?.pendingConfirm || sending.value) return;
    const { requestId } = m.pendingConfirm;

    patchMessage(messageId, { pendingConfirm: undefined, streaming: true });
    sending.value = true;
    try {
      await streamUpdate(messageId, {
        docMd,
        message: '',
        history: [],
        confirm: true,
        requestId,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      patchMessage(messageId, {
        content: `${getMessage(messageId)!.content}\n\n[错误] 确认应用失败：${msg}`,
        streaming: false,
        error: true,
      });
    } finally {
      sending.value = false;
    }
  }

  /** 用户点「取消」：丢弃待确认 ops，结束本次 */
  function cancelPending(messageId: string): void {
    const m = getMessage(messageId);
    if (!m?.pendingConfirm) return;
    patchMessage(messageId, {
      pendingConfirm: undefined,
      streaming: false,
      content: m.content + '\n\n（已取消本次修改）',
    });
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

  return { messages, sending, sendMessage, confirmPending, cancelPending, clear };
});
