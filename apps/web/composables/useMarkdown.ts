import markdownit from 'markdown-it';
import DOMPurify from 'dompurify';

/**
 * Markdown 渲染（聊天消息用）。
 *
 * 解析链路：markdown-it（html:false）→ 客户端 DOMPurify 清洗 → HTML 字符串。
 *
 * - html:false：AI 内容里的原始 HTML 一律转义不渲染，第一道 XSS 防线。
 * - DOMPurify：第二道防线，兜底 markdown-it 潜在漏洞；服务端无 window 不可用，
 *   但 html:false 下 markdown-it 输出本身已安全，SSR 直接返回。
 * - 链接强制 target=_blank + rel=noopener noreferrer，防反向跳转/tabnabbing。
 * - breaks:true：单换行渲染为 <br>，贴合对话语气。
 *
 * 代码块语法高亮不在这里做 —— markdown-it 只产出 <pre><code class="language-x">
 * 的纯文本代码块，由 MarkdownView 组件用 shiki 后处理（流式期间防抖，避免逐 token 卡顿）。
 */
const md = markdownit({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

// 外链新标签打开 + 安全 rel（追加而非覆盖，保留 markdown-it 已有的 href 等）
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (!token) return defaultLinkOpen(tokens, idx, options, env, self);
  // attrSet：存在则覆盖、不存在则新增，省去 attrIndex/attrs 手工下标
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/**
 * 把 markdown 文本渲染成已清洗的 HTML 字符串。
 * 服务端返回 markdown-it 原始输出（html:false 已安全）；客户端再过 DOMPurify。
 * 用 typeof window 而非 import.meta.client，避免 SSR 类型上下文缺失时报错。
 */
export function renderMarkdown(content: string): string {
  const html = md.render(content ?? '');
  if (typeof window === 'undefined') return html;
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
  });
}
