<script setup lang="ts">
import { ref } from 'vue';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { usePublishStore } from '@/stores/publish';

const pub = usePublishStore();

const copied = ref(false);

async function copyUrl() {
  if (!pub.publicUrl) return;
  try {
    await navigator.clipboard.writeText(pub.publicUrl);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  } catch {
    // 剪贴板不可用时静默失败，用户仍可手动选中复制
  }
}
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition name="publish-dialog">
        <div
          v-if="pub.dialogOpen"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="发布"
        >
          <!-- 遮罩 -->
          <div
            class="absolute inset-0 bg-black/50"
            @click="!pub.publishing && pub.closeDialog()"
          />

          <!-- 卡片 -->
          <div
            class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-lg"
          >
            <div class="flex items-start justify-between gap-3">
              <h2 class="text-base font-semibold">发布</h2>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 shrink-0"
                aria-label="关闭"
                :disabled="pub.publishing"
                @click="pub.closeDialog()"
              >
                <X class="h-4 w-4" />
              </Button>
            </div>

            <!-- 进行中：queued / building -->
            <div v-if="pub.publishing" class="mt-4 flex items-start gap-3">
              <Loader2 class="mt-0.5 h-5 w-5 animate-spin text-primary" />
              <div class="space-y-1">
                <p class="text-sm font-medium">发布中…</p>
                <p class="text-xs text-muted-foreground">{{ pub.statusText }}</p>
              </div>
            </div>

            <!-- 成功 -->
            <div v-else-if="pub.state === 'published'" class="mt-4 space-y-3">
              <div class="flex items-start gap-3">
                <CheckCircle2 class="mt-0.5 h-5 w-5 text-emerald-500" />
                <div class="space-y-0.5">
                  <p class="text-sm font-medium">发布成功</p>
                  <p v-if="pub.cached" class="text-xs text-emerald-600">
                    秒回（命中缓存）
                  </p>
                  <p v-else class="text-xs text-muted-foreground">构建完成，已上传 CDN</p>
                </div>
              </div>

              <div v-if="pub.publicUrl" class="space-y-2">
                <p class="text-xs text-muted-foreground">公开访问链接</p>
                <div class="flex items-center gap-2">
                  <code
                    class="min-w-0 flex-1 truncate rounded border border-border bg-muted px-2 py-1.5 text-xs"
                  >{{ pub.publicUrl }}</code>
                  <Button
                    variant="outline"
                    size="icon"
                    class="h-8 w-8 shrink-0"
                    aria-label="复制链接"
                    @click="copyUrl"
                  >
                    <Copy class="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    class="h-8 w-8 shrink-0"
                    aria-label="新窗口打开"
                    as="a"
                    :href="pub.publicUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink class="h-4 w-4" />
                  </Button>
                </div>
                <p v-if="copied" class="text-xs text-emerald-600">已复制到剪贴板</p>
                <p class="text-xs text-muted-foreground">
                  访问不经过 Node 进程，直接由 CDN 提供。
                </p>
              </div>
            </div>

            <!-- 失败 -->
            <div v-else-if="pub.state === 'failed'" class="mt-4 space-y-3">
              <div class="flex items-start gap-3">
                <XCircle class="mt-0.5 h-5 w-5 text-destructive" />
                <div class="space-y-0.5">
                  <p class="text-sm font-medium">发布失败</p>
                  <p class="text-xs text-muted-foreground">
                    {{ pub.error || '构建过程中出错，请重试。' }}
                  </p>
                </div>
              </div>
              <Button size="sm" class="gap-1.5" @click="pub.retry()">
                <RefreshCw class="h-4 w-4" />
                重试
              </Button>
            </div>

            <!-- 初始态兜底 -->
            <div v-else class="mt-4 flex items-start gap-3">
              <Loader2 class="mt-0.5 h-5 w-5 animate-spin text-primary" />
              <p class="text-sm text-muted-foreground">正在提交发布请求…</p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.publish-dialog-enter-active,
.publish-dialog-leave-active {
  transition: opacity 0.15s ease;
}
.publish-dialog-enter-from,
.publish-dialog-leave-to {
  opacity: 0;
}
</style>
