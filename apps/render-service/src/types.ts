/**
 * 渲染调度服务的共享类型。
 */

/** 容器/会话生命周期状态 */
export type SessionStatus =
  | 'pending' // 排队中，未分配容器
  | 'starting' // 容器已拉起，等待 dev server 就绪
  | 'ready' // dev server 已就绪，previewUrl 可用
  | 'restarting' // 崩溃后自动重启中（最多 1 次）
  | 'failed' // 重启后仍失败，需人工介入
  | 'stopped'; // 空闲回收或手动销毁

/** 一个文档对应的渲染会话 */
export interface Session {
  docId: string;
  token: string;
  status: SessionStatus;
  /** 容器名（docker --name） */
  containerName: string;
  /** 映射到宿主机的随机端口；mock 模式下为模拟端口 */
  hostPort?: number;
  /** 预览 URL，ready 后填入 */
  previewUrl?: string;
  /** 当前 MD 内容（写入了 slides.md） */
  md: string;
  /** 额外启用组件目录（宿主机路径，只读挂载到容器） */
  componentsDir?: string;
  /** 最近一次活跃时间（HMR/预览请求、启动、MD 写入都更新） */
  lastActiveAt: number;
  /** 启动时间戳 */
  startedAt?: number;
  /** 就绪时间戳，用于统计冷启动耗时 */
  readyAt?: number;
  /** 冷启动耗时（ms），ready 后填入 */
  coldStartMs?: number;
  /** 崩溃重启计数 */
  restartCount: number;
  /** 空闲回收定时器 */
  idleTimer?: ReturnType<typeof setTimeout>;
  /** 就绪等待 deferred */
  readyWaiters: Array<() => void>;
  /** 当前是否处于健康检查的宽限期内 */
  inGrace: boolean;
}

/** 调度指标快照 */
export interface Metrics {
  status: 'online';
  uptimeMs: number;
  activeContainers: number;
  readyContainers: number;
  pendingQueue: number;
  totalSessions: number;
  maxContainers: number;
  idleTimeoutMs: number;
  containerMemoryMB: number;
  containerCpus: number;
  image: string;
  /** 最近一次冷启动耗时（ms） */
  lastColdStartMs?: number;
  /** 历史冷启动样本数 */
  coldStartSamples: number;
  /** 历史冷启动平均耗时（ms） */
  avgColdStartMs?: number;
}

/** POST /preview/:docId 请求体 */
export interface PreviewRequest {
  /** Slidev MD 全文；未提供则用空模板 */
  md?: string;
  /** 额外启用组件目录（宿主机绝对路径，只读挂载） */
  componentsDir?: string;
}

/** POST /preview/:docId 响应 */
export interface PreviewResponse {
  docId: string;
  status: SessionStatus;
  previewUrl: string | null;
  /** 排队位置，仅 pending 时有意义 */
  queuePosition?: number;
  message?: string;
}
