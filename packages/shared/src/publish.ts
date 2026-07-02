/**
 * 发布态共享类型与发布记录存储。
 *
 * 发布流程：web 入队 build job → build-worker 执行 slidev build → 产物上对象存储/CDN
 * → 写回 PublishRecord。web 通过 GET /api/ppt/:id 读取记录返回公开 URL。
 *
 * build-worker 与 web 是两个独立进程，发布元数据必须跨进程可见，因此用 Redis
 * 持久化（key: `publish:ppt:<pptId>`），而非进程内内存。后续可换 PostgreSQL/Drizzle
 * （见架构总览「数据」），接口已抽象为 PublishStore，替换实现即可。
 */
import type { ParsedDoc } from './slidev.js';
import { serializeSlidev } from './slidev.js';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';

/** 发布状态机 */
export type PublishStatus =
  | 'queued' // 已入队，等待 worker 拾取
  | 'building' // worker 正在构建
  | 'published' // 构建完成，产物已上 CDN
  | 'failed'; // 构建失败

/** 一份 PPT 的发布记录（跨进程共享，存 Redis） */
export interface PublishRecord {
  pptId: string;
  status: PublishStatus;
  /** 内容哈希（MD + 主题 + 启用组件清单），缓存命中判断用 */
  contentHash: string;
  /** 公开访问 URL，published 后才有值 */
  publicUrl?: string;
  /** 对象存储中产物前缀 key，如 `p/<pptId>/` */
  storageKey?: string;
  /** BullMQ job id */
  jobId?: string;
  /** 失败原因 */
  error?: string;
  /** 是否命中缓存（相同内容二次发布） */
  cached?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** build job 的 payload（web → worker） */
export interface BuildJobData {
  pptId: string;
  doc: ParsedDoc;
  /** 启用的组件名清单（对应 packages/components 内置组件） */
  components: string[];
}

/**
 * 内容哈希：MD + 主题 + 启用组件清单 → sha256。
 * web（入队前预判缓存命中）与 build-worker（落库）共用同一实现，保证一致性。
 */
export function contentHash(doc: ParsedDoc, components: string[]): string {
  const input =
    serializeSlidev(doc) + '|' + (doc.frontmatter.theme ?? 'default') + '|' + components.slice().sort().join(',');
  return createHash('sha256').update(input).digest('hex');
}

/** PublishStore 抽象：web 与 build-worker 共用同一实现（Redis）。 */
export interface PublishStore {
  get(pptId: string): Promise<PublishRecord | null>;
  upsert(rec: PublishRecord): Promise<void>;
  /** 按内容哈希查缓存命中（key 复用已发布产物） */
  getByHash(hash: string): Promise<PublishRecord | null>;
  /** 写哈希 → pptId 映射，供后续命中 */
  setHash(hash: string, pptId: string): Promise<void>;
}

const PPT_KEY = (pptId: string) => `publish:ppt:${pptId}`;
const HASH_KEY = (hash: string) => `publish:hash:${hash}`;

/**
 * Redis 实现的 PublishStore。
 *
 * 单例：复用传入的 Redis 连接（与 BullMQ 共用或独立均可）。
 * 记录以 JSON 串存取；不设 TTL（发布产物是长期资源，由对象存储生命周期管理回收）。
 */
export class RedisPublishStore implements PublishStore {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get(pptId: string): Promise<PublishRecord | null> {
    const raw = await this.redis.get(PPT_KEY(pptId));
    if (!raw) return null;
    return JSON.parse(raw) as PublishRecord;
  }

  async upsert(rec: PublishRecord): Promise<void> {
    const next: PublishRecord = { ...rec, updatedAt: Date.now() };
    await this.redis.set(PPT_KEY(rec.pptId), JSON.stringify(next));
  }

  async getByHash(hash: string): Promise<PublishRecord | null> {
    const pptId = await this.redis.get(HASH_KEY(hash));
    if (!pptId) return null;
    return this.get(pptId);
  }

  async setHash(hash: string, pptId: string): Promise<void> {
    await this.redis.set(HASH_KEY(hash), pptId);
  }
}
