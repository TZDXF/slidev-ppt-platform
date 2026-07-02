# Slidev PPT 平台

AI 对话生成 PPT 平台，基于 Slidev 实现，支持站内发布。

## 架构

- **编辑态**：后端按需启动 Slidev dev server 容器池，前端 iframe 接入专属预览 URL，完整支持 Vue 组件、插件、动画与 HMR。
- **发布态**：slidev build 队列 + 内容哈希缓存，静态产物上对象存储/CDN，公开短链访问。
- **AI 生成链路**：对话澄清 → JSON 大纲 → Slidev MD，SSE 流式输出，支持多轮修改。
- **AI 更新链路**：Claude tool_use 输出页级 CRUD ops，后端按分页数组应用，直接应用 + 可撤销，删页/重排先确认。
- **组件体系**：内置 Vue 组件库 + 组件市场（白名单审核后启用）。

## 技术栈

- 前端：Nuxt3 + TypeScript + TailwindCSS + Pinia + CodeMirror6 + ai-elements-vue
- 后端 API：Nuxt server routes (nitro)
- 渲染调度：独立 Node 服务 + Docker 容器池 + Nginx
- 构建发布：BullMQ + Redis + 对象存储/CDN
- AI 链路：@anthropic-ai/sdk（sonnet-4-6 对话，opus-4-8 复杂结构）
- 数据：PostgreSQL (Drizzle) + Redis + 对象存储
- 部署：国内

## 仓库结构（规划中）

```
apps/
  web/            # Nuxt3 前端 + server routes
  render-service/ # Slidev dev server 容器调度服务
  build-worker/   # slidev build 队列 worker
packages/
  components/     # 内置 Vue 组件库
  shared/         # 共享类型与工具
```

详细架构与小队分工见 Multica 项目描述。

## 一键启动（Docker Compose）

编排 redis + minio（S3 兼容对象存储）+ web + render-service + build-worker，
仅 `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` 需宿主提供（国内走代理），其余依赖由 compose 注入。

```bash
# 1. 配置环境变量（填入 ANTHROPIC_*；模型默认 step-3.7-flash，可改）
cp .env.example .env

# 2. 一次性构建 render-service 启动 dev server 用的基础镜像（预装 slidev + 主题 + 组件）
docker build -f apps/render-service/Dockerfile -t slidev-ppt-render:latest .

# 3. 构建并启动全部服务
docker compose up -d --build

# 4. 访问
#    编辑器：        http://localhost:3000
#    MinIO console： http://localhost:9001  （minioadmin / minioadmin）
```

服务端口：

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| web | 3000 | Nuxt 前端 + server routes |
| render-service | 3100 | dev server 容器调度 / 预览反代 |
| redis | 6379 | BullMQ 队列 + 发布元数据 |
| minio | 9000 / 9001 | S3 API / console（bucket: `slidev-ppt`） |

> render-service 通过挂载 `/var/run/docker.sock` 访问宿主 Docker daemon 以起停 dev server
> 容器——**仅开发环境**；生产用 K8s 或 DinD。

### 验证发布链路

无需前端，直接 curl 后端：

```bash
# 入队构建（pptId 任取；md 为 Slidev MD）
curl -X POST http://localhost:3000/api/ppt/publish \
  -H 'content-type: application/json' \
  -d '{"pptId":"demo","md":"---\ntheme: seriph\n---\n# Hello\n\n## page 2\n","components":[]}'

# 轮询发布状态，published 后返回公开 URL
curl http://localhost:3000/api/ppt/demo

# 公开 URL 形如 http://localhost:9000/slidev-ppt/p/demo/ （直走 MinIO，不经过 Node）
```

同一内容二次发布命中内容哈希缓存，秒回相同 URL（`cached: true`）。

### 常用命令

```bash
docker compose logs -f web build-worker   # 看日志
docker compose down                        # 停止（保留数据卷）
docker compose down -v                     # 停止并清空 redis/minio 数据
```

