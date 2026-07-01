# AI 对话链路（生成 + 页级 CRUD 更新）

实现 issue AIP-3 的两步生成链路与方案 A 页级 CRUD 更新链路。所有 AI 调用都在
Nuxt server routes 内完成，key / baseUrl 走 `runtimeConfig`，绝不暴露给客户端。

## 端点

### `POST /api/ai/generate` —— 全量生成（大纲 → MD）

请求体：`{ message: string, history?: {role, content}[] }`

两步链路：
1. 对话澄清 → JSON 大纲（`Outline`：title / theme / 每页要点 / 配图建议 / 组件选用建议）
2. 大纲 → Slidev MD（frontmatter + `---` 分页 + 组件标签），流式输出

SSE 事件：

| event | data | 说明 |
|-------|------|------|
| `outline` | `{ outline }` | 第一步产出的大纲 JSON |
| `md` | `{ delta }` | 第二步 MD 增量 |
| `done` | `{ md, slides }` | 完整 MD（经 `serializeSlidev(parseSlidev(md))` 校验互逆）+ 页数 |
| `error` | `{ message }` | |

### `POST /api/ai/update` —— 页级 CRUD 更新（方案 A）

请求体：`{ docMd, message, history?, confirm?, requestId? }`

流程：
1. `parseSlidev(docMd)` → 注入分页结构 + 组件清单到 system prompt
2. Claude `tool_use`（或 json 模式）产出 `EditOp[]`（见 `@slidev-ppt/shared/ops`）
3. SSE 流式：**先 `reason` 增量（AI 自然语言说明），再 `ops`**
4. 破坏性 op（`deleteSlide` / `moveSlide`）且未带 `confirm` → 返回 `pending_confirm`，**不 apply**
5. 否则 `applyOps` → `serializeSlidev` 写回；apply 前存版本快照（可撤销）

确认回流：前端带 `requestId` + `confirm:true` 再次调用 → 直接 apply 缓存的 ops，不重跑 AI。

SSE 事件：

| event | data | 说明 |
|-------|------|------|
| `reason` | `{ delta }` | AI 说明增量 |
| `ops` | `{ ops }` | `EditOp[]` |
| `pending_confirm` | `{ requestId, ops, message }` | 破坏性 ops 待确认（未 apply） |
| `applied` | `{ md, slides, snapshotId, previousMd }` | 应用后的新 MD + 快照 |
| `done` | `{}` | |
| `error` | `{ message }` | |

## 模型与模式

`runtimeConfig`：

| key | 环境变量 | 默认 | 说明 |
|-----|---------|------|------|
| `anthropicApiKey` | `ANTHROPIC_API_KEY` | — | 必填 |
| `anthropicBaseUrl` | `ANTHROPIC_BASE_URL` | — | 国内代理地址 |
| `anthropicChatModel` | `ANTHROPIC_CHAT_MODEL` | `claude-sonnet-4-6` | 对话 / 页级 CRUD |
| `anthropicStructureModel` | `ANTHROPIC_STRUCTURE_MODEL` | `claude-opus-4-8` | 大纲 / 全量重生成 |
| `aiOpsMode` | `AI_OPS_MODE` | `tool_use` | `tool_use`（生产）/ `json`（兼容） |

**ops 模式**：
- `tool_use`（默认，生产 Claude）：用 `apply_edits` 工具约束 `EditOp[]` 输出，最稳。
- `json`：让模型在正文末尾输出 ` ```json {"ops":[...]} ` 代码块。为不支持 `tool_use`
  的兼容代理（如测试用的 MiniMax-M2.5 代理）保留通路。两种模式产出同一组 SSE 事件。

## 模块

| 文件 | 职责 |
|------|------|
| `server/utils/ai/models.ts` | 模型默认值、OpsMode 类型 |
| `server/utils/ai/config.ts` | runtimeConfig 读取、客户端构造 |
| `server/utils/ai/component-manifest.ts` | 内置组件清单 + 占位 props schema → prompt |
| `server/utils/ai/prompts.ts` | 受限 MD 规范 + outline/generate/update system prompt |
| `server/utils/ai/ops-schema.ts` | `apply_edits` 工具 schema + `normalizeOps` |
| `server/utils/ai/ops-collector.ts` | 流式 reason/ops 收集器（tool_use + json 双模式） |
| `server/utils/ai/stream.ts` | Anthropic SDK 流式消费封装 + `completeJson` |
| `server/utils/ai/sse.ts` | SSE ReadableStream 写入器 |
| `server/utils/ai/version-store.ts` | 内存版本快照 + 待确认 ops 缓存（TTL 30min） |

## 组件清单注入

`component-manifest.ts` 导出 `COMPONENT_MANIFEST`（当前占位：BarChart / StatCard），
`renderComponentManifestForPrompt()` 渲染成 prompt 文本注入 outline / generate / update
三处 system prompt，让 AI 在数据可视化页优先用组件标签而非纯文字。组件生态工程师
补全真实 props schema 后替换 `COMPONENT_MANIFEST` 即可，prompt 文本格式不变。

## 样例

- `samples/outline-sample.json` —— generate 第一步产出的大纲
- `samples/generate-sample.md` —— generate 第二步产出的 Slidev MD
- `samples/ops-sample.json` —— update 产出的 `EditOp[]`（insertSlide 拆页）

## 验证（已对测试代理 MiniMax-M2.5 实跑通过）

- `/api/ai/generate` 「做一个产品介绍 PPT」→ 合法 Slidev MD（可被 parseSlidev 互逆解析）
- `/api/ai/update` 「把第1页拆成两页」→ 合法 ops，`applyOps` 后页数 +1 且其余页不变
- SSE 流式可观察到先 `reason` 后 `ops`
- 删页操作未带 `confirm` 时不 apply（返回 `pending_confirm`）；带 `confirm` + `requestId` 回流后 apply

## 边界（本任务不实现）

- 前端 UI（前端工程师并行）
- 渲染调度、构建发布
- 撤销端点（`version-store` 已存快照，撤销 API 后续 issue 实现）
- 组件真实 props schema（待组件生态工程师补全，当前为占位）
