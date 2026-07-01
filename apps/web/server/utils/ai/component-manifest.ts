/**
 * 内置组件清单 + 占位 props schema，用于注入 AI prompt。
 *
 * AI 在数据可视化页应优先用这些组件标签，而非纯文字罗列数据。
 * 待组件生态工程师补全真实 props schema 后替换 COMPONENT_MANIFEST 即可，
 * renderComponentManifestForPrompt() 的输出格式保持稳定。
 */

export interface ComponentPropSchema {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface ComponentManifestEntry {
  name: string;
  description: string;
  props: ComponentPropSchema[];
}

/**
 * 占位清单 —— 与 packages/components/src 当前的 BarChart / StatCard 一致。
 * 组件生态工程师补全后会替换为更完整的 schema（含默认值、枚举等）。
 */
export const COMPONENT_MANIFEST: ComponentManifestEntry[] = [
  {
    name: 'BarChart',
    description: '柱状图，用于数据可视化页（对比类数据）',
    props: [
      {
        name: 'data',
        type: 'Array<{ label: string; value: number }>',
        required: true,
        description: '柱状图数据，如 [{ label: \'Q1\', value: 120 }]',
      },
    ],
  },
  {
    name: 'StatCard',
    description: '统计卡片，突出单个关键数字',
    props: [
      { name: 'value', type: 'string | number', required: true, description: '关键数值' },
      { name: 'label', type: 'string', required: true, description: '数值说明' },
    ],
  },
];

/** 渲染成 prompt 可读的组件清单文本。 */
export function renderComponentManifestForPrompt(): string {
  return COMPONENT_MANIFEST.map((c) => {
    const propsSig = c.props.map((p) => `:${p.name}="..."`).join(' ');
    const propsDetail = c.props
      .map((p) => `    - ${p.name}: ${p.type}${p.required ? '（必填）' : ''}${p.description ? ` — ${p.description}` : ''}`)
      .join('\n');
    return `- <${c.name} ${propsSig} /> — ${c.description}\n  props:\n${propsDetail}`;
  }).join('\n');
}
