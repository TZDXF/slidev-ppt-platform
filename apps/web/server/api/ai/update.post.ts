/**
 * AI 对话 → 编辑 ops 的 SSE 端点（骨架）。
 *
 * 流程（待 AI 对话链路工程师实现完整逻辑）：
 * 1. 接收 { docMd, message, history }
 * 2. 调 @anthropic-ai/sdk，注入当前 MD 分页结构 + 组件清单
 * 3. tool_use 约束输出 EditOp[]（见 @slidev-ppt/shared/ops）
 * 4. SSE 流式：先发自然语言说明，再发 ops JSON
 *
 * key 走 runtimeConfig.anthropicApiKey，绝不返回给客户端。
 */
import { parseSlidev } from '@slidev-ppt/shared';
import type { EditOpsResult } from '@slidev-ppt/shared';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ docMd?: string; message?: string; history?: unknown[] }>(event);
  if (!body?.message) {
    setResponseStatus(event, 400);
    return { error: 'message 必填' };
  }

  // 解析当前文档结构，供后续注入 prompt
  const doc = body.docMd ? parseSlidev(body.docMd) : null;

  // TODO: 调 Claude，tool_use 产出 ops
  const result: EditOpsResult = { ops: [] };

  return {
    docStructure: doc ? { slides: doc.slides.length } : null,
    reply: '（AI 链路待实现）收到指令：' + body.message,
    ops: result.ops,
  };
});
