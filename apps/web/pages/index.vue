<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { PanelLeft, Code2, Eye } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import ChatPanel from '@/components/chat/ChatPanel.vue';
import MdEditor from '@/components/editor/MdEditor.vue';
import PreviewFrame from '@/components/preview/PreviewFrame.vue';
import { useDocumentStore } from '@/stores/document';

const doc = useDocumentStore();

// 编辑器默认隐藏（"原理编辑器默认不展示"）
const editorVisible = ref(false);
// 窄屏折叠左栏
const chatOpen = ref(true);

// 打开编辑器即启动渲染会话；离开时释放容器（与服务端空闲回收双保险）
onMounted(() => { void doc.startPreview(); });
onBeforeUnmount(() => { void doc.stopPreview(); });
</script>

<template>
  <div class="flex h-screen flex-col bg-background text-foreground">
    <!-- 顶栏 -->
    <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8 md:hidden"
        aria-label="切换对话栏"
        @click="chatOpen = !chatOpen"
      >
        <PanelLeft class="h-4 w-4" />
      </Button>

      <span class="text-sm font-semibold">Slidev PPT 平台</span>
      <span class="hidden text-xs text-muted-foreground sm:inline">
        主题：{{ doc.theme || 'default' }} · {{ doc.slideCount }} 页
      </span>

      <div class="ml-auto flex items-center gap-1">
        <Button
          :variant="editorVisible ? 'secondary' : 'ghost'"
          size="sm"
          class="h-8 gap-1.5"
          @click="editorVisible = !editorVisible"
        >
          <Code2 class="h-4 w-4" />
          <span class="hidden sm:inline">编辑器</span>
        </Button>
        <Button variant="ghost" size="icon" class="h-8 w-8" aria-label="预览" disabled>
          <Eye class="h-4 w-4" />
        </Button>
      </div>
    </header>

    <!-- 三栏主体 -->
    <div class="relative flex flex-1 overflow-hidden">
      <!-- 左：AI 对话（窄屏为抽屉式覆盖） -->
      <aside
        :class="[
          'shrink-0 border-r border-border bg-background',
          'absolute inset-y-0 left-0 z-20 w-[85%] max-w-[420px] md:static md:z-auto md:w-[380px]',
          chatOpen ? 'block' : 'hidden md:block',
        ]"
      >
        <ChatPanel class="h-full" />
      </aside>

      <!-- 中：MD 编辑器（默认隐藏） -->
      <main
        v-if="editorVisible"
        class="flex min-w-0 flex-1 flex-col border-r border-border"
      >
        <div class="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-xs text-muted-foreground">
          <Code2 class="h-3.5 w-3.5" />
          Markdown 源码编辑器
        </div>
        <div class="min-h-0 flex-1">
          <ClientOnly>
            <MdEditor :model-value="doc.docMd" @update:model-value="doc.setContent($event)" />
            <template #fallback>
              <div class="flex h-full items-center justify-center text-sm text-muted-foreground">加载编辑器…</div>
            </template>
          </ClientOnly>
        </div>
      </main>

      <!-- 右：Slidev 预览 -->
      <main class="flex min-w-0 flex-1 flex-col">
        <PreviewFrame
          :url="doc.previewUrl"
          :status="doc.previewStatus"
          :queue-position="doc.queuePosition"
          :error-message="doc.previewError"
          class="h-full"
          @retry="doc.retryPreview"
        />
      </main>

      <!-- 窄屏遮罩：对话栏展开时点击空白关闭 -->
      <div
        v-if="chatOpen"
        class="fixed inset-0 z-10 bg-black/30 md:hidden"
        @click="chatOpen = false"
      />
    </div>
  </div>
</template>
