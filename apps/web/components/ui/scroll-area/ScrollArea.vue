<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

interface Props {
  class?: string;
  /** 滚动区域的内容class，默认占满高度 */
  contentClass?: string;
}

const props = defineProps<Props>();

const classes = computed(() =>
  cn('relative overflow-y-auto overflow-x-hidden', props.class),
);
</script>

<template>
  <div :class="classes">
    <div :class="cn('min-h-full w-full', props.contentClass)">
      <slot />
    </div>
  </div>
</template>
