<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { renderMarkdown } from '@/composables/useMarkdown';

/**
 * MarkdownView — AI 消息正文渲染。
 *
 * - markdown-it 解析 + DOMPurify 清洗（见 useMarkdown），v-html 输出。
 * - 流式增量防抖：streaming 期间 content 每 token 变化，按 120ms 防抖重渲染，
 *   避免逐 token 解析+清洗卡顿；streaming 结束立即出最终结果。
 * - 代码块语法高亮：shiki 双主题（github-light / github-dark），与 Slidev / CodeBlock 一致。
 *   流式期间 800ms 慢防抖（长停顿才高亮，避免每 token 重算 shiki），结束立即高亮。
 *   shiki 动态 import，加载/失败时降级为 markdown-it 的纯文本 <pre><code>，不阻塞渲染。
 */
const props = defineProps<{
  content: string;
  streaming?: boolean;
}>();

const rendered = ref<string>('');
const root = ref<HTMLElement | null>(null);

let renderTimer: ReturnType<typeof setTimeout> | null = null;
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

function compute(): void {
  rendered.value = renderMarkdown(props.content ?? '');
}

function schedule(): void {
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
  if (props.streaming) {
    renderTimer = setTimeout(() => {
      renderTimer = null;
      compute();
      scheduleHighlight(800);
    }, 120);
  } else {
    compute();
    scheduleHighlight(0);
  }
}

function scheduleHighlight(delay: number): void {
  if (typeof window === 'undefined') return;
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightTimer = null;
    void runHighlight();
  }, delay);
}

/** shiki 后处理：扫描未高亮的 <pre><code>，替换为 shiki 高亮 HTML。 */
async function runHighlight(): Promise<void> {
  await nextTick();
  const el = root.value;
  if (!el) return;
  const blocks = Array.from(
    el.querySelectorAll<HTMLPreElement>('pre:not([data-spp-hl])'),
  );
  if (!blocks.length) return;
  // 先标记，避免并发/重入重复处理
  blocks.forEach((b) => b.setAttribute('data-spp-hl', '1'));

  let shiki: typeof import('shiki') | null = null;
  try {
    shiki = await import('shiki');
  } catch {
    return; // shiki 不可用：保留纯文本代码块
  }

  for (const pre of blocks) {
    const codeEl = pre.querySelector('code');
    if (!codeEl) continue;
    const raw = codeEl.textContent ?? '';
    const langClass = Array.from(codeEl.classList).find((c) =>
      c.startsWith('language-'),
    );
    const lang = (langClass?.replace('language-', '') || 'text') as never;
    try {
      const html = await shiki.codeToHtml(raw, {
        lang,
        themes: { light: 'github-light', dark: 'github-dark' },
        defaultColor: false, // 输出 CSS 变量，随 .dark 切换
      });
      pre.outerHTML = html;
    } catch {
      // 未知语言：保留 markdown-it 的纯文本 <pre><code>
    }
  }
}

watch([() => props.content, () => props.streaming], schedule, {
  immediate: true,
});

onBeforeUnmount(() => {
  if (renderTimer) clearTimeout(renderTimer);
  if (highlightTimer) clearTimeout(highlightTimer);
});
</script>

<template>
  <div ref="root" class="spp-prose" v-html="rendered" />
</template>

<style scoped>
.spp-prose {
  font-size: 0.875rem;
  line-height: 1.6;
  word-break: break-word;
}
.spp-prose :deep(p) {
  margin: 0.4rem 0;
}
.spp-prose :deep(p:first-child) {
  margin-top: 0;
}
.spp-prose :deep(p:last-child) {
  margin-bottom: 0;
}
.spp-prose :deep(h1),
.spp-prose :deep(h2),
.spp-prose :deep(h3),
.spp-prose :deep(h4) {
  font-weight: 600;
  line-height: 1.3;
  margin: 0.6rem 0 0.3rem;
}
.spp-prose :deep(h1) {
  font-size: 1.15rem;
}
.spp-prose :deep(h2) {
  font-size: 1.05rem;
}
.spp-prose :deep(h3) {
  font-size: 1rem;
}
.spp-prose :deep(h4) {
  font-size: 0.95rem;
}
.spp-prose :deep(ul),
.spp-prose :deep(ol) {
  margin: 0.4rem 0;
  padding-left: 1.25rem;
}
.spp-prose :deep(ul) {
  list-style: disc;
}
.spp-prose :deep(ol) {
  list-style: decimal;
}
.spp-prose :deep(li) {
  margin: 0.15rem 0;
}
.spp-prose :deep(li > p) {
  margin: 0;
}
.spp-prose :deep(a) {
  color: #60a5fa;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.spp-prose :deep(strong) {
  font-weight: 600;
}
.spp-prose :deep(blockquote) {
  border-left: 3px solid var(--border);
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: var(--muted-foreground);
}
.spp-prose :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 0.6rem 0;
}
/* 行内代码 */
.spp-prose :deep(code) {
  font-family: var(--slidev-code-font, 'Fira Code', ui-monospace, monospace);
  font-size: 0.82em;
  background: rgba(127, 127, 127, 0.2);
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
}
/* 代码块（markdown-it 原始输出，shiki 后处理前 / 降级时） */
.spp-prose :deep(pre) {
  margin: 0.5rem 0;
  padding: 0.75rem 0.9rem;
  background: #1e1e1e;
  color: #e4e4e7;
  border-radius: 0.5rem;
  overflow-x: auto;
  font-size: 0.8rem;
  line-height: 1.55;
}
.spp-prose :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: inherit;
  color: inherit;
}
/* shiki 高亮输出：双主题 CSS 变量，随 .dark 切换（与 CodeBlock.vue / Slidev 一致） */
.spp-prose :deep(.shiki) {
  margin: 0.5rem 0;
  padding: 0.75rem 0.9rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  font-size: 0.8rem;
  line-height: 1.55;
  background-color: var(--shiki-light-bg, #f6f8fa);
}
.dark .spp-prose :deep(.shiki) {
  background-color: var(--shiki-dark-bg, #1e1e1e);
}
.spp-prose :deep(.shiki span) {
  color: var(--shiki-light, inherit);
}
.dark .spp-prose :deep(.shiki span) {
  color: var(--shiki-dark, inherit);
}
.spp-prose :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5rem 0;
  font-size: 0.82rem;
}
.spp-prose :deep(th),
.spp-prose :deep(td) {
  border: 1px solid var(--border);
  padding: 0.3rem 0.5rem;
  text-align: left;
}
.spp-prose :deep(th) {
  font-weight: 600;
  background: rgba(127, 127, 127, 0.15);
}
</style>
