import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { parseSlidev, serializeSlidev, type ParsedDoc } from '@slidev-ppt/shared';

/** 渲染会话状态（与 render-service SessionStatus 一致） */
export type PreviewStatus =
  | 'pending' // 排队中
  | 'starting' // 容器已拉起，等待 dev server 就绪
  | 'ready' // previewUrl 可用
  | 'restarting' // 崩溃重启中
  | 'failed' // 启动失败
  | 'stopped' // 已回收
  | 'idle'; // 尚未启动

/** 渲染服务返回体（与 server/utils/render.ts PreviewResponse 一致） */
interface PreviewResponse {
  docId: string;
  status: PreviewStatus;
  previewUrl: string | null;
  queuePosition?: number;
  message?: string;
}

/**
 * 当前文档 store —— MD 是唯一真相源。
 *
 * 编辑器、预览、AI 对话都读写这里的 docMd。编辑器双向绑定 setContent；
 * AI 更新链路拿到 ops 后由 applyOps 改写 ParsedDoc 再 serialize 回来。
 *
 * 同时负责接入渲染服务：启动会话 → 轮询至 ready → 把 previewUrl 交给 PreviewFrame；
 * MD 变更 debounce 后 PUT 到渲染服务触发 HMR；离开编辑器时 DELETE 释放容器。
 */
const DEFAULT_MD = `---
theme: seriph
title: 未命名演示
---

# 欢迎使用 Slidev PPT 平台

AI 对话生成 PPT，左侧对话、中间编辑、右侧预览。

---

## 第二页

在这里编辑 Markdown，或在左侧对话让 AI 帮你修改。
`;

const POLL_INTERVAL_MS = 1000;
const SYNC_DEBOUNCE_MS = 500;
const MAX_POLL_ERRORS = 5;

function genDocId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'doc-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useDocumentStore = defineStore('document', () => {
  const docMd = ref<string>(DEFAULT_MD);
  /** 文档 ID，渲染服务以它为粒度复用容器；惰性生成，避免 SSR/客户端 hydration 不一致 */
  const docId = ref<string>('');

  const parsed = computed<ParsedDoc>(() => parseSlidev(docMd.value));

  const slideCount = computed(() => parsed.value.slides.length);
  const theme = computed(() => parsed.value.frontmatter.raw.match(/^theme:\s*(.+)$/m)?.[1]?.trim() ?? '');

  // ---- 渲染服务接入 ----
  const previewUrl = ref<string | null>(null);
  const previewStatus = ref<PreviewStatus>('idle');
  const queuePosition = ref<number | null>(null);
  const previewError = ref<string | null>(null);

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let pollErrors = 0;

  function applyResponse(data: PreviewResponse): void {
    previewStatus.value = data.status;
    previewUrl.value = data.previewUrl ?? null;
    queuePosition.value = data.queuePosition ?? null;
    if (data.status === 'failed') {
      previewError.value = data.message ?? '渲染服务启动失败';
    } else if (data.status === 'ready') {
      previewError.value = null;
    }
  }

  function clearPoll(): void {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  function schedulePoll(): void {
    clearPoll();
    pollTimer = setTimeout(() => { void pollPreview(); }, POLL_INTERVAL_MS);
  }

  async function pollPreview(): Promise<void> {
    if (!docId.value) return;
    try {
      const res = await fetch(`/api/preview/${encodeURIComponent(docId.value)}`);
      const data = (await res.json()) as PreviewResponse;
      pollErrors = 0;
      applyResponse(data);
      if (data.status === 'pending' || data.status === 'starting' || data.status === 'restarting') {
        schedulePoll();
      } else if (data.status === 'ready') {
        // ready 后补推一次最新 MD，确保容器内容与本地一致
        void syncMdNow();
      }
    } catch {
      pollErrors += 1;
      if (pollErrors >= MAX_POLL_ERRORS) {
        previewStatus.value = 'failed';
        previewError.value = '轮询渲染服务连续失败，请检查渲染服务状态后重试';
      } else {
        schedulePoll();
      }
    }
  }

  /** 启动 / 复用渲染会话；pending/starting 时自动轮询至 ready 或 failed */
  async function startPreview(): Promise<void> {
    if (!docId.value) docId.value = genDocId();
    // 已在启动中或就绪，不重复触发
    if (previewStatus.value === 'starting' || previewStatus.value === 'pending' || previewStatus.value === 'ready' || previewStatus.value === 'restarting') return;

    previewError.value = null;
    previewStatus.value = 'starting';
    try {
      const res = await fetch(`/api/preview/${encodeURIComponent(docId.value)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ md: docMd.value }),
      });
      const data = (await res.json()) as PreviewResponse;
      applyResponse(data);
      if (data.status === 'pending' || data.status === 'starting' || data.status === 'restarting') {
        schedulePoll();
      } else if (data.status === 'ready') {
        void syncMdNow();
      }
    } catch (e: unknown) {
      previewStatus.value = 'failed';
      previewError.value = e instanceof Error ? e.message : String(e);
    }
  }

  /** 失败后重试 */
  async function retryPreview(): Promise<void> {
    clearPoll();
    previewStatus.value = 'idle';
    previewUrl.value = null;
    queuePosition.value = null;
    previewError.value = null;
    pollErrors = 0;
    await startPreview();
  }

  async function syncMdNow(): Promise<void> {
    if (!docId.value) return;
    if (previewStatus.value !== 'ready' && previewStatus.value !== 'starting' && previewStatus.value !== 'restarting') return;
    try {
      await fetch(`/api/preview/${encodeURIComponent(docId.value)}/md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ md: docMd.value }),
      });
    } catch {
      // 单次推送失败不致命，下一次编辑会再推；HMR 容错
    }
  }

  function scheduleSync(): void {
    if (previewStatus.value !== 'ready' && previewStatus.value !== 'starting' && previewStatus.value !== 'restarting') return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { void syncMdNow(); }, SYNC_DEBOUNCE_MS);
  }

  /** 离开编辑器 / 文档关闭时调用，释放容器（与服务端空闲回收双保险） */
  async function stopPreview(): Promise<void> {
    clearPoll();
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    if (previewStatus.value === 'stopped' || previewStatus.value === 'idle' || previewStatus.value === 'failed' || !docId.value) {
      previewUrl.value = null;
      return;
    }
    try {
      await fetch(`/api/preview/${encodeURIComponent(docId.value)}`, { method: 'DELETE' });
    } catch {
      // 忽略：服务端空闲回收兜底
    }
    previewStatus.value = 'stopped';
    previewUrl.value = null;
    queuePosition.value = null;
  }

  // MD 变更（编辑器输入 / AI applyOps）→ debounce 推送到渲染服务触发 HMR
  watch(docMd, () => scheduleSync());

  /** 编辑器双向绑定入口 */
  function setContent(md: string) {
    docMd.value = md;
  }

  /** AI 链路：把 applyOps 后的 ParsedDoc 写回 */
  function setParsedDoc(doc: ParsedDoc) {
    docMd.value = serializeSlidev(doc);
  }

  return {
    docMd,
    docId,
    parsed,
    slideCount,
    theme,
    previewUrl,
    previewStatus,
    queuePosition,
    previewError,
    setContent,
    setParsedDoc,
    startPreview,
    stopPreview,
    retryPreview,
  };
});
