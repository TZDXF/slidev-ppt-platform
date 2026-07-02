<script setup lang="ts">
import { computed } from 'vue';
import { User, Sparkles } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chat';
import type { ChatMessage } from '@/stores/chat';

const props = defineProps<{ message: ChatMessage }>();

const chat = useChatStore();
const isUser = computed(() => props.message.role === 'user');
// 确认按钮在请求中禁用，避免重复触发
const confirmDisabled = computed(() => chat.sending);

defineEmits<{
  confirm: [messageId: string];
  cancel: [messageId: string];
}>();
</script>

<template>
  <div :class="cn('flex w-full gap-3', isUser && 'flex-row-reverse')">
    <div
      :class="cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
        isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground',
      )"
    >
      <User v-if="isUser" class="h-4 w-4" />
      <Sparkles v-else class="h-4 w-4" />
    </div>

    <div :class="cn('flex max-w-[85%] flex-col gap-1', isUser && 'items-end')">
      <div
        :class="cn(
          'whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : message.error
              ? 'bg-destructive/20 text-foreground'
              : 'bg-muted text-foreground',
        )"
      >
        <span v-if="!message.content && message.streaming" class="text-muted-foreground">思考中…</span>
        <template v-else>{{ message.content }}</template>
        <span
          v-if="message.streaming && message.content"
          class="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-text-bottom"
        />
      </div>

      <!-- AI 返回的编辑 ops 摘要（破坏性 ops 由上层弹确认后再 apply） -->
      <div
        v-if="message.ops && message.ops.length"
        class="rounded-md border border-dashed border-border bg-background/50 px-2 py-1 text-xs text-muted-foreground"
      >
        建议 {{ message.ops.length }} 个编辑操作：
        <span class="text-foreground">
          {{ message.ops.map((o) => o.type).join('、') }}
        </span>
      </div>

      <!-- 破坏性操作待确认卡片 -->
      <div
        v-if="message.pendingConfirm"
        class="flex flex-col gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs"
      >
        <p class="text-foreground">{{ message.pendingConfirm.message }}</p>
        <div class="flex items-center gap-2">
          <Button
            size="sm"
            class="h-7"
            :disabled="confirmDisabled"
            @click="$emit('confirm', message.id)"
          >
            应用
          </Button>
          <Button
            size="sm"
            variant="ghost"
            class="h-7"
            :disabled="confirmDisabled"
            @click="$emit('cancel', message.id)"
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
