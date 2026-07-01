/**
 * AI 链路模型与默认值。
 *
 * 项目约定（见 Multica 项目「Slidev PPT 平台」描述）：
 *   - 对话 / 页级 CRUD 更新用 sonnet-4-6
 *   - 复杂结构 / 全量重生成用 opus-4-8
 *
 * 模型 id 与 baseUrl / apiKey 都走 runtimeConfig，便于：
 *   - 国内代理：runtimeConfig.anthropicBaseUrl 指向代理
 *   - 测试：用 OpenAI/Anthropic 兼容代理 + 其它模型名（如 MiniMax-M2.5）
 */
export const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_STRUCTURE_MODEL = 'claude-opus-4-8';

/**
 * ops 提取模式。
 * - tool_use（默认，生产）：用 Claude tool_use 约束 EditOp[] 输出，最稳。
 * - json：让模型在正文末尾输出 ```json {"ops":[...]} ``` 代码块。
 *   为不支持 tool_use 的兼容代理（如测试用的 MiniMax-M2.5 代理）保留通路，
 *   两条路径产出相同的 SSE 事件流（先 reason 后 ops）。
 */
export type OpsMode = 'tool_use' | 'json';
