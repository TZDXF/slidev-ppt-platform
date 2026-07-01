/**
 * 构建发布 worker（骨架）。
 *
 * 职责（待构建发布工程师完整实现）：
 * - 消费 BullMQ build 队列，限并发 4-8
 * - 内容哈希缓存：相同 (MD + 主题 + 组件清单) 复用产物
 * - 执行 slidev build → 静态 SPA
 * - 产物上传对象存储/CDN，生成公开短链
 *
 * 本骨架只起 worker 连接 Redis 占位，实际 build 逻辑待实现。
 */
import { Worker } from 'bullmq';
import { createHash } from 'node:crypto';
import { serializeSlidev } from '@slidev-ppt/shared';
import type { ParsedDoc } from '@slidev-ppt/shared';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CONCURRENCY = Number(process.env.BUILD_CONCURRENCY ?? 4);

/** 内容哈希：MD + 主题 + 启用组件清单 → sha256 */
export function contentHash(doc: ParsedDoc, components: string[]): string {
  const input = serializeSlidev(doc) + '|' + doc.frontmatter.theme + '|' + components.sort().join(',');
  return createHash('sha256').update(input).digest('hex');
}

// TODO: 由构建发布工程师接入对象存储客户端
const worker = new Worker(
  'build',
  async (job) => {
    // job.data: { doc, components, pptId }
    const { doc, components } = job.data as { doc: ParsedDoc; components: string[] };
    const hash = contentHash(doc, components);
    // TODO: 查缓存 → 命中则复用；未命中则 slidev build + 上传
    console.log(`[build-worker] job ${job.id} hash=${hash.slice(0, 12)} (待实现)`);
    return { hash, status: 'pending' };
  },
  { connection: { url: REDIS_URL }, concurrency: CONCURRENCY },
);

worker.on('completed', (job) => console.log(`[build-worker] completed ${job.id}`));
worker.on('failed', (job, err) => console.error(`[build-worker] failed ${job?.id}:`, err));

console.log(`[build-worker] started, concurrency=${CONCURRENCY}, redis=${REDIS_URL}`);
