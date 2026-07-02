/**
 * POST /api/ppt/publish
 *
 * 接收 pptId + 当前 MD（+ 启用组件清单），入 build 队列，返回 jobId。
 * 发布元数据（status=queued）写 Redis PublishStore，供 GET /api/ppt/:id 轮询。
 *
 * 同一内容二次发布命中缓存时，build-worker 直接复用已发布产物，秒回。
 */
import { parseSlidev, contentHash } from '@slidev-ppt/shared';
import type { PublishRecord } from '@slidev-ppt/shared';
import { getBuildQueue, getPublishStore } from '../../utils/publish.js';

interface PublishBody {
  pptId?: string;
  md?: string;
  components?: string[];
}

export default defineEventHandler(async (event) => {
  const body = await readBody<PublishBody>(event);
  const pptId = body?.pptId;
  const md = body?.md;
  if (!pptId || !md) {
    setResponseStatus(event, 400);
    return { error: 'pptId 与 md 必填' };
  }

  const doc = parseSlidev(md);
  const components = body.components ?? [];
  const hash = contentHash(doc, components);

  const store = getPublishStore();

  // 命中缓存：直接复用，不入队，秒回
  const cached = await store.getByHash(hash);
  if (cached && cached.status === 'published' && cached.publicUrl) {
    const rec: PublishRecord = {
      ...cached,
      pptId,
      status: 'published',
      contentHash: hash,
      publicUrl: cached.publicUrl,
      storageKey: cached.storageKey,
      cached: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.upsert(rec);
    return { pptId, jobId: null, status: 'published', publicUrl: cached.publicUrl, cached: true };
  }

  // 入队
  const queue = getBuildQueue();
  const job = await queue.add('build', { pptId, doc, components });

  const now = Date.now();
  await store.upsert({
    pptId,
    status: 'queued',
    contentHash: hash,
    jobId: job.id ?? undefined,
    createdAt: now,
    updatedAt: now,
  });

  return { pptId, jobId: job.id, status: 'queued' };
});
