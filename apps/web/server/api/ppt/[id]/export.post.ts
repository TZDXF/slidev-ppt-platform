/**
 * POST /api/ppt/:id/export
 *
 * PDF / PNG 导出占位 —— 复用 slidev 的导出能力（slidev export），
 * 后期实现：入独立 export 队列，产物上对象存储，返回下载短链。
 *
 * 当前仅返回 501，标识能力未启用，避免被当作已实现调用。
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  const body = await readBody<{ format?: 'pdf' | 'png' }>(event).catch(() => ({}));
  const format = body?.format ?? 'pdf';
  setResponseStatus(event, 501);
  return {
    pptId: id,
    format,
    status: 'not_implemented',
    message: 'PDF/PNG 导出能力待后期实现（复用 slidev export）',
  };
});
