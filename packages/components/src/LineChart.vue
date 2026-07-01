<script setup lang="ts">
import { computed } from 'vue';

/**
 * LineChart — 折线图。
 *
 * 纯 SVG 自绘，无运行时图表库依赖。支持可选面积填充与数据点标记。
 *
 * @props
 * - data: { label: string; value: number }[]  折线数据，按数组顺序连线。
 * - color?: string  折线颜色（CSS 颜色字符串），缺省走主题色。
 * - height?: number  SVG 视口高度（px），默认 300。
 * - unit?: string  数值单位，悬浮 title 显示。
 * - area?: boolean  是否填充折线下方面积，默认 true。
 *
 * 数据为空时渲染占位提示，不崩溃。
 */
interface LineDatum {
  label: string;
  value: number;
}

const props = withDefaults(
  defineProps<{
    data: LineDatum[];
    color?: string;
    height?: number;
    unit?: string;
    area?: boolean;
  }>(),
  {
    color: 'var(--slidev-theme-primary, #42b883)',
    height: 300,
    unit: '',
    area: true,
  },
);

const width = 480;
const padding = { top: 16, right: 16, bottom: 36, left: 40 };

const maxValue = computed(() => {
  if (!props.data || props.data.length === 0) return 1;
  const m = Math.max(...props.data.map((d) => Number(d.value) || 0));
  return m <= 0 ? 1 : m;
});

const innerW = width - padding.left - padding.right;
const innerH = computed(() => props.height - padding.top - padding.bottom);

const points = computed(() => {
  const n = props.data?.length ?? 0;
  if (n === 0) return [];
  const step = n === 1 ? 0 : innerW / (n - 1);
  return props.data.map((d, i) => {
    const v = Number(d.value) || 0;
    return {
      x: padding.left + step * i,
      y: padding.top + innerH.value - (v / maxValue.value) * innerH.value,
      label: d.label,
      value: v,
    };
  });
});

const linePath = computed(() =>
  points.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' '),
);

const areaPath = computed(() => {
  if (points.value.length === 0) return '';
  const baseY = padding.top + innerH.value;
  const first = points.value[0]!;
  const last = points.value[points.value.length - 1]!;
  return `M${first.x},${baseY} ` +
    points.value.map((p) => `L${p.x},${p.y}`).join(' ') +
    ` L${last.x},${baseY} Z`;
});

const yTicks = computed(() => {
  const ticks = [];
  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4;
    ticks.push({
      y: padding.top + innerH.value * (1 - ratio),
      label: Math.round(maxValue.value * ratio),
    });
  }
  return ticks;
});
</script>

<template>
  <div class="spp-line-chart" :style="{ '--line-color': color }">
    <svg
      v-if="data && data.length"
      :viewBox="`0 0 ${width} ${height}`"
      :style="{ height: height + 'px' }"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="折线图"
    >
      <!-- 网格线 + Y 轴刻度 -->
      <g class="grid">
        <line
          v-for="(t, i) in yTicks"
          :key="i"
          :x1="padding.left"
          :x2="width - padding.right"
          :y1="t.y"
          :y2="t.y"
        />
        <text
          v-for="(t, i) in yTicks"
          :key="`l${i}`"
          :x="padding.left - 6"
          :y="t.y + 4"
          text-anchor="end"
          class="tick"
        >{{ t.label }}</text>
      </g>

      <!-- 面积填充 -->
      <path v-if="area && areaPath" :d="areaPath" class="area" />

      <!-- 折线 -->
      <path :d="linePath" class="line" />

      <!-- 数据点 -->
      <g>
        <circle
          v-for="(p, i) in points"
          :key="i"
          :cx="p.x"
          :cy="p.y"
          r="3"
          class="dot"
        >
          <title>{{ p.label }}: {{ p.value }}{{ unit }}</title>
        </circle>
      </g>

      <!-- X 轴标签 -->
      <g>
        <text
          v-for="(p, i) in points"
          :key="`x${i}`"
          :x="p.x"
          :y="height - padding.bottom + 18"
          text-anchor="middle"
          class="tick"
        >{{ p.label }}</text>
      </g>
    </svg>
    <div v-else class="empty">无数据</div>
  </div>
</template>

<style scoped>
.spp-line-chart {
  width: 100%;
  font-size: 12px;
  color: var(--slidev-code-color, inherit);
}
.grid line {
  stroke: var(--slidev-code-background, #e5e7eb);
  stroke-opacity: 0.6;
  stroke-width: 1;
}
.tick {
  fill: currentColor;
  fill-opacity: 0.7;
  font-size: 11px;
}
.area {
  fill: var(--line-color);
  fill-opacity: 0.15;
}
.line {
  fill: none;
  stroke: var(--line-color);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.dot {
  fill: var(--line-color);
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  border: 1px dashed var(--slidev-code-background, #d1d5db);
  border-radius: 8px;
  color: currentColor;
  opacity: 0.6;
}
</style>
