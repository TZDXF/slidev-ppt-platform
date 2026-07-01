/**
 * EditOp 的工具 schema（tool_use 模式）+ 受限 MD 规范。
 *
 * tool_use 模式下传给 Claude 的 tools 参数；json 模式下不传 tools，
 * 但 prompts.ts 仍引用同一份 schema 文本注入到 system prompt，保证两种模式
 * 产出结构一致。
 */
import type { EditOp } from '@slidev-ppt/shared';

export const APPLY_EDITS_TOOL_NAME = 'apply_edits';

/** tool_use 模式的 tool 定义。input_schema 与 @slidev-ppt/shared/ops 的 EditOp 对齐。 */
export const APPLY_EDITS_TOOL = {
  name: APPLY_EDITS_TOOL_NAME,
  description:
    '对 Slidev PPT 文档应用一组页级编辑操作（页级 CRUD + frontmatter）。' +
    '每个 op 必须带 reason（给用户的中文说明）。index/after/from/to 均为 0-based 页序号。',
  input_schema: {
    type: 'object',
    properties: {
      ops: {
        type: 'array',
        description: '按顺序应用的编辑操作列表',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['updateSlide', 'insertSlide', 'deleteSlide', 'moveSlide', 'updateFrontmatter'],
            },
            reason: { type: 'string', description: '该操作的自然语言说明（中文）' },
            index: { type: 'number', description: 'updateSlide/deleteSlide：目标页 0-based 序号' },
            md: { type: 'string', description: 'updateSlide/insertSlide：该页正文（不含分页符 ---）' },
            after: { type: 'number', description: 'insertSlide：插到第几页之后；-1 表示插到最前' },
            from: { type: 'number', description: 'moveSlide：从哪一页移走' },
            to: { type: 'number', description: 'moveSlide：移到哪个位置（0-based）' },
            patch: { type: 'object', description: 'updateFrontmatter：顶层 key 增删改；null 值表示删除' },
          },
          required: ['type', 'reason'],
        },
      },
    },
    required: ['ops'],
  },
} as const;

/**
 * 把任意解析结果归一化为 EditOp[]。
 * 容错：接受 {ops:[...]} / [...] / {input:{ops:[...]}}；丢弃无 type 的项。
 */
export function normalizeOps(parsed: unknown): EditOp[] {
  if (parsed == null) return [];
  let arr: unknown;
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    arr = Array.isArray(obj.ops) ? obj.ops : Array.isArray((obj.input as Record<string, unknown> | undefined)?.ops)
      ? (obj.input as Record<string, unknown>).ops
      : null;
  }
  if (!Array.isArray(arr)) {
    throw new Error('ops 解析失败：期望数组或 {ops:[...]}');
  }
  const validTypes = new Set(['updateSlide', 'insertSlide', 'deleteSlide', 'moveSlide', 'updateFrontmatter']);
  return arr.filter((o): o is EditOp => {
    if (!o || typeof o !== 'object') return false;
    const t = (o as { type?: unknown }).type;
    return typeof t === 'string' && validTypes.has(t);
  });
}
