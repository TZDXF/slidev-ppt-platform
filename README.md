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
