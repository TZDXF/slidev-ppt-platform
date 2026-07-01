<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

interface Props {
  modelValue?: string;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
});

const emits = defineEmits<{
  'update:modelValue': [value: string];
}>();

const classes = computed(() =>
  cn(
    'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
    props.class,
  ),
);

function onInput(e: Event) {
  emits('update:modelValue', (e.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <textarea :value="modelValue" :class="classes" @input="onInput" />
</template>
