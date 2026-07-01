<script setup lang="ts">
import { computed } from 'vue';

/**
 * ProgressBar — 进度条。
 *
 * 线性进度条，显示 0–100 的百分比。
 *
 * @props
 * - value: number  进度值（0–100），自动 clamp 到区间。
 * - label?: string  左侧标签文案。
 * - color?: string  进度填充色，缺省走主题色。
 */
const props = withDefaults(
  defineProps<{
    value: number;
    label?: string;
    color?: string;
  }>(),
  {
    label: '',
    color: 'var(--slidev-theme-primary, #42b883)',
  },
);

const clamped = computed(() => {
  const v = Number(props.value) || 0;
  return Math.min(100, Math.max(0, v));
});
</script>

<template>
  <div class="spp-progress" :style="{ '--pb-color': color }">
    <div v-if="label" class="label">{{ label }}</div>
    <div class="track">
      <div class="fill" :style="{ width: clamped + '%' }" />
    </div>
    <div class="pct">{{ clamped }}%</div>
  </div>
</template>

<style scoped>
.spp-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  color: var(--slidev-code-color, inherit);
}
.label {
  font-size: 13px;
  opacity: 0.8;
  white-space: nowrap;
}
.track {
  flex: 1;
  height: 10px;
  background: var(--slidev-code-background, rgba(127, 127, 127, 0.15));
  border-radius: 999px;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--pb-color);
  border-radius: 999px;
  transition: width 0.3s ease;
}
.pct {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
  min-width: 3ch;
  text-align: right;
}
</style>
