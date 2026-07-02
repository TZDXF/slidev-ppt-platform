/**
 * 容器池调度器 —— 渲染服务的核心。
 *
 * 职责：
 * - 按需启停 Slidev dev server 容器（用户打开编辑器才启动）
 * - 并发上限 + 排队：活跃容器达 maxContainers 时进队列返回 pending
 * - 空闲回收：每实例空闲计时器，每次 HMR/预览请求重置，超时销毁
 * - 崩溃恢复：心跳检测；崩溃自动重启 1 次后标记 failed
 * - 资源隔离：每容器 512MB / 0.5 核（在 docker.ts 施加）
 *
 * 调度策略说明（任务要求"说明并发与回收策略"）：
 * - 并发：以 docId 为粒度复用，同一文档复用同一容器；活跃容器数达上限时，
 *   新请求入 FIFO 队列返回 pending，前端轮询 GET /preview/:docId 直到 ready。
 *   有容器释放（空闲回收/手动销毁）时按 FIFO 唤醒队首。
 * - 回收：每个会话维护 idleTimer，任何预览/HMR 请求（经本服务反代）或 MD 写入
 *   都重置定时器；超时（默认 5min，可配 5-10min）销毁容器并清理会话目录。
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { get as httpGet } from 'node:http';
import { config, buildPreviewUrl } from './config.js';
import { docker, ensureSandboxNetwork } from './docker.js';
import { sessionStore, EMPTY_DECK } from './session-store.js';
import type { Session, Metrics, PreviewRequest, PreviewResponse } from './types.js';

const startedAt = Date.now();

/** docId → 会话 */
const sessions = new Map<string, Session>();
/** token → docId（反代路由用） */
const tokenIndex = new Map<string, string>();
/** pending 队列：等待空闲槽位的 docId */
const queue: string[] = [];

let lastColdStartMs: number | undefined;
let coldStartTotal = 0;
let coldStartSamples = 0;

function newToken(): string {
  return randomBytes(6).toString('hex');
}

function containerNameFor(docId: string, token: string): string {
  return `slidev-${docId.replace(/[^a-zA-Z0-9_-]/g, '_')}-${token}`.slice(0, 63);
}

function activeCount(): number {
  let n = 0;
  for (const s of sessions.values()) {
    if (s.status === 'starting' || s.status === 'ready' || s.status === 'restarting') n++;
  }
  return n;
}

/** 重置空闲回收定时器 */
function resetIdleTimer(s: Session): void {
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.lastActiveAt = Date.now();
  if (s.status === 'ready' || s.status === 'starting') {
    s.idleTimer = setTimeout(() => {
      void reclaim(s.docId, 'idle-timeout').catch(() => {});
    }, config.idleTimeoutMs);
  }
}

/** 标记活跃（HMR/预览请求经反代时调用） */
export function touch(token: string): void {
  const docId = tokenIndex.get(token);
  if (!docId) return;
  const s = sessions.get(docId);
  if (s) resetIdleTimer(s);
}

/** 回收一个会话：停容器、清目录、唤醒队列 */
export async function reclaim(docId: string, reason: string): Promise<void> {
  const s = sessions.get(docId);
  if (!s) return;
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.status = 'stopped';
  await docker.remove(s.containerName).catch(() => {});
  await sessionStore.remove(docId).catch(() => {});
  tokenIndex.delete(s.token);
  sessions.delete(docId);
  console.log(`[pool] reclaim doc=${docId} reason=${reason}`);
  drainQueue();
}

/** 唤醒队列：有空闲槽位时启动队首 */
function drainQueue(): void {
  while (queue.length > 0 && activeCount() < config.maxContainers) {
    const docId = queue.shift();
    if (!docId) break;
    const s = sessions.get(docId);
    if (!s || s.status !== 'pending') continue;
    void startContainer(s).catch((e) => {
      console.error(`[pool] queue start failed doc=${docId}`, e);
      s.status = 'failed';
    });
  }
}

/** 启动容器并等就绪 */
async function startContainer(s: Session): Promise<void> {
  s.status = 'starting';
  s.startedAt = Date.now();
  s.inGrace = true;
  const sessionDir = resolve(join(config.sessionsDir, s.docId.replace(/[^a-zA-Z0-9_-]/g, '_')));
  // 确保 sessionDir 存在并写入 slides.md（必须在 docker.start 之前，否则 Docker
  // 把不存在的 slides.md 路径当作目录创建 → 容器内 EISDIR）
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'slides.md'), s.md ?? '', 'utf8');
  const started = await docker.start({
    containerName: s.containerName,
    sessionDir,
    componentsDir: s.componentsDir,
  });
  s.hostPort = started.hostPort;

  // 等待 dev server 就绪（轮询 HTTP /）
  await waitReady(s);
  s.inGrace = false;
  s.readyAt = Date.now();
  s.coldStartMs = s.readyAt - (s.startedAt ?? s.readyAt);
  s.status = 'ready';
  s.previewUrl = buildPreviewUrl(s.token);
  lastColdStartMs = s.coldStartMs;
  coldStartTotal += s.coldStartMs;
  coldStartSamples += 1;
  console.log(`[pool] ready doc=${s.docId} port=${s.hostPort} cold=${s.coldStartMs}ms`);
  resetIdleTimer(s);
  // 唤醒等待者
  for (const w of s.readyWaiters) {
    try { w(); } catch { /* noop */ }
  }
  s.readyWaiters = [];
}

/** 轮询容器 HTTP 根路径直到 200 或超时（启动宽限期） */
async function waitReady(s: Session): Promise<void> {
  if (config.dockerMode === 'mock') {
    // mock：立即就绪
    return;
  }
  const deadline = (s.startedAt ?? Date.now()) + config.startGraceMs;
  const url = `http://127.0.0.1:${s.hostPort ?? 0}/`;
  while (Date.now() < deadline) {
    try {
      const ok = await httpOk(url);
      if (ok) return;
    } catch {
      // 继续重试
    }
    await sleep(300);
  }
  throw new Error(`dev server 启动超时 (${config.startGraceMs}ms)`);
}

function httpOk(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpGet(url, { timeout: 1000 }, (res) => {
      resolve(Boolean(res.statusCode && res.statusCode < 500));
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 分配/复用一个会话。若活跃容器已达上限则排队返回 pending。
 * 若提供 md 则写入 slides.md（已存在容器时触发 HMR 重渲染）。
 */
export async function acquire(docId: string, req: PreviewRequest): Promise<PreviewResponse> {
  let s = sessions.get(docId);

  // 已有会话：更新 MD、重置空闲计时器、返回当前状态
  if (s && (s.status === 'ready' || s.status === 'starting' || s.status === 'restarting')) {
    if (req.md !== undefined) {
      s.md = req.md;
      await sessionStore.writeMd(docId, req.md);
    }
    if (req.componentsDir) s.componentsDir = req.componentsDir;
    resetIdleTimer(s);
    return {
      docId,
      status: s.status,
      previewUrl: s.previewUrl ?? null,
      message: s.status === 'ready' ? '已就绪' : '启动中',
    };
  }

  // 新会话
  const md = req.md ?? EMPTY_DECK;
  await sessionStore.writeMd(docId, md);
  s = {
    docId,
    token: newToken(),
    status: 'pending',
    containerName: '',
    md,
    componentsDir: req.componentsDir,
    lastActiveAt: Date.now(),
    restartCount: 0,
    readyWaiters: [],
    inGrace: false,
  };
  s.containerName = containerNameFor(docId, s.token);
  sessions.set(docId, s);
  tokenIndex.set(s.token, docId);

  if (activeCount() >= config.maxContainers) {
    queue.push(docId);
    console.log(`[pool] queue doc=${docId} pos=${queue.length} active=${activeCount()}`);
    return {
      docId,
      status: 'pending',
      previewUrl: null,
      queuePosition: queue.indexOf(docId) + 1,
      message: `并发已达上限（${config.maxContainers}），排队中`,
    };
  }

  void startContainer(s).catch((e) => {
    console.error(`[pool] start failed doc=${docId}`, e);
    s!.status = 'failed';
  });

  return {
    docId,
    status: 'starting',
    previewUrl: null,
    message: '正在启动 Slidev dev server',
  };
}

/** 写入 MD（编辑器实时更新）——已存在容器则 Slidev HMR 自动重渲染 */
export async function writeMd(docId: string, md: string): Promise<PreviewResponse> {
  let s = sessions.get(docId);
  if (s && (s.status === 'ready' || s.status === 'starting' || s.status === 'restarting')) {
    s.md = md;
    await sessionStore.writeMd(docId, md);
    resetIdleTimer(s);
    return { docId, status: s.status, previewUrl: s.previewUrl ?? null };
  }
  // 无活跃会话：写入后按需启动一个
  return acquire(docId, { md });
}

export function getStatus(docId: string): PreviewResponse | null {
  const s = sessions.get(docId);
  if (!s) return null;
  let queuePosition: number | undefined;
  if (s.status === 'pending') {
    const idx = queue.indexOf(docId);
    queuePosition = idx >= 0 ? idx + 1 : undefined;
  }
  return {
    docId,
    status: s.status,
    previewUrl: s.previewUrl ?? null,
    queuePosition,
  };
}

/** 按 token 查会话（反代用） */
export function getByToken(token: string): Session | undefined {
  const docId = tokenIndex.get(token);
  if (!docId) return undefined;
  return sessions.get(docId);
}

export function getMetrics(): Metrics {
  let ready = 0;
  for (const s of sessions.values()) {
    if (s.status === 'ready') ready++;
  }
  return {
    status: 'online',
    uptimeMs: Date.now() - startedAt,
    activeContainers: activeCount(),
    readyContainers: ready,
    pendingQueue: queue.length,
    totalSessions: sessions.size,
    maxContainers: config.maxContainers,
    idleTimeoutMs: config.idleTimeoutMs,
    containerMemoryMB: Math.round(config.containerMemoryBytes / 1024 / 1024),
    containerCpus: config.containerCpus,
    image: config.image,
    lastColdStartMs,
    coldStartSamples,
    avgColdStartMs: coldStartSamples > 0 ? Math.round(coldStartTotal / coldStartSamples) : undefined,
  };
}

/**
 * 健康检查循环：检测崩溃容器。
 * - ready 状态的容器若不在宽限期且已停止运行 → 视为崩溃
 * - 重启次数 < maxRestarts(1) → 重启；否则标记 failed
 */
export async function healthLoop(): Promise<void> {
  for (const s of sessions.values()) {
    if (s.status !== 'ready' || s.inGrace) continue;
    if (config.dockerMode === 'mock') continue;
    const running = await docker.isRunning(s.containerName).catch(() => false);
    if (!running) {
      console.warn(`[pool] crash detected doc=${s.docId} container=${s.containerName}`);
      if (s.restartCount < config.maxRestarts) {
        s.restartCount += 1;
        s.status = 'restarting';
        s.inGrace = true;
        await docker.remove(s.containerName).catch(() => {});
        try {
          await startContainer(s);
        } catch (e) {
          console.error(`[pool] restart failed doc=${s.docId}`, e);
          s.status = 'failed';
          s.inGrace = false;
          if (s.idleTimer) clearTimeout(s.idleTimer);
        }
      } else {
        s.status = 'failed';
        if (s.idleTimer) clearTimeout(s.idleTimer);
        console.error(`[pool] mark failed doc=${s.docId} (exceeded ${config.maxRestarts} restarts)`);
      }
    }
  }
}

export async function initPool(): Promise<void> {
  await ensureSandboxNetwork();
  setInterval(() => {
    void healthLoop().catch((e) => console.error('[pool] healthLoop error', e));
  }, config.healthCheckIntervalMs);
  console.log(`[pool] scheduler ready: max=${config.maxContainers} idle=${config.idleTimeoutMs}ms image=${config.image} mode=${config.dockerMode}`);
}
