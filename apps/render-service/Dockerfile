# syntax=docker/dockerfile:1
#
# Slidev dev server 运行基础镜像（渲染调度服务按需启动的容器即用此镜像）。
# 任务要求：预装 @slidev/cli + 常用主题 + packages/components 内置组件；冷启动目标 ≤3s。
#
# 构建（在仓库根目录）：
#   docker build -f apps/render-service/Dockerfile -t slidev-ppt-render:latest .
#
# 运行时由 render-service 挂载 slides.md 到 /app/slides.md，并以此镜像启动：
#   slidev slides.md --port 3030 --host 0.0.0.0
# 主题/组件已在镜像内预装，因此容器可在 --internal 网络下禁用出站。

FROM node:20-slim

# 幻灯片项目根：/app。slides.md 由 render-service 挂载，components/ 为内置组件。
WORKDIR /app

# 预装 Slidev CLI 与常用主题（禁出站网络下，MD 引用未预装的主题会失败，故覆盖主流主题）。
# 使用 npm（全局安装到 /usr/local）并设置 NODE_PATH，让 /app 项目根能解析到全局主题包。
RUN npm install -g \
      @slidev/cli \
      @slidev/theme-default \
      @slidev/theme-seriph \
      @slidev/theme-apple-basic \
      @slidev/theme-bricks \
      @slidev/theme-shibainu \
    && mkdir -p /app/components \
    && slidev --version

ENV NODE_PATH=/usr/local/lib/node_modules

# 内置 Vue 组件库（来自 packages/components/src，随镜像预装，Slidev 自动加载）。
COPY packages/components/src/ /app/components/

# 预热 Vite 依赖优化缓存：启动一次 dev server 跑完 optimize，缓存写入
# @slidev/cli/node_modules/.vite，运行时容器直接复用，避免冷启动重复 optimize
# （也避免运行时 MD 变更触发 re-optimize 的内存尖峰导致 512MB OOM）。
RUN printf -- '---\ntheme: seriph\ntitle: warmup\n---\n# Warmup\n\n## page 2\n' > /tmp/warmup.md \
    && timeout 40 slidev /tmp/warmup.md --port 3039 --remote > /tmp/warmup.log 2>&1 || true \
    && rm -f /tmp/warmup.md \
    && find /usr/local/lib/node_modules/@slidev/cli/node_modules/.vite -maxdepth 2 -type d 2>/dev/null | head

# Slidev dev server 默认端口
EXPOSE 3030

# render-service 不以 --read-only 运行（Vite 依赖优化需写 .vite 缓存）；
# 沙箱由 --cap-drop ALL + no-new-privileges + --dns 127.0.0.1 + 资源限额保证，可写层随容器销毁。
# Slidev 52 用 --remote 监听公网主机（bind 默认 0.0.0.0），使映射端口可达。
CMD ["slidev", "slides.md", "--port", "3030", "--remote"]
