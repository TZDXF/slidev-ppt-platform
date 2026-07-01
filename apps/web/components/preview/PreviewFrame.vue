<script setup lang="ts">
import { computed, ref } from 'vue';
import { ExternalLink, RefreshCw } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { useDocumentStore } from '@/stores/document';

const props = defineProps<{
  /** 渲染服务返回的预览 URL；为空时显示占位 */
  url?: string;
}>();

const doc = useDocumentStore();
const ready = computed(() => Boolean(props.url));

// iframe key，用于手动刷新
const reloadKey = ref(0);
function reload() {
  reloadKey.value++;
}

// 仅在需要与 Slidev dev server 同源交互（HMR/postMessage）时放开 same-origin；
// 否则保持最严格沙箱，禁止脚本逃逸与 top 导航。
const sandbox = computed(() =>
  ready.value
    ? 'allow-scripts allow-same-origin allow-popups allow-forms'
    : 'allow-scripts',
);
</script>

<template>
  <section class="flex h-full flex-col bg-background">
    <header class="flex items-center justify-between px-4 py-3">
      <div class="flex items-center gap-2 text-sm font-medium">
        <span>预览</span>
        <span
          v-if="ready"
          class="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-500"
        >已就绪</span>
        <span v-else class="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-500">等待渲染服务</span>
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
          :href="url"
          target="_blank"
          rel="noopener"
        >
          <ExternalLink class="h-4 w-4" />
        </Button>
      </div>
    </header>

    <div class="relative flex-1 border-t border-border bg-muted/30">
      <iframe
        v-if="ready"
        :key="reloadKey"
        :src="url"
        :sandbox="sandbox"
        class="h-full w-full border-0 bg-white"
        loading="lazy"
        referrerpolicy="no-referrer"
      />
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
