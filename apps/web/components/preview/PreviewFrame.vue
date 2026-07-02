<script setup lang="ts">
import { computed, ref } from 'vue';
import { ExternalLink, RefreshCw, AlertTriangle, Loader2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { useDocumentStore } from '@/stores/document';
import type { PreviewStatus } from '@/stores/document';

const props = defineProps<{
  /** 渲染服务返回的预览 URL；ready 时有值 */
  url?: string | null;
  /** 渲染会话状态 */
  status?: PreviewStatus;
  /** pending 时的排队位置 */
  queuePosition?: number | null;
  /** failed 时的错误信息 */
  errorMessage?: string | null;
}>();

const emit = defineEmits<{ retry: [] }>();

const doc = useDocumentStore();

const status = computed<PreviewStatus>(() => props.status ?? 'idle');
const ready = computed(() => status.value === 'ready' && Boolean(props.url));
const pending = computed(() => status.value === 'pending' || status.value === 'starting' || status.value === 'restarting');
const failed = computed(() => status.value === 'failed');

const statusLabel = computed(() => {
  switch (status.value) {
    case 'ready': return '已就绪';
    case 'pending': return '排队中';
    case 'starting': return '启动中';
    case 'restarting': return '重启中';
    case 'failed': return '启动失败';
    case 'stopped': return '已释放';
    default: return '等待渲染服务';
  }
});

const statusTone = computed(() => {
  if (ready.value) return 'bg-emerald-500/15 text-emerald-500';
  if (failed.value) return 'bg-red-500/15 text-red-500';
  if (pending.value) return 'bg-amber-500/15 text-amber-500';
  return 'bg-muted text-muted-foreground';
});

// iframe key，用于手动刷新
const reloadKey = ref(0);
function reload() {
  reloadKey.value++;
}

// ready 后放开 same-origin：同源反代下 Slidev dev server 的 HMR/postMessage 需要；
// scripts 必须放开以运行 Slidev。其余按需。未就绪时不渲染 iframe。
const sandbox = 'allow-scripts allow-same-origin allow-popups allow-forms';
</script>

<template>
  <section class="flex h-full flex-col bg-background">
    <header class="flex items-center justify-between px-4 py-3">
      <div class="flex items-center gap-2 text-sm font-medium">
        <span>预览</span>
        <span :class="['rounded px-1.5 py-0.5 text-xs', statusTone]">{{ statusLabel }}</span>
      </div>
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="icon" class="h-7 w-7" :disabled="!ready" aria-label="刷新预览" @click="reload">
          <RefreshCw class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          :disabled="!ready"
          aria-label="新窗口打开"
          as="a"
          :href="url ?? undefined"
          target="_blank"
          rel="noopener"
        >
          <ExternalLink class="h-4 w-4" />
        </Button>
      </div>
    </header>

    <div class="relative flex-1 border-t border-border bg-muted/30">
      <!-- 就绪：iframe 接入专属预览 URL -->
      <iframe
        v-if="ready"
        :key="reloadKey"
        :src="url ?? ''"
        :sandbox="sandbox"
        class="h-full w-full border-0 bg-white"
        loading="lazy"
        referrerpolicy="no-referrer"
      />

      <!-- 排队 / 启动中 -->
      <div v-else-if="pending" class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <Loader2 class="h-7 w-7 animate-spin text-amber-500" />
        <p>{{ statusLabel }}…</p>
        <p v-if="status === 'pending' && queuePosition" class="text-xs">
          并发已达上限，当前排队位置：第 {{ queuePosition }} 位
        </p>
        <p v-else class="max-w-xs text-xs leading-relaxed">
          渲染调度服务正在按需启动 Slidev dev server，就绪后将自动接入预览。
        </p>
      </div>

      <!-- 失败：错误态 + 重试 -->
      <div v-else-if="failed" class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <div class="rounded-full bg-red-500/15 p-3">
          <AlertTriangle class="h-6 w-6 text-red-500" />
        </div>
        <p class="font-medium text-red-500">渲染服务启动失败</p>
        <p class="max-w-xs text-xs leading-relaxed text-muted-foreground">
          {{ errorMessage || '请检查渲染服务状态后重试。' }}
        </p>
        <Button variant="secondary" size="sm" class="mt-1" @click="emit('retry')">
          <RefreshCw class="mr-1.5 h-4 w-4" />
          重试
        </Button>
      </div>

      <!-- idle / stopped：等待接入 -->
      <div v-else class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <div class="rounded-full bg-muted p-3">
          <RefreshCw class="h-6 w-6 animate-pulse" />
        </div>
        <p>等待渲染服务就绪</p>
        <p class="max-w-xs text-xs leading-relaxed">
          渲染调度服务会按需启动 Slidev dev server 并返回专属预览 URL。
          当前文档共 {{ doc.slideCount }} 页，URL 就绪后将自动接入。
        </p>
      </div>
    </div>
  </section>
</template>
