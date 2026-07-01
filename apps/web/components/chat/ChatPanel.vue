<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { MessageSquare, Trash2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import ChatMessage from './ChatMessage.vue';
import ChatInput from './ChatInput.vue';
import { useChatStore } from '@/stores/chat';
import { useDocumentStore } from '@/stores/document';

const chat = useChatStore();
const doc = useDocumentStore();

const draft = ref('');
const scrollRef = ref<InstanceType<typeof ScrollArea> | null>(null);

function scrollToBottom() {
  nextTick(() => {
    const el = scrollRef.value?.$el as HTMLElement | undefined;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

watch(() => chat.messages.length, scrollToBottom);
// 流式追加时也跟到底
watch(
  () => chat.messages.map((m) => m.content).join(''),
  scrollToBottom,
);

async function handleSend() {
  if (!draft.value.trim() || chat.sending) return;
  const text = draft.value;
  draft.value = '';
  await chat.sendMessage(text, doc.docMd);
}
</script>

<template>
  <section class="flex h-full flex-col bg-background">
    <header class="flex items-center justify-between px-4 py-3">
      <div class="flex items-center gap-2">
        <MessageSquare class="h-4 w-4 text-muted-foreground" />
        <span class="text-sm font-medium">AI 对话</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        aria-label="清空对话"
        :disabled="chat.sending || !chat.messages.length"
        @click="chat.clear()"
      >
        <Trash2 class="h-4 w-4" />
      </Button>
    </header>

    <Separator />

    <ScrollArea ref="scrollRef" class="flex-1" content-class="p-4 space-y-4">
      <template v-if="chat.messages.length">
        <ChatMessage
          v-for="m in chat.messages"
          :key="m.id"
          :message="m"
        />
      </template>
      <div v-else class="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <MessageSquare class="h-8 w-8 opacity-40" />
        <p>告诉 AI 你想做什么，</p>
        <p class="text-xs">例如「把第二页改成三段式布局」。</p>
      </div>
    </ScrollArea>

    <ChatInput v-model="draft" :sending="chat.sending" @send="handleSend" />
  </section>
</template>
