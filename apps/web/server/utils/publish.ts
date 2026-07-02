/**
 * 发布态服务端单例：BullMQ build 队列 + Redis PublishStore。
 *
 * web 与 build-worker 是独立进程，通过 Redis 通信：
 * - web 入队 build job（BullMQ）→ build-worker 消费
 * - build-worker 写回 PublishRecord → web 读取返回公开 URL
 *
 * Redis 连接与 Queue 均为进程内单例，避免每请求新建连接。
 */
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { RedisPublishStore } from '@slidev-ppt/shared';
import type { PublishStore, BuildJobData } from '@slidev-ppt/shared';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let storeRedis: Redis | null = null;
let queueSingleton: Queue<BuildJobData> | null = null;
let storeSingleton: PublishStore | null = null;

/** Store 专用 Redis 连接（shared 的 ioredis）。Queue 用独立连接，避免与 bullmq 内置版本类型冲突。 */
export function getStoreRedis(): Redis {
  if (!storeRedis) {
    storeRedis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  }
  return storeRedis;
}

/** build 队列（与 build-worker 同名 `build`）。连接用 url 配置，复用 bullmq 自带 ioredis。 */
export function getBuildQueue(): Queue<BuildJobData> {
  if (!queueSingleton) {
    queueSingleton = new Queue<BuildJobData>('build', { connection: { url: REDIS_URL } });
  }
  return queueSingleton;
}

/** 发布记录存储（Redis）。 */
export function getPublishStore(): PublishStore {
  if (!storeSingleton) {
    storeSingleton = new RedisPublishStore(getStoreRedis());
  }
  return storeSingleton;
}
