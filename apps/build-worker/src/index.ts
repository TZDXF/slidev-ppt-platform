/**
 * 构建发布 worker。
 *
 * 职责：
 * - 消费 BullMQ build 队列，限并发 BUILD_CONCURRENCY（默认 4，建议 4-8）
 * - 内容哈希缓存：相同 (MD + 主题 + 启用组件清单) 复用已发布产物，秒回
 * - 执行 slidev build（隔离临时目录 + 超时）→ 静态 SPA
 * - 产物整目录上传对象存储 / CDN，写回 PublishRecord（公开短链 `/p/<pptId>/`）
 * - 访问时不经过 Node 进程：CDN 回源对象存储
 *
 * 跨进程状态：PublishRecord 存 Redis（web 与 worker 共用），见 @slidev-ppt/shared。
 */
import { Worker } from 'bullmq';
import { rmSync } from 'node:fs';
import Redis from 'ioredis';
import { RedisPublishStore, contentHash } from '@slidev-ppt/shared';
import type { BuildJobData, PublishRecord } from '@slidev-ppt/shared';
import { runSlidevBuild } from './builder.js';
import { createObjectStorage } from './storage.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CONCURRENCY = Math.min(8, Math.max(1, Number(process.env.BUILD_CONCURRENCY ?? 4)));

export { contentHash };

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const store = new RedisPublishStore(redis);
const storage = createObjectStorage();

const worker = new Worker<BuildJobData>(
  'build',
  async (job) => {
    const { doc, components, pptId } = job.data;
    const hash = contentHash(doc, components);
    const now = Date.now();

    // ---- 缓存命中：复用已发布产物，秒回 ----
    const cached = await store.getByHash(hash);
    if (cached && cached.status === 'published' && cached.publicUrl) {
      const rec: PublishRecord = {
        ...cached,
        pptId,
        status: 'published',
        contentHash: hash,
        publicUrl: cached.publicUrl,
        storageKey: cached.storageKey,
        jobId: job.id,
        cached: true,
        createdAt: now,
        updatedAt: now,
      };
      await store.upsert(rec);
      return { hash, status: 'published', publicUrl: cached.publicUrl, cached: true };
    }

    // ---- 未命中：标记 building ----
    await store.upsert({
      pptId,
      status: 'building',
      contentHash: hash,
      jobId: job.id,
      createdAt: now,
      updatedAt: now,
    });

    // ---- slidev build ----
    const { distDir, projectDir } = await runSlidevBuild({ doc, components, pptId });
    try {
      const storageKey = `p/${pptId}`;
      // 重新发布时清理旧产物（best-effort）
      if ('clearPrefix' in storage) {
        await (storage as { clearPrefix(k: string): Promise<void> }).clearPrefix(storageKey).catch(() => {});
      }
      const { publicUrl } = await storage.uploadDir(distDir, storageKey);

      const rec: PublishRecord = {
        pptId,
        status: 'published',
        contentHash: hash,
        publicUrl,
        storageKey: `${storageKey}/`,
        jobId: job.id,
        cached: false,
        createdAt: now,
        updatedAt: Date.now(),
      };
      await store.upsert(rec);
      await store.setHash(hash, pptId);
      return { hash, status: 'published', publicUrl, cached: false };
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  },
  { connection: { url: REDIS_URL }, concurrency: CONCURRENCY },
);

worker.on('completed', (job) => console.log(`[build-worker] completed ${job.id}`));
worker.on('failed', async (job, err) => {
  console.error(`[build-worker] failed ${job?.id}:`, err.message);
  if (!job) return;
  const { pptId } = job.data;
  const existing = await store.get(pptId);
  await store.upsert({
    pptId,
    status: 'failed',
    contentHash: existing?.contentHash ?? '',
    jobId: job.id,
    error: err.message,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });
});

console.log(`[build-worker] started, concurrency=${CONCURRENCY}, redis=${REDIS_URL}`);
