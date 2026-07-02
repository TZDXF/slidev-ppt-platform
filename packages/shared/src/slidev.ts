/**
 * Slidev MD 文档结构定义与分页器。
 *
 * Slidev 用 `---` 作为分页符（首页 frontmatter 也是 `---` 包裹）。
 * 本模块把一份 MD 切成「frontmatter + 页面数组」，作为整个平台的唯一真相源：
 * 前端编辑器、渲染服务、构建发布、AI 更新链路都基于这个结构操作。
 */

export interface Frontmatter {
  /** 主题，如 "seriph" / "default" */
  theme?: string;
  /** 原始 frontmatter 文本（保留未知字段，避免编辑时丢失） */
  raw: string;
}

export interface Slide {
  /** 页序号，从 0 开始 */
  index: number;
  /** 该页正文（不含分页符） */
  content: string;
}

export interface ParsedDoc {
  frontmatter: Frontmatter;
  slides: Slide[];
}

const FRONTMATTER_DELIM = '---';
const SLIDE_DELIM = '\n---\n';

/**
 * 从 frontmatter raw 文本中提取 theme 字段值。
 * 兼容 `theme: seriph` 与 `theme: "seriph"` / `theme: 'seriph'`。
 * raw 仍是真相源，theme 仅作为解析缓存，不参与序列化。
 */
function extractTheme(raw: string): string | undefined {
  for (const line of raw.split('\n')) {
    const m = line.match(/^theme:\s*(.+?)\s*$/);
    if (!m || m[1] === undefined) continue;
    let val = m[1];
    // 去引号
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    const trimmed = val.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return undefined;
}

/**
 * 解析 Slidev MD 文档为 frontmatter + slides。
 * 容错处理：首部若无 frontmatter，则 raw 为空字符串。
 */
export function parseSlidev(md: string): ParsedDoc {
  const text = md.replace(/\r\n/g, '\n');
  let frontmatter: Frontmatter = { raw: '' };
  let body = text;

  // 首部 frontmatter
  if (text.startsWith(FRONTMATTER_DELIM)) {
    const closeIdx = text.indexOf('\n' + FRONTMATTER_DELIM + '\n', FRONTMATTER_DELIM.length);
    if (closeIdx !== -1) {
      const end = closeIdx + FRONTMATTER_DELIM.length + 1; // 含末尾 \n
      const raw = text.slice(FRONTMATTER_DELIM.length + 1, closeIdx);
      frontmatter = { raw, theme: extractTheme(raw) };
      body = text.slice(end);
    }
  }

  const parts = body.split(SLIDE_DELIM).map(s => s.replace(/^\n+|\n+$/g, ''));
  const slides: Slide[] = parts
    .filter((s, i) => !(i === 0 && s === ''))
    .map((content, index) => ({ index, content }));

  return { frontmatter, slides };
}

/**
 * 把 ParsedDoc 序列化回 Slidev MD 文本。
 * 与 parseSlidev 互逆。
 */
export function serializeSlidev(doc: ParsedDoc): string {
  const fm = doc.frontmatter.raw.trim()
    ? `${FRONTMATTER_DELIM}\n${doc.frontmatter.raw.trim()}\n${FRONTMATTER_DELIM}\n`
    : '';
  const body = doc.slides.map(s => s.content).join(SLIDE_DELIM);
  return fm + body + '\n';
}
