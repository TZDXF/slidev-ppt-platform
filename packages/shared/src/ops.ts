/**
 * AI 编辑操作（ops）类型定义 —— 方案 A：页级 CRUD。
 *
 * AI 对话更新 PPT 时，不直接输出新 MD，而是输出结构化 ops JSON，
 * 后端 applyOps() 把 ops 应用到 ParsedDoc 上，再 serializeSlidev 写回。
 *
 * 设计原则：
 * - 粒度为「页」级（updateSlide/insertSlide/deleteSlide）+ frontmatter 级。
 * - 删页 / 重排顺序这类破坏性操作，前端拿到后先弹确认再 apply。
 * - 每个 op 带 reason（AI 的自然语言说明），用于流式展示与审计。
 */

export type EditOp =
  | UpdateSlideOp
  | InsertSlideOp
  | DeleteSlideOp
  | MoveSlideOp
  | UpdateFrontmatterOp;

interface BaseOp {
  /** AI 对该操作的自然语言说明，流式展示给用户 */
  reason: string;
}

export interface UpdateSlideOp extends BaseOp {
  type: 'updateSlide';
  /** 目标页序号（0-based） */
  index: number;
  /** 新的该页正文（不含分页符） */
  md: string;
}

export interface InsertSlideOp extends BaseOp {
  type: 'insertSlide';
  /** 插入到哪一页之后；-1 表示插到最前 */
  after: number;
  md: string;
}

export interface DeleteSlideOp extends BaseOp {
  type: 'deleteSlide';
  index: number;
}

export interface MoveSlideOp extends BaseOp {
  type: 'moveSlide';
  /** 从哪一页移走 */
  from: number;
  /** 移到哪一页位置（0-based，移到目标位置前） */
  to: number;
}

export interface UpdateFrontmatterOp extends BaseOp {
  type: 'updateFrontmatter';
  /** JSON patch；仅支持顶层 key 增删改 */
  patch: Record<string, unknown>;
}

export interface EditOpsResult {
  ops: EditOp[];
}
