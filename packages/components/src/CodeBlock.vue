<script setup lang="ts">
import { ref, watchEffect, onMounted } from 'vue';

/**
 * CodeBlock — 代码高亮增强。
 *
 * 基于 shiki 做语法高亮，与 Slidev 内置高亮协调：使用 shiki 双主题
 * (light: github-light, dark: github-dark) 输出 CSS 变量，随 Slidev 深浅色自动切换。
 *
 * 与 Slidev 内置 ``` 代码块的关系：Slidev 的 markdown 代码块用于普通展示；
 * 本组件供需要以 Vue 组件形式嵌入代码（带标题栏、跨页复用、动态内容）时使用。
 *
 * shiki 通过动态 import 加载，加载中或失败时降级为 <pre><code> 纯文本，不阻塞渲染。
 *
 * @props
 * - code: string  代码文本。
 * - lang?: string  语言标识，如 "ts" / "vue" / "bash"，默认 "text"。
 * - title?: string  代码块标题（显示在标题栏，如文件名）。
 */
const props = withDefaults(
  defineProps<{
    code: string;
    lang?: string;
    title?: string;
  }>(),
  {
    lang: 'text',
    title: '',
  },
);

// 高亮后的 HTML。null 表示尚未加载或加载失败，降级为纯文本。
const html = ref<string | null>(null);

async function highlight() {
  const code = props.code ?? '';
  if (!code) {
    html.value = '';
    return;
  }
  try {
    const { codeToHtml } = await import('shiki');
    html.value = await codeToHtml(code, {
      lang: props.lang as never,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false, // 输出 CSS 变量，由 .dark 类切换
    });
  } catch {
    // shiki 不可用时降级：转义后放 <pre><code>
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html.value = `<pre class="spp-fallback"><code>${escaped}</code></pre>`;
  }
}

watchEffect(() => {
  // props.code/lang 变化时重新高亮
  void highlight();
});

// 首次挂载即触发（watchEffect 默认 immediate）
onMounted(() => {
  if (html.value === null) void highlight();
});
</script>

<template>
  <div class="spp-codeblock" :class="{ 'has-title': !!title }">
    <div v-if="title" class="title-bar">
      <span class="dot dot-r" />
      <span class="dot dot-y" />
      <span class="dot dot-g" />
      <span class="title">{{ title }}</span>
    </div>
    <div class="code-area" v-html="html ?? ''" />
  </div>
</template>

<style scoped>
.spp-codeblock {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--slidev-code-background, rgba(127, 127, 127, 0.2));
  background: var(--slidev-code-background, #1e1e1e);
}
.title-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--slidev-code-background, #2d2d2d);
  opacity: 0.95;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.dot-r { background: #ff5f56; }
.dot-y { background: #ffbd2e; }
.dot-g { background: #27c93f; }
.title {
  margin-left: 8px;
  font-size: 12px;
  opacity: 0.8;
  color: var(--slidev-code-color, inherit);
}
.code-area {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}
/* shiki 输出是 <pre class="shiki">，给点内边距 */
.code-area :deep(pre.shiki),
.code-area :deep(pre.spp-fallback) {
  margin: 0;
  padding: 14px 16px;
  overflow-x: auto;
  background: transparent !important;
}
.code-area :deep(code) {
  font-family: var(--slidev-code-font, 'Fira Code', monospace);
}
</style>
