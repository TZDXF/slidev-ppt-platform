<script setup lang="ts">
import { Primitive, type PrimitiveProps } from 'reka-ui';
import { computed } from 'vue';
import { cn } from '@/lib/utils';
import { buttonVariants, type ButtonVariants } from './index';

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant'];
  size?: ButtonVariants['size'];
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
});

const classes = computed(() =>
  cn(buttonVariants({ variant: props.variant, size: props.size }), props.class),
);
</script>

<template>
  <Primitive :as="as" :as-child="asChild" :class="classes">
    <slot />
  </Primitive>
</template>
