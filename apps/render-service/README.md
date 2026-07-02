# @slidev-ppt/render-service

编辑态实时渲染后端：按需启动 Slidev dev server Docker 容器池，为每个文档签发专属预览 URL，
供前端 iframe 接入（PR #4 已就绪的「拿到 previewUrl 就 iframe 接入」契约）。

## 职责（与 Agent Identity 一致）

- 容器化 Slidev dev server，按需启停调度池
- 空闲回收（默认 5min，可配 5-10min 无 HMR 请求即销毁）
- 并发上限 + 排队（默认 20，超出返回 pending 供前端轮询）
- 每实例挂载用户 MD + 主题 + 启用组件目录
- 反代专属预览 URL（端口 / 子域名两种形态）
- 资源隔离：每容器内存 512MB / CPU 0.5 核
- 沙箱：`--dns 127.0.0.1` 黑洞出站、`--cap-drop ALL`、`no-new-privileges`、`CHOKIDAR_USEPOLLING` 保证 bind mount 上 HMR 可靠

> 边界：不负责构建发布（build-worker）、不负责前端 UI；只提供预览 URL 与生命周期 API。

## 模块

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | HTTP 入口：路由 + 反代（HTTP / WS 升级） |
| `src/pool.ts` | 调度器：分配/复用、排队、空闲回收、崩溃恢复、就绪探测、指标 |
| `src/docker.ts` | Docker CLI 包装：起/停/探活/端口映射；含 mock 模式 |
| `src/session-store.ts` | 每文档会话目录（slides.md + 组件挂载点） |
| `src/config.ts` | 环境变量配置 + previewUrl 构造 |
| `src/types.ts` | 共享类型 |

## API

| 方法 路径 | 说明 |
| --- | --- |
| `POST /preview/:docId` | body `{ md?, componentsDir? }` → `{ previewUrl, status }`；并发满时返回 `pending` + `queuePosition` |
| `GET /preview/:docId` | 查询状态（pending 时带 `queuePosition`，前端轮询用） |
| `PUT /preview/:docId/md` | body `{ md }` → 写入 slides.md，已存在容器则 Slidev HMR 自动重渲染 |
| `DELETE /preview/:docId` | 手动销毁容器 |
| `GET /health` | 服务健康 |
| `GET /metrics` | 调度指标（活跃/就绪/排队、冷启动耗时、回收参数） |
| `ALL /p/:token/*` | 反代到容器 dev server（HTTP + WebSocket HMR），并重置空闲计时器 |

`status` 取值：`pending` / `starting` / `ready` / `restarting` / `failed` / `stopped`。

## 预览 URL 形态

- `PREVIEW_MODE=port`（默认，本地联调）：`previewUrl = ${PREVIEW_BASE}/p/<token>`
  流量经本服务反代，天然支持空闲计时与 HMR 转发。
- `PREVIEW_MODE=subdomain`（生产）：`previewUrl = http://preview-<token>.<host>`
  由 Nginx 把 `preview-<token>.<host>` 重写到 `/p/<token>/` 再回源本服务：
  ```nginx
  server {
    server_name ~^preview-(?<token>[a-z0-9]+)\.ppt\.example\.com$;
    location / {
      proxy_pass http://render-service:3100/p/$token/;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;   # 透传 HMR WebSocket
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 3600s;
    }
  }
  ```

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | 3100 | 服务监听端口 |
| `RENDER_MAX_CONTAINERS` | 20 | 活跃容器上限 |
| `IDLE_TIMEOUT_MS` | 300000 | 空闲回收超时（5-10min） |
| `HEALTH_CHECK_INTERVAL_MS` | 15000 | 心跳间隔 |
| `START_GRACE_MS` | 30000 | 启动就绪宽限 |
| `MAX_RESTARTS` | 1 | 崩溃重启上限（之后标记 failed） |
| `CONTAINER_MEMORY_MB` | 512 | 每容器内存 |
| `CONTAINER_CPUS` | 0.5 | 每容器 CPU |
| `CONTAINER_PORT` | 3030 | 容器内 dev server 端口 |
| `RENDER_IMAGE` | slidev-ppt-render:latest | 基础镜像 |
| `SANDBOX_NETWORK` | slidev-sandbox | 内网 network（--internal） |
| `SESSIONS_DIR` | ./.sessions | 会话文件根目录 |
| `SESSION_VOLUME` | render-sessions | 会话命名卷名（dev server 容器以 :ro 挂载到 /deck；compose 下须与 volumes 声明一致） |
| `PREVIEW_BASE` | http://localhost:3100 | 预览 URL 基址 |
| `PREVIEW_MODE` | port | port \| subdomain |
| `DOCKER_MODE` | real | real \| mock（无 Docker 时跑通联调） |

## 构建镜像

```bash
# 仓库根目录
docker build -f apps/render-service/Dockerfile -t slidev-ppt-render:latest .
```

镜像预装 `@slidev/cli` + 常用主题 + `packages/components` 内置组件到 `/app/components`，
容器以 `slidev slides.md --port 3030 --host 0.0.0.0` 启动，`slides.md` 由本服务挂载。

## 本地运行

```bash
# 真实模式（需 Docker 守护进程 + 已构建镜像）
pnpm --filter @slidev-ppt/render-service dev

# mock 模式（无需 Docker，验证调度/排队/回收/反代 API）
DOCKER_MODE=mock pnpm --filter @slidev-ppt/render-service dev

# 验证
curl -X POST http://localhost:3100/preview/test -H 'content-type: application/json' \
  -d '{"md":"---\ntheme: seriph\n---\n# Hello\n"}'
curl http://localhost:3100/metrics
```

## 调度策略

- **并发**：以 `docId` 为粒度复用，同一文档复用同一容器；活跃容器达上限时新请求入 FIFO 队列
  返回 `pending`，前端轮询 `GET /preview/:docId`；有容器释放（空闲回收/手动销毁）时按 FIFO 唤醒队首。
- **回收**：每个会话维护 `idleTimer`，任何经 `/p/:token` 的预览/HMR 请求（含 WS 升级）或 MD 写入
  都重置定时器；超时（默认 5min）销毁容器并清理会话目录。
- **崩溃恢复**：心跳轮询容器 `State.Running`；ready 态容器崩溃 → 重启 1 次（`MAX_RESTARTS`），
  仍失败则标记 `failed`，不再自动拉起。
- **冷启动**：就绪探测轮询容器 HTTP `/`，`readyAt - startedAt` 即冷启动耗时，记入 `/metrics`。
