/**
 * 受限 Slidev MD 规范 + 各链路 system prompt。
 *
 * 目的：约束 AI 严格输出能被 parseSlidev 互逆解析的 MD，
 * 避免 Slidev 不支持的语法导致发布翻车。
 */
import type { ParsedDoc } from '@slidev-ppt/shared';
import { renderComponentManifestForPrompt } from './component-manifest.js';

/** 受限 MD 规范，generate 与 update 共用。 */
export const SLIDEV_MD_SPEC = `# 受限 Slidev MD 规范（必须严格遵守）

- 文档以 frontmatter 开头：第一行 \`---\`，中间是 YAML（至少含 \`theme\`），再一行 \`---\`。
- 每一页之间用单独一行的 \`---\` 分页符分隔（前后各留一个空行）。
- 不要在页面正文里出现单独成行的 \`---\`（会被误判为分页符）。
- frontmatter 之外不要写 HTML <script> / <style> 块。
- 组件调用用自闭合标签：<BarChart :data="data" />，props 用 : 绑定。
  数据可在该页用 \`{{ ${'`'}const data = [...]${'`'} }}\` 代码块定义，或直接写字面量。
- 主题只从内置主题选（default / seriph / apple-basic / bricks）；不确定就用 default。
- 每页内容精炼，标题用 # / ##，要点用 - 列表，不要用表格嵌套表格。
- 输出纯 MD，不要包外层 \`\`\`markdown 代码块。`;

/** 数据可视化页优先用组件的提示，generate 与 update 共用。 */
const COMPONENT_GUIDE = `# 可用内置组件（数据可视化页优先用组件，不要用纯文字罗列数据）

${renderComponentManifestForPrompt()}

数据对比 / 关键指标页应使用上述组件；纯文字说明页不必强行使用。`;

/** 大纲结构（generate 第一步产出）。 */
export interface OutlineSlide {
  title: string;
  points: string[];
  imageSuggestion?: string;
  componentSuggestion?: string;
}
export interface Outline {
  title: string;
  theme: string;
  slides: OutlineSlide[];
}

/** generate 第一步：对话澄清 → JSON 大纲。 */
export function buildOutlineSystemPrompt(): string {
  return `你是 PPT 大纲设计助手。根据用户需求产出一份 JSON 大纲，用于后续生成 Slidev PPT。

${COMPONENT_GUIDE}

# 输出格式（只输出一个 JSON 对象，不要任何解释文字）

\`\`\`json
{
  "title": "PPT 总标题",
  "theme": "default",
  "slides": [
    {
      "title": "该页标题",
      "points": ["要点1", "要点2"],
      "imageSuggestion": "配图建议（可空字符串）",
      "componentSuggestion": "建议组件名如 BarChart / StatCard，无则留空字符串"
    }
  ]
}
\`\`\`

要求：6～10 页；首页为封面，末页为结束页；数据页在 componentSuggestion 里给出组件建议。`;
}

/** generate 第二步：大纲 → Slidev MD。 */
export function buildGenerateSystemPrompt(): string {
  return `你是 Slidev PPT 生成助手。根据输入的 JSON 大纲，生成完整 Slidev MD 文档。

${SLIDEV_MD_SPEC}

${COMPONENT_GUIDE}

直接输出 MD 正文，不要任何解释、不要外层代码块。组件建议非空的数据页必须使用对应组件标签。`;
}

/**
 * update：对话意图 → EditOp[]。
 * 注入当前文档分页结构 + 组件清单 + ops schema 说明。
 */
export function buildUpdateSystemPrompt(doc: ParsedDoc | null): string {
  const slidesOverview = doc
    ? doc.slides
        .map((s) => {
          const firstLine = s.content.split('\n')[0]?.slice(0, 60) ?? '';
          return `  #${s.index}: ${firstLine}`;
        })
        .join('\n')
    : '（空文档，无现有页面）';

  return `你是 Slidev PPT 编辑助手。用户想修改当前 PPT，你需要输出一组页级编辑操作（ops）。

${SLIDEV_MD_SPEC}

${COMPONENT_GUIDE}

# 当前文档结构（0-based 页序号）
${slidesOverview}

# 编辑操作（ops）schema

每个 op 是一个对象，type 取值之一：
- updateSlide：改某一页正文。字段 index（0-based）、md（新正文，不含分页符）、reason。
- insertSlide：新增一页。字段 after（插到第几页之后，-1 插到最前）、md、reason。
- deleteSlide：删页。字段 index、reason。（破坏性，前端会要求用户确认）
- moveSlide：移动页顺序。字段 from、to（0-based）、reason。（破坏性，前端会要求用户确认）
- updateFrontmatter：改 frontmatter 顶层字段。字段 patch（对象，key->值；null 表示删 key）、reason。

每个 op 都必须带 reason（给用户的中文一句话说明）。
index/after/from/to 都是 0-based 页序号，必须落在当前文档页范围内。

${
  '' /* json 模式下由 endpoint 追加输出格式说明；tool_use 模式下走 apply_edits 工具 */
}
先在正文里用中文说明你的修改思路，再提交 ops。`;
}

/** json 模式下追加的输出格式说明。 */
export const JSON_OPS_OUTPUT_INSTRUCTION = `# 输出格式（必须严格遵守）

你的回复必须由两部分组成：

1. 先用一两句中文说明修改思路（给用户看的打字机说明）。
2. 紧接着输出一个 \`json\` 代码块，内含 ops 数组：

\`\`\`json
{ "ops": [ { "type": "updateSlide", "index": 0, "md": "# 新标题", "reason": "把第1页标题改为新标题" } ] }
\`\`\`

硬性要求：
- 必须输出、且只输出一个 \`\`\`json 代码块；代码块之外只能有中文说明，不能有其它代码块。
- 代码块内容必须是合法 JSON：\`{ "ops": [...] }\`，每个 op 必须含 \`type\` 与 \`reason\`。
- 不要在 JSON 里写注释；字符串内不要用裸双引号，用中文引号「」或转义。
- 即使没有任何修改，也要输出 \`{ "ops": [] }\` 的代码块，不能只输出说明。

示例（用户：「把第1页标题改成你好」）：
好的，把第1页标题改为「你好」。
\`\`\`json
{ "ops": [ { "type": "updateSlide", "index": 0, "md": "# 你好", "reason": "将第1页标题改为你好" } ] }
\`\`\``;
