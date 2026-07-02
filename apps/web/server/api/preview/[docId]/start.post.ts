/**
 * POST /api/preview/:docId/start
 *
 * 启动 / 复用文档对应的渲染会话，转发到渲染服务 POST /preview/:docId。
 * body { md } 作为初始 MD 写入容器。返回体含 status / previewUrl / queuePosition。
 */
import { proxyRender, type PreviewResponse } from '../../../utils/render.js';

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId');
  if (!docId) {
    setResponseStatus(event, 400);
    return { error: 'docId 必填' };
  }
  const body = (await readBody(event).catch(() => ({}))) as { md?: string };
  return proxyRender<PreviewResponse>('POST', `/preview/${encodeURIComponent(docId)}`, { md: body.md });
});
