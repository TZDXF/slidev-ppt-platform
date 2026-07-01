/**
 * 内置 Vue 组件库（首版）。
 *
 * 这些组件随基础镜像预装，Slidev 自动加载 components/ 下的 .vue 文件并全局注册，
 * 用户在 MD 中可直接以标签调用，例如 <BarChart :data="..."/>。
 *
 * 组件清单会被注入 AI prompt（见 componentSchemas），让 AI 在数据可视化页
 * 优先用组件而非纯文字。
 *
 * 设计取向：图表纯 SVG 自绘，无运行时图表库依赖，体积小；
 * 样式用 Slidev CSS 变量适配深浅色；数据为空时不崩溃。
 */
export { default as BarChart } from './BarChart.vue';
export { default as LineChart } from './LineChart.vue';
export { default as StatCard } from './StatCard.vue';
export { default as Timeline } from './Timeline.vue';
export { default as ProgressBar } from './ProgressBar.vue';
export { default as CodeBlock } from './CodeBlock.vue';

export { componentSchemas } from './schemas';
export type { ComponentSchema } from './schemas';
