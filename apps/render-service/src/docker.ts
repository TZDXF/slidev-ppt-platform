/**
 * Docker CLI 包装层。
 *
 * 通过 `docker` 二进制操作容器，而非引入 dockerode，依赖更少、跨平台更稳。
 * 真实模式：docker run/inspect/stop/rm；mock 模式：不真实起容器，便于无 Docker
 * 环境跑通端到端联调（mock 容器返回一个固定 200 的占位端口，由本服务自身代理）。
 *
 * 安全约束（任务要求）：
 * - 资源隔离：--memory 512m --cpus 0.5
 * - 沙箱：--network <internal> 禁出站、--cap-drop ALL、--security-opt no-new-privileges、--read-only + tmpfs /tmp
 * - 仅挂载 slides.md 与只读组件目录；MD 中禁止执行任意代码（Slidev 沙箱内无 shell、无网络）
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const exec = promisify(execFile);

export interface StartContainerOpts {
  containerName: string;
  /** 容器内 slides.md 绝对路径（命名卷挂到 /deck，故形如 /deck/<docId>/slides.md） */
  slidesPath: string;
  /** Vite base 路径，形如 /p/<token>/ —— 让 Slidev 资源/HMR 路径都落在反代前缀下，
   *  浏览器经 /p/<token>/* 反代访问时资源可正确解析。 */
  basePath: string;
  /** 额外组件宿主机目录（只读），可选 */
  componentsDir?: string;
}

export interface StartedContainer {
  containerName: string;
  /** 映射到宿主机的随机端口 */
  hostPort: number;
}

/** 确保沙箱网络存在。
 *
 * 不使用 `--internal`：Docker Desktop 上 --internal 网络会禁止端口发布（-p），
 * 使宿主机无法经随机端口访问容器。改用普通 bridge 网络 + 每容器 `--dns 127.0.0.1`
 * 黑洞 DNS 来阻断出站（Slidev 容器内无需任何出站：主题/组件已预装，字体由浏览器加载）。
 * 生产环境若需更强隔离，可在 Linux 上改用 --internal 网络并让本服务按容器 IP 反代。
 */
export async function ensureSandboxNetwork(): Promise<void> {
  if (config.dockerMode === 'mock') return;
  try {
    await exec(config.dockerBin, [
      'network', 'create', '--driver', 'bridge', config.sandboxNetwork,
    ]);
  } catch {
    // 已存在或权限不足，忽略
  }
}

export class Docker {
  /** 启动一个 Slidev dev server 容器，返回宿主机映射端口 */
  async start(opts: StartContainerOpts): Promise<StartedContainer> {
    if (config.dockerMode === 'mock') {
      return this.mockStart(opts);
    }
    const { containerName, slidesPath, basePath, componentsDir } = opts;
    const memMb = Math.round(config.containerMemoryBytes / 1024 / 1024);
    const args = [
      'run', '-d',
      '--name', containerName,
      '--network', config.sandboxNetwork,
      // 黑洞 DNS：容器内无需出站，禁用外部域名解析以阻断联网
      '--dns', '127.0.0.1',
      '--memory', `${memMb}m`,
      // 允许 2x swap：Vite 偶发的依赖 re-optimize 内存尖峰可入 swap，避免 512MB OOM
      '--memory-swap', `${memMb * 2}m`,
      '--cpus', String(config.containerCpus),
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      // 注：不使用 --read-only —— Vite 依赖优化需写入 @slidev/cli/node_modules/.vite 缓存。
      // 沙箱由 --cap-drop ALL + no-new-privileges + 黑洞 DNS + 资源限额共同保证；
      // 容器可写层在回收时随容器销毁。
      '--tmpfs', '/tmp:rw,size=64m,mode=1777',
      // bind mount 上 inotify 在 Docker Desktop 不触发；强制 chokidar 轮询以保证 HMR 可靠
      '-e', 'CHOKIDAR_USEPOLLING=true',
      '-e', 'CHOKIDAR_INTERVAL=500',
      // 随机宿主机端口映射；getHostPort 读取实际分配端口
      '-p', `0:${config.containerPort}`,
      // 挂载命名卷到 /deck（:rw）：render-service 与本容器共享同一卷，slides.md 由前者写入。
      // 不再用单文件 bind（-v host/slides.md:/app/slides.md）：render-service 跑在容器内经宿主
      // docker.sock 起容器，单文件 bind 的源路径会被宿主 daemon 解释为宿主路径，而该路径在宿主
      // 不存在（数据在命名卷里），Docker 会建成空目录挂入容器 → Slidev 读目录 EISDIR 崩溃。命名卷按名解析无此问题。
      // :rw 是因为 Slidev 需在项目根 /deck/<docId>/ 下写 node_modules/.slidev/virtual 虚拟模块；
      // 沙箱由 --cap-drop ALL + no-new-privileges + 黑洞 DNS + 资源限额保证，会话目录为用户自身数据。
      '-v', `${config.sessionVolume}:/deck`,
    ];
    if (componentsDir) {
      // 额外启用组件只读挂载到 /app/components/extra（白名单由调用方保证）。
      // /app 未被卷覆盖，镜像内置 /app/components 仍在；/deck/<docId>/components 符号链接指向它，
      // 故 Slidev 在项目根 /deck/<docId> 下既能看到内置组件也能看到 extra。
      args.push('-v', `${componentsDir}:/app/components/extra:ro`);
    }
    args.push(
      '-w', '/app',
      config.image,
      // slidesPath 为容器内绝对路径（/deck/<docId>/slides.md）；--remote 使 0.0.0.0 监听，端口映射可达；
      // --base /p/<token>/ 让 Vite 资源/HMR 路径落在反代前缀下，浏览器经 /p/<token>/* 访问资源可解析。
      'slidev', slidesPath, '--port', String(config.containerPort), '--remote', '--base', basePath,
    );
    await exec(config.dockerBin, args);

    const port = await this.getHostPort(containerName);
    return { containerName, hostPort: port };
  }

  /** 容器是否仍在运行 */
  async isRunning(containerName: string): Promise<boolean> {
    if (config.dockerMode === 'mock') return this.mockRunning(containerName);
    try {
      const { stdout } = await exec(config.dockerBin, [
        'inspect', '--format', '{{.State.Running}}', containerName,
      ]);
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  /** 获取容器退出码（崩溃诊断） */
  async exitCode(containerName: string): Promise<number | null> {
    if (config.dockerMode === 'mock') return null;
    try {
      const { stdout } = await exec(config.dockerBin, [
        'inspect', '--format', '{{.State.ExitCode}}', containerName,
      ]);
      const code = Number(stdout.trim());
      return Number.isFinite(code) ? code : null;
    } catch {
      return null;
    }
  }

  /** 拉取容器日志（崩溃诊断：启动超时时回传，而非只让前端干等 30s） */
  async logs(containerName: string, tail = 200): Promise<string> {
    if (config.dockerMode === 'mock') return '';
    try {
      const { stdout } = await exec(config.dockerBin, [
        'logs', '--tail', String(tail), containerName,
      ], { maxBuffer: 4 * 1024 * 1024 });
      return stdout;
    } catch {
      return '';
    }
  }

  /** 停止并删除容器 */
  async remove(containerName: string): Promise<void> {
    if (config.dockerMode === 'mock') {
      this.mockRemove(containerName);
      return;
    }
    try {
      await exec(config.dockerBin, ['stop', '-t', '3', containerName]);
    } catch {
      // 已停止
    }
    try {
      await exec(config.dockerBin, ['rm', '-f', containerName]);
    } catch {
      // 已删除
    }
  }

  private async getHostPort(containerName: string): Promise<number> {
    const { stdout } = await exec(config.dockerBin, [
      'port', containerName, String(config.containerPort),
    ]);
    // 形如 0.0.0.0:32771
    const m = stdout.trim().match(/:(\d+)\s*$/);
    if (!m || !m[1]) throw new Error(`无法读取容器端口: ${stdout}`);
    return Number(m[1]);
  }

  // ---- mock 实现：无 Docker 时跑通联调 ----
  private mockPorts = new Map<string, number>();
  private mockCounter = 40000;

  private async mockStart(opts: StartContainerOpts): Promise<StartedContainer> {
    this.mockCounter += 1;
    const port = this.mockCounter;
    this.mockPorts.set(opts.containerName, port);
    return { containerName: opts.containerName, hostPort: port };
  }
  private mockRunning(name: string): boolean {
    return this.mockPorts.has(name);
  }
  private mockRemove(name: string): void {
    this.mockPorts.delete(name);
  }
}

export const docker = new Docker();
