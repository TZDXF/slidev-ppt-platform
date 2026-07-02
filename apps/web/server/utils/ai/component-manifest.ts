/**
 * 内置组件清单渲染器：基于 @slidev-ppt/components 的真实 componentSchemas，
 * 渲染成 prompt 可读的组件清单文本，注入 AI system prompt。
 *
 * AI 在数据可视化页应优先用这些组件标签，而非纯文字罗列数据。
 * 组件 / props 的增改由 packages/components/src/schemas.ts 维护，
 * 这里只负责把 JSON schema 翻译成 prompt 友好的文本，不再硬编码组件清单。
 */
import { componentSchemas, type ComponentSchema } from '@slidev-ppt/components';

type JsonSchema = Record<string, unknown>;

/** 把 JSON schema 的某个属性 schema 翻译成 TS 风格的类型字符串。 */
function typeOf(schema: JsonSchema | undefined): string {
  if (!schema) return 'any';
  const type = schema.type;
  if (Array.isArray(type)) return type.map((t) => typeOf({ ...schema, type: t })).join(' | ');
  switch (type) {
    case 'array': {
      const items = schema.items as JsonSchema | undefined;
      return `Array<${typeOf(items)}>`;
    }
    case 'object': {
      const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
      const required = new Set<string>(Array.isArray(schema.required) ? schema.required : []);
      const fields = Object.entries(props).map(([k, v]) => {
        const t = typeOf(v);
        return required.has(k) ? `${k}: ${t}` : `${k}?: ${t}`;
      });
      return `{ ${fields.join('; ')} }`;
    }
    case 'string': return 'string';
    case 'number': return 'number';
    case 'integer': return 'number';
    case 'boolean': return 'boolean';
    default: return typeof type === 'string' ? type : 'any';
  }
}

/** 把单个属性渲染成 props 清单中的一行（含枚举/范围等补充说明）。 */
function renderProp(name: string, schema: JsonSchema | undefined, required: boolean): string {
  const s = schema ?? {};
  const head = `    - ${name}: ${typeOf(s)}${required ? '（必填）' : ''}`;
  const desc = typeof s.description === 'string' ? s.description : '';
  const extras: string[] = [];
  if (Array.isArray(s.enum)) extras.push(`枚举: ${(s.enum as unknown[]).join(' | ')}`);
  if (typeof s.minimum === 'number' || typeof s.maximum === 'number') {
    const lo = s.minimum as number | undefined;
    const hi = s.maximum as number | undefined;
    extras.push(`范围: ${lo ?? 0}–${hi ?? '∞'}`);
  }
  const tail = [desc, ...extras].filter(Boolean).join('；');
  return tail ? `${head} — ${tail}` : head;
}

/** 把单个 ComponentSchema 渲染成 prompt 清单中的一段。 */
function renderEntry(c: ComponentSchema): string {
  const propsSchema = (c.props ?? {}) as JsonSchema;
  const properties = (propsSchema.properties ?? {}) as Record<string, JsonSchema>;
  const requiredSet = new Set<string>(Array.isArray(propsSchema.required) ? propsSchema.required : []);
  const propNames = Object.keys(properties);

  const sig = propNames.map((n) => `:${n}="..."`).join(' ');
  const propsDetail = propNames
    .map((n) => renderProp(n, properties[n], requiredSet.has(n)))
    .join('\n');

  const header = `- <${c.name}${sig ? ` ${sig}` : ''} /> — ${c.description}`;
  if (!propNames.length) return `${header}\n  props: 无`;
  return `${header}\n  props:\n${propsDetail}`;
}

/** 渲染成 prompt 可读的组件清单文本（基于真实 componentSchemas）。 */
export function renderComponentManifestForPrompt(): string {
  return componentSchemas.map(renderEntry).join('\n');
}
