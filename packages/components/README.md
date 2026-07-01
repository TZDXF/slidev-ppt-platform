# @slidev-ppt/components

内置 Vue 组件库（首版）。随 Slidev 基础镜像预装，Slidev 会自动加载 `components/` 下的 `.vue` 文件并全局注册，用户在 MD 中可直接以标签调用。

## 设计取向

- 图表（BarChart / LineChart）**纯 SVG 自绘**，无运行时图表库依赖，体积小、副作用少。
- 样式用 Slidev CSS 变量（`--slidev-theme-primary` / `--slidev-code-*`）适配深浅色。
- 数据为空时降级为占位提示，不崩溃。
- CodeBlock 基于 shiki 动态加载，失败时降级为纯文本。

## 组件清单

| 组件 | 用途 | 必填 props |
| --- | --- | --- |
| `BarChart` | 柱状图 | `data` |
| `LineChart` | 折线图 | `data` |
| `StatCard` | 统计卡片 | `value`, `label` |
| `Timeline` | 时间线 | `items` |
| `ProgressBar` | 进度条 | `value` |
| `CodeBlock` | 代码高亮块 | `code` |

## MD 调用示例

### BarChart

```vue
<BarChart
  :data="[
    { label: 'Q1', value: 120 },
    { label: 'Q2', value: 200 },
    { label: 'Q3', value: 160 }
  ]"
  color="#42b883"
  unit="万"
/>
```

props：`data: { label: string; value: number }[]`（必填）；`color?`、`height?=300`、`unit?`。

### LineChart

```vue
<LineChart
  :data="[
    { label: '1月', value: 30 },
    { label: '2月', value: 65 },
    { label: '3月', value: 50 }
  ]"
  :area="true"
/>
```

props：`data`（必填）；`color?`、`height?=300`、`unit?`、`area?=true`。

### StatCard

```vue
<StatCard :value="98.6" label="可用率" unit="%" :trend="2.4" />
```

props：`value: string | number`、`label`（必填）；`unit?`、`trend?: number | 'up' | 'down'`（number 自动判定方向）。

### Timeline

```vue
<Timeline
  :items="[
    { time: '2026-01', title: '立项', desc: '需求确认' },
    { time: '2026-03', title: '内测' },
    { time: '2026-06', title: '正式发布' }
  ]"
/>
```

props：`items: { time: string; title: string; desc?: string }[]`（必填）。

### ProgressBar

```vue
<ProgressBar :value="68" label="完成度" />
```

props：`value: number`（0–100，必填）；`label?`、`color?`。

### CodeBlock

```vue
<CodeBlock
  lang="ts"
  title="hello.ts"
  code="const greet = (name: string) => `Hello, ${name}`"
/>
```

props：`code: string`（必填）；`lang?='text'`、`title?`。语言标识与 shiki 一致（`ts` / `vue` / `bash` / `json` ...）。使用双主题（github-light / github-dark），随 Slidev 深浅色自动切换。

## 组件 schema（供 AI 链路）

`src/index.ts` 旁导出 `componentSchemas`（亦可通过 `@slidev-ppt/components/schemas` 引入），每项为 `{ name, description, props }`，`props` 是标准 JSON schema。AI 对话链路工程师将其注入 prompt，让 AI 在生成 MD 时按需调用组件。

```ts
import { componentSchemas } from '@slidev-ppt/components';
```

## 本地验证

```bash
pnpm --filter @slidev-ppt/components typecheck
```

或在 web app 临时页中引入任一组件做可视化验证。组件已用 `computed` 派生渲染数据，传入空数组会渲染「无数据」占位而非报错。
