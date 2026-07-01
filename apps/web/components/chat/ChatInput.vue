<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Send, Square } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

const props = defineProps<{
  modelValue: string;
  sending: boolean;
  placeholder?: string;
}>();

const emits = defineEmits<{
  'update:modelValue': [value: string];
  send: [];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

const canSend = computed(() => props.modelValue.trim().length > 0 && !props.sending);

function autosize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function onInput(e: Event) {
  emits('update:modelValue', (e.target as HTMLTextAreaElement).value);
  nextTick(autosize);
}

function onKeydown(e: KeyboardEvent) {
  // 回车发送、Shift+回车换行；输入法组合中不触发
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
}

function submit() {
  if (!canSend.value) return;
  emits('send');
  nextTick(autosize);
}
</script>

<template>
  <div class="border-t border-border p-3">
    <div class="flex items-end gap-2 rounded-lg border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
      <textarea
        ref="textareaRef"
        :value="modelValue"
        :placeholder="placeholder ?? '输入消息，回车发送，Shift+回车换行'"
        :disabled="sending"
        rows="1"
        class="flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
        @input="onInput"
        @keydown="onKeydown"
      />
      <Button
        size="icon"
        :variant="canSend ? 'default' : 'secondary'"
        :disabled="!canSend"
        class="h-8 w-8 shrink-0"
        :aria-label="sending ? '发送中' : '发送'"
        @click="submit"
      >
        <Square v-if="sending" class="h-4 w-4" />
        <Send v-else class="h-4 w-4" />
      </Button>
    </div>
  </div>
</template>
