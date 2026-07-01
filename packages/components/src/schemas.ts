/**
 * 组件 schema —— 供 AI 对话链路注入 prompt。
 *
 * 每个组件一份 JSON schema（name + props），AI 据此在生成 Slidev MD 时按需调用组件。
 * 与组件 props 的 TS 类型保持同步；若改 props，请同步改这里的 schema。
 */

export interface ComponentSchema {
  /** 组件名，即在 MD 中使用的标签名 */
  name: string;
  /** props 的 JSON schema（对象） */
  props: Record<string, unknown>;
  /** 一句话描述，供 AI 判断何时使用 */
  description: string;
}

const labelValueItems = {
  type: 'array',
  description: '数据数组',
  items: {
    type: 'object',
    required: ['label', 'value'],
    properties: {
      label: { type: 'string', description: '分类/坐标轴标签' },
      value: { type: 'number', description: '数值' },
    },
  },
};

export const componentSchemas: ComponentSchema[] = [
  {
    name: 'BarChart',
    description: '柱状图，适合分类数据对比。',
    props: {
      type: 'object',
      required: ['data'],
      properties: {
        data: labelValueItems,
        color: { type: 'string', description: '柱子颜色（CSS 颜色），可选' },
        height: { type: 'number', description: 'SVG 视口高度 px，默认 300' },
        unit: { type: 'string', description: '数值单位，可选' },
      },
    },
  },
  {
    name: 'LineChart',
    description: '折线图，适合趋势展示。',
    props: {
      type: 'object',
      required: ['data'],
      properties: {
        data: labelValueItems,
        color: { type: 'string', description: '折线颜色，可选' },
        height: { type: 'number', description: 'SVG 视口高度 px，默认 300' },
        unit: { type: 'string', description: '数值单位，可选' },
        area: { type: 'boolean', description: '是否填充面积，默认 true' },
      },
    },
  },
  {
    name: 'StatCard',
    description: '统计卡片，突出单个数值指标。',
    props: {
      type: 'object',
      required: ['value', 'label'],
      properties: {
        value: { type: ['string', 'number'], description: '主数值' },
        label: { type: 'string', description: '指标名称' },
        unit: { type: 'string', description: '数值单位，可选' },
        trend: {
          type: ['number', 'string'],
          enum: ['up', 'down'],
          description: '趋势：number 自动判定方向，或 "up"/"down"',
        },
      },
    },
  },
  {
    name: 'Timeline',
    description: '纵向时间线，按顺序展示事件。',
    props: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['time', 'title'],
            properties: {
              time: { type: 'string', description: '时间标签' },
              title: { type: 'string', description: '事件标题' },
              desc: { type: 'string', description: '可选描述' },
            },
          },
        },
      },
    },
  },
  {
    name: 'ProgressBar',
    description: '线性进度条，0–100 百分比。',
    props: {
      type: 'object',
      required: ['value'],
      properties: {
        value: { type: 'number', description: '进度值 0–100', minimum: 0, maximum: 100 },
        label: { type: 'string', description: '左侧标签，可选' },
        color: { type: 'string', description: '填充色，可选' },
      },
    },
  },
  {
    name: 'CodeBlock',
    description: '代码高亮块（shiki），带可选标题栏，适合需要以组件形式嵌入代码时使用。',
    props: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', description: '代码文本' },
        lang: { type: 'string', description: '语言标识，如 ts/vue/bash，默认 text' },
        title: { type: 'string', description: '标题栏文案（如文件名），可选' },
      },
    },
  },
];
