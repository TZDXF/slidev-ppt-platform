import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { componentSchemas } from '@slidev-ppt/components/schemas';
import { useDocumentStore } from './document';

/**
 * 发布 store —— 调 POST /api/ppt/publish 入队，轮询 GET /api/ppt/:id 到终态。
 *
 * 状态机：idle → queued → building → published | failed。
 * 命中缓存时 POST 直接返回 published + cached=true，跳过轮询。
 * 发布期间 publishing=true，顶栏按钮禁用防重复提交。
 * 关闭结果浮层不中断后台轮询；重开浮层展示最新状态。
 */

/** 发布态（与 shared PublishStatus 对齐，外加 idle 初始态） */
export type PublishState = 'idle' | 'queued' | 'building' | 'published' | 'failed';

/** POST /api/ppt/publish 返回体 */
interface PublishResponse {
  pptId: string;
  jobId?: string | null;
  status: 'queued' | 'published';
  publicUrl?: string;
  cached?: boolean;
}

/** GET /api/ppt/:id 返回体 */
interface PublishStatusResponse {
  pptId: string;
  status: PublishState;
  publicUrl?: string | null;
  cached?: boolean;
  error?: string | null;
}

/** 内置组件清单，随发布一并提交，参与内容哈希（缓存命中判断） */
const BUILTIN_COMPONENTS = componentSchemas.map((c) => c.name);

const POLL_INTERVAL_MS = 1000;
/** 轮询上限 ~5 分钟，避免后端异常时无限轮询 */
const MAX_POLLS = 300;

export const usePublishStore = defineStore('publish', () => {
  const doc = useDocumentStore();

  const state = ref<PublishState>('idle');
  const publicUrl = ref<string | null>(null);
  const cached = ref(false);
  const error = ref<string | null>(null);
  /** 结果浮层开关 */
  const dialogOpen = ref(false);

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollCount = 0;

  const publishing = computed(
    () => state.value === 'queued' || state.value === 'building',
  );

  /** 进度文案 */
  const statusText = computed(() => {
    switch (state.value) {
      case 'queued': return '已入队，等待构建 worker 拾取…';
      case 'building': return '正在构建 Slidev 产物并上传 CDN…';
      case 'published': return cached.value ? '秒回（命中缓存）' : '发布完成';
      case 'failed': return '发布失败';
      default: return '';
    }
  });

  function clearPoll(): void {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  function schedulePoll(): void {
    clearPoll();
    pollTimer = setTimeout(() => { void pollStatus(); }, POLL_INTERVAL_MS);
  }

  async function pollStatus(): Promise<void> {
    const pptId = doc.pptId;
    if (!pptId) return;
    pollCount += 1;
    if (pollCount > MAX_POLLS) {
      state.value = 'failed';
      error.value = '发布超时，请稍后在发布历史查看状态或重试';
      clearPoll();
      return;
    }
    try {
      const res = await fetch(`/api/ppt/${encodeURIComponent(pptId)}`);
      if (!res.ok) throw new Error(`状态查询失败 (${res.status})`);
      const data = (await res.json()) as PublishStatusResponse;
      state.value = data.status;
      if (data.status === 'published') {
        publicUrl.value = data.publicUrl ?? null;
        cached.value = data.cached ?? false;
        clearPoll();
        return;
      }
      if (data.status === 'failed') {
        error.value = data.error ?? '构建失败';
        clearPoll();
        return;
      }
      schedulePoll();
    } catch {
      // 单次查询失败不致命，退避后继续轮询
      schedulePoll();
    }
  }

  /** 触发发布：打开浮层 → POST 入队 → 轮询至终态 */
  async function publish(): Promise<void> {
    if (publishing.value) return;
    clearPoll();
    error.value = null;
    publicUrl.value = null;
    cached.value = false;
    state.value = 'idle';
    dialogOpen.value = true;

    const pptId = doc.ensurePptId();
    try {
      const res = await fetch('/api/ppt/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pptId,
          md: doc.docMd,
          components: BUILTIN_COMPONENTS,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(errBody.error || `发布请求失败 (${res.status})`);
      }
      const data = (await res.json()) as PublishResponse;

      if (data.status === 'published' && data.publicUrl) {
        // 命中缓存：直接终态
        state.value = 'published';
        publicUrl.value = data.publicUrl;
        cached.value = data.cached ?? true;
        return;
      }

      state.value = 'queued';
      pollCount = 0;
      schedulePoll();
    } catch (e: unknown) {
      state.value = 'failed';
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  /** 失败后重试 */
  async function retry(): Promise<void> {
    clearPoll();
    state.value = 'idle';
    error.value = null;
    publicUrl.value = null;
    cached.value = false;
    await publish();
  }

  /** 关闭浮层；后台轮询不中断 */
  function closeDialog(): void {
    dialogOpen.value = false;
  }

  /** 重置到初始态（用于已终态后清理） */
  function reset(): void {
    clearPoll();
    state.value = 'idle';
    publicUrl.value = null;
    cached.value = false;
    error.value = null;
  }

  return {
    state,
    publicUrl,
    cached,
    error,
    dialogOpen,
    publishing,
    statusText,
    publish,
    retry,
    closeDialog,
    reset,
  };
});
