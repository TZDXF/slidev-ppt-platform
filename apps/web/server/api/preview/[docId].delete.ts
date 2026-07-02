/**
 * DELETE /api/preview/:docId
 *
 * 手动销毁渲染会话容器，配合服务端空闲回收做双保险。
 * 转发到渲染服务 DELETE /preview/:docId。
 */
import { proxyRender, type PreviewResponse } from '../../utils/render.js';

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId');
  if (!docId) {
    setResponseStatus(event, 400);
    return { error: 'docId 必填' };
  }
  return proxyRender<PreviewResponse>('DELETE', `/preview/${encodeURIComponent(docId)}`);
});
