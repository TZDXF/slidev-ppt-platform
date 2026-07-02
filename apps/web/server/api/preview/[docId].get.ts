/**
 * GET /api/preview/:docId
 *
 * 查询渲染会话状态，转发到渲染服务 GET /preview/:docId。
 * pending 时带 queuePosition 供前端轮询。
 */
import { proxyRender, type PreviewResponse } from '../../utils/render.js';

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId');
  if (!docId) {
    setResponseStatus(event, 400);
    return { error: 'docId 必填' };
  }
  return proxyRender<PreviewResponse>('GET', `/preview/${encodeURIComponent(docId)}`);
});
