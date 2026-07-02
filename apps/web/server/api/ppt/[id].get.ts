/**
 * GET /api/ppt/:id
 *
 * 返回发布状态与公开 URL。published 后公开 URL 即 CDN 短链 `/p/<pptId>/`，
 * 访问时不经过 Node 进程。
 */
import { getPublishStore } from '../../utils/publish.js';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return { error: 'id 必填' };
  }
  const rec = await getPublishStore().get(id);
  if (!rec) {
    setResponseStatus(event, 404);
    return { error: '未找到发布记录' };
  }
  return {
    pptId: rec.pptId,
    status: rec.status,
    publicUrl: rec.publicUrl ?? null,
    contentHash: rec.contentHash,
    cached: rec.cached ?? false,
    error: rec.error ?? null,
    updatedAt: rec.updatedAt,
  };
});
