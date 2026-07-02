# syntax=docker/dockerfile:1
#
# apps/web/Dockerfile — Nuxt 前端 + server routes 运行镜像。
#
# 多阶段：builder 阶段在 monorepo 内 `nuxt build` 产出 .output；
# runner 阶段仅携带 .output，以 `node .output/server/index.mjs` 运行。
#
# 构建（在仓库根目录）：
#   docker build -f apps/web/Dockerfile -t slidev-ppt-web:latest .
#
# 运行（见根目录 docker-compose.yml）：暴露 3000，依赖 redis / minio / render-service。
# ANTHROPIC_* 走宿主 .env；其余依赖项由 compose 注入。

# ---------- builder ----------
FROM node:20-slim AS builder

WORKDIR /repo

# 启用 pnpm（版本固定在根 package.json 的 packageManager 字段）
RUN corepack enable

# 先装依赖（利用层缓存）：仅拷 workspace 清单与各包 package.json
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/render-service/package.json apps/render-service/package.json
COPY apps/build-worker/package.json apps/build-worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/components/package.json packages/components/package.json
RUN pnpm install --frozen-lockfile

# 拷源码并构建 web（含 Nuxt 客户端 + nitro server）
COPY apps/web apps/web
COPY packages packages
RUN pnpm --filter @slidev-ppt/web build

# ---------- runner ----------
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# 仅携带构建产物（含 .output/server 与 .output/public）
COPY --from=builder /repo/apps/web/.output ./.output

EXPOSE 3000

# Nuxt nitro 默认监听 3000；HOST=0.0.0.0 让容器外可达
ENV HOST=0.0.0.0
ENV PORT=3000
CMD ["node", ".output/server/index.mjs"]
