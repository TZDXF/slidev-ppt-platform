/**
 * 内置 Vue 组件库（骨架）。
 *
 * 这些组件随基础镜像预装，Slidev 自动加载 components/ 下的 .vue 文件并全局注册，
 * 用户在 MD 中可直接以标签调用，例如 <BarChart :data="..."/>。
 *
 * 组件清单会被注入 AI prompt，让 AI 在数据可视化页优先用组件而非纯文字。
 * 完整组件由组件生态工程师实现。
 */
export { default as BarChart } from './BarChart.vue';
export { default as StatCard } from './StatCard.vue';
