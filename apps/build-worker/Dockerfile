# syntax=docker/dockerfile:1
#
# apps/build-worker/Dockerfile — 发布态构建 worker 运行镜像。
#
# 职责：消费 BullMQ build 队列，执行 `slidev build`，产物上对象存储/CDN。
# 因此镜像需预装 @slidev/cli + 常用主题（build-worker 直接跑 slidev build，
# 见 src/builder.ts 的 SLIDEV_BIN / npm install 主题逻辑）。
#
# 多阶段：
#   builder  tsc 编译 build-worker → dist；pnpm deploy 打包自包含 /deploy（含 prod 依赖
#            与 workspace 依赖 @slidev-ppt/shared 源码）
#   runtime  携带 /deploy + 全局预装 slidev 与主题；以 tsx 运行 dist
#
# 运行时用 tsx（而非纯 node）的原因：@slidev-ppt/shared 以 TS 源码为入口
# （main → src/index.ts），build-worker 的 dist 仍 `import '@slidev-ppt/shared/publish'`，
# 需 tsx 的 ESM loader 现场转译 shared 的 .ts。后续若给 shared 增加构建步骤产出 JS，
# 可改回 `node dist/index.js`。
#
# 构建（在仓库根目录）：
#   docker build -f apps/build-worker/Dockerfile -t slidev-ppt-build-worker:latest .

# ---------- builder ----------
FROM node:20-slim AS builder

WORKDIR /repo
RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/render-service/package.json apps/render-service/package.json
COPY apps/build-worker/package.json apps/build-worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/components/package.json packages/components/package.json
RUN pnpm install --frozen-lockfile

COPY apps/build-worker apps/build-worker
COPY packages packages
# tsc 编译 → dist（类型校验 + 产出）
RUN pnpm --filter @slidev-ppt/build-worker build
# 打包自包含目录 /deploy：含 dist + src + node_modules（prod 依赖 + workspace shared 源码）
RUN pnpm deploy --filter=@slidev-ppt/build-worker --prod --legacy /deploy

# ---------- runtime ----------
FROM node:20-slim AS runtime

WORKDIR /app

# 全局预装：tsx（运行时转译 shared 的 .ts）+ Slidev CLI + 常用主题。
# build-worker 在临时项目目录跑 `slidev build`；主题由 src/builder.ts 写入临时
# package.json 后 `npm install`，镜像预装主题可减少运行时联网拉取。
# NODE_PATH 让 /app 项目根能解析到全局 @slidev/theme-*。
RUN npm install -g \
      tsx \
      @slidev/cli \
      @slidev/theme-default \
      @slidev/theme-seriph \
      @slidev/theme-apple-basic \
      @slidev/theme-bricks \
      @slidev/theme-shibainu \
    && slidev --version
ENV NODE_PATH=/usr/local/lib/node_modules

# 自包含产物（dist + node_modules）
COPY --from=builder /deploy ./
# 内置组件源（src/builder.ts 软链启用组件用；COMPONENTS_DIR 指向此处）
COPY --from=builder /repo/packages/components/src ./packages/components/src

# 运行时配置（compose 覆盖）：
#   REDIS_URL / OBJECT_STORAGE_* / CDN_BASE_URL / BUILD_CONCURRENCY
#   SLIDEV_BIN=slidev（用镜像内预装的 CLI，避免 npx 联网）
#   COMPONENTS_DIR=/app/packages/components/src
ENV SLIDEV_BIN=slidev
ENV COMPONENTS_DIR=/app/packages/components/src
ENV BUILD_CONCURRENCY=2
ENV BUILD_TIMEOUT_MS=120000

# 无 HTTP 端口；长驻消费队列。tsx 现场转译 shared 的 .ts
CMD ["tsx", "dist/index.js"]
