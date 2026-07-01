<script setup lang="ts">
import { computed } from 'vue';

/**
 * StatCard — 统计卡片。
 *
 * 突出展示单个数值指标，支持单位与趋势标注。
 *
 * @props
 * - value: string | number  主数值。
 * - label: string  指标名称。
 * - unit?: string  数值单位，如 "%"、"ms"。
 * - trend?: number | 'up' | 'down'  趋势：正数/负数自动判定方向，或显式传 'up'/'down'。
 */
const props = defineProps<{
  value: string | number;
  label: string;
  unit?: string;
  trend?: number | 'up' | 'down';
}>();

const trendDir = computed(() => {
  if (props.trend === 'up') return 'up';
  if (props.trend === 'down') return 'down';
  if (typeof props.trend === 'number') return props.trend >= 0 ? 'up' : 'down';
  return null;
});

const trendText = computed(() => {
  if (typeof props.trend === 'number') return `${props.trend >= 0 ? '+' : ''}${props.trend}`;
  if (props.trend === 'up') return '↑';
  if (props.trend === 'down') return '↓';
  return '';
});
</script>

<template>
  <div class="spp-stat-card">
    <div class="label">{{ label }}</div>
    <div class="value">
      {{ value }}<span v-if="unit" class="unit">{{ unit }}</span>
    </div>
    <div
      v-if="trendDir"
      class="trend"
      :class="trendDir"
    >{{ trendText }}</div>
  </div>
</template>

<style scoped>
.spp-stat-card {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px;
  border-radius: 12px;
  background: var(--slidev-code-background, rgba(127, 127, 127, 0.08));
  color: var(--slidev-code-color, inherit);
  border: 1px solid var(--slidev-code-background, rgba(127, 127, 127, 0.12));
}
.label {
  font-size: 13px;
  opacity: 0.7;
}
.value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
}
.unit {
  font-size: 14px;
  font-weight: 500;
  margin-left: 4px;
  opacity: 0.8;
}
.trend {
  font-size: 12px;
  font-weight: 600;
}
.trend.up {
  color: #16a34a;
}
.trend.down {
  color: #dc2626;
}
</style>
