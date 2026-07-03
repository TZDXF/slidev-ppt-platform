/**
 * 渲染调度服务配置。
 *
 * 所有可调参数集中在此，从环境变量读取，给出与任务要求一致的默认值：
 * - 并发上限默认 20（活跃容器数）
 * - 空闲回收 5-10 分钟，默认 300s（5min），可通过 IDLE_TIMEOUT_MS 上调到 600s
 * - 每容器内存 512MB / CPU 0.5 核
 * - 崩溃自动重启 1 次后标记 failed
 */

export interface Config {
  /** 本服务监听端口 */
  port: number;
  /** 调度池活跃容器上限，超出进队列返回 pending */
  maxContainers: number;
  /** 空闲回收超时（ms），无 HMR/预览请求即销毁 */
  idleTimeoutMs: number;
  /** 心跳检测间隔（ms） */
  healthCheckIntervalMs: number;
  /** 容器启动后多久才算健康检查超时（ms） */
  startGraceMs: number;
  /** 崩溃后最大重启次数（任务要求：重启一次后标记 failed） */
  maxRestarts: number;
  /** 每容器内存上限（字节） */
  containerMemoryBytes: number;
  /** 每容器 CPU 配额（核） */
  containerCpus: number;
  /** Slidev dev server 容器内端口 */
  containerPort: number;
  /** 容器基础镜像 */
  image: string;
  /** 沙箱内网 docker network 名（internal，禁出站） */
  sandboxNetwork: string;
  /** 会话文件根目录（每文档一个子目录，挂载进容器） */
  sessionsDir: string;
  /**
   * 会话命名卷名。render-service 自身以 ${sessionsDir} 挂载该卷（compose: render-sessions:/data/sessions），
   * dev server 容器则以 :ro 挂载同一卷到 /deck —— 必须用命名卷而非 bind 路径，因为 render-service
   * 跑在容器内、经宿主 docker.sock 起容器，bind mount 的源路径会被宿主 daemon 解释为宿主路径，
   * 而宿主上并不存在 /data/sessions/...（数据在命名卷里），Docker 便会把源路径建成空目录挂进容器，
   * Slidev 读目录即 EISDIR 崩溃。命名卷由 daemon 按名解析，两端指向同一份数据，绕开路径翻译陷阱。
   */
  sessionVolume: string;
  /** 内置组件目录（镜像内路径，由 Dockerfile 预装） */
  builtinComponentsDir: string;
  /** 预览 URL 基址。本地：http://localhost:3100 → previewUrl = ${base}/p/<token> */
  previewBase: string;
  /** 预览 URL 形态：port（默认，反代到本服务）| subdomain（Nginx 把 preview-<token>.<host> 重写到 /p/<token>/） */
  previewMode: 'port' | 'subdomain';
  /** Docker 二进制路径 */
  dockerBin: string;
  /** 调试模式：DOCKER_MODE=mock 时不真实起容器，便于无 Docker 环境跑通端到端 */
  dockerMode: 'real' | 'mock';
}

function num(env: string | undefined, fallback: number): number {
  if (env === undefined || env === '') return fallback;
  const n = Number(env);
  return Number.isFinite(n) ? n : fallback;
}

export const config: Config = {
  port: num(process.env.PORT, 3100),
  maxContainers: num(process.env.RENDER_MAX_CONTAINERS, 20),
  idleTimeoutMs: num(process.env.IDLE_TIMEOUT_MS, 5 * 60 * 1000),
  healthCheckIntervalMs: num(process.env.HEALTH_CHECK_INTERVAL_MS, 15 * 1000),
  startGraceMs: num(process.env.START_GRACE_MS, 30 * 1000),
  maxRestarts: num(process.env.MAX_RESTARTS, 1),
  containerMemoryBytes: num(process.env.CONTAINER_MEMORY_MB, 512) * 1024 * 1024,
  containerCpus: num(process.env.CONTAINER_CPUS, 0.5),
  containerPort: num(process.env.CONTAINER_PORT, 3030),
  image: process.env.RENDER_IMAGE ?? 'slidev-ppt-render:latest',
  sandboxNetwork: process.env.SANDBOX_NETWORK ?? 'slidev-sandbox',
  sessionsDir: process.env.SESSIONS_DIR ?? './.sessions',
  sessionVolume: process.env.SESSION_VOLUME ?? 'render-sessions',
  builtinComponentsDir: process.env.BUILTIN_COMPONENTS_DIR ?? '/app/components',
  previewBase: process.env.PREVIEW_BASE ?? `http://localhost:${num(process.env.PORT, 3100)}`,
  previewMode: (process.env.PREVIEW_MODE ?? 'port') as 'port' | 'subdomain',
  dockerBin: process.env.DOCKER_BIN ?? 'docker',
  dockerMode: (process.env.DOCKER_MODE ?? 'real') as 'real' | 'mock',
};

/** 根据模式构造预览 URL */
export function buildPreviewUrl(token: string): string {
  if (config.previewMode === 'subdomain') {
    // 例：PREVIEW_BASE=ppt.example.com → http://preview-<token>.ppt.example.com
    return `http://preview-${token}.${config.previewBase}`;
  }
  // 必须带尾斜杠：dev server 以 --base /p/<token>/ 启动，Vite 对裸 /p/<token>（无尾斜杠）
  // 直接回 404 "did you mean /p/<token>/" 而非 302 跳转，iframe 接入会拿到 404 空白页。
  return `${config.previewBase}/p/${token}/`;
}
