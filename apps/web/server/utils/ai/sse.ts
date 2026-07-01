/**
 * SSE 流式响应工具。
 *
 * Nitro 支持直接返回 ReadableStream；这里封装成事件写入器，
 * 让 AI 链路端点用 send(event, data) / close() 即可。
 */
import type { H3Event } from 'h3';

export interface SseWriter {
  stream: ReadableStream<Uint8Array>;
  send: (event: string, data: unknown) => void;
  close: () => void;
}

export function createSseStream(_event: H3Event): SseWriter {
  // 响应头在返回 ReadableStream 前设置
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  function send(event: string, data: unknown): void {
    if (closed) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(payload));
  }

  function close(): void {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // 客户端已断开
    }
  }

  return { stream, send, close };
}

/** 在 handler 里调用：设置 SSE 响应头。 */
export function setSseHeaders(event: H3Event): void {
  setResponseHeader(event, 'content-type', 'text/event-stream; charset=utf-8');
  setResponseHeader(event, 'cache-control', 'no-cache, no-transform');
  setResponseHeader(event, 'connection', 'keep-alive');
  setResponseHeader(event, 'x-accel-buffering', 'no');
}
