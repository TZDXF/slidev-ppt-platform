/**
 * 内存版本快照 + 待确认 ops 缓存。
 *
 * - 版本快照：apply 前存上一版 MD，前端可「撤销这次 AI 修改」（撤销端点后续 issue 实现）。
 * - 待确认 ops：删页/重排先返回 ops + requestId，不 apply；前端确认后带 requestId 回调直接 apply，
 *   避免二次 AI 调用。
 *
 * stage 1 用内存 Map（进程级）；后续可换对象存储 / Redis（见架构总览）。
 * 带 TTL 自动回收，防泄漏。
 */
import type { EditOp } from '@slidev-ppt/shared';

const TTL_MS = 30 * 60 * 1000; // 30 分钟

const snapshots = new Map<string, { md: string; ts: number }>();
const pending = new Map<string, { ops: EditOp[]; ts: number }>();

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function cleanup(): void {
  const now = Date.now();
  for (const [k, v] of snapshots) if (now - v.ts > TTL_MS) snapshots.delete(k);
  for (const [k, v] of pending) if (now - v.ts > TTL_MS) pending.delete(k);
}

/** apply 前存上一版 MD，返回 snapshotId。 */
export function storeSnapshot(md: string): string {
  cleanup();
  const id = newId();
  snapshots.set(id, { md, ts: Date.now() });
  return id;
}

/** 取回某次快照的 MD（撤销用）。 */
export function getSnapshot(id: string): string | null {
  return snapshots.get(id)?.md ?? null;
}

/** 缓存待确认的 ops，返回 requestId。 */
export function cachePendingOps(ops: EditOp[]): string {
  cleanup();
  const id = newId();
  pending.set(id, { ops, ts: Date.now() });
  return id;
}

/** 取出并删除待确认 ops（确认后调用）。 */
export function popPendingOps(id: string): EditOp[] | null {
  const v = pending.get(id);
  if (!v) return null;
  pending.delete(id);
  return v.ops;
}
