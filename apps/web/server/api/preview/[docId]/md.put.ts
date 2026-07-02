/**
 * PUT /api/preview/:docId/md
 *
 * 推送编辑后的 MD 到渲染服务，已存在容器则 Slidev HMR 自动重渲染。
 * 转发到渲染服务 PUT /preview/:docId/md。
 */
import { proxyRender, type PreviewResponse } from '../../../utils/render.js';

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId');
  if (!docId) {
    setResponseStatus(event, 400);
    return { error: 'docId 必填' };
  }
  const body = (await readBody(event).catch(() => ({}))) as { md?: string };
  if (typeof body.md !== 'string') {
    setResponseStatus(event, 400);
    return { error: 'md 必填' };
  }
  return proxyRender<PreviewResponse>('PUT', `/preview/${encodeURIComponent(docId)}/md`, { md: body.md });
});
