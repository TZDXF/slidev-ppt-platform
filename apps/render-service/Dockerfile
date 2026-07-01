FROM node:20-slim
# 渲染服务基础镜像：预装 Slidev + 主题 + 内置组件
# 实际构建由渲染服务工程师完善
WORKDIR /app
RUN npm install -g @slidev/cli
EXPOSE 3030
CMD ["node", "dist/index.js"]
