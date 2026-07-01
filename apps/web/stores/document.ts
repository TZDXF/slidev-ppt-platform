import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { parseSlidev, serializeSlidev, type ParsedDoc } from '@slidev-ppt/shared';

/**
 * 当前文档 store —— MD 是唯一真相源。
 *
 * 编辑器、预览、AI 对话都读写这里的 docMd。编辑器双向绑定 setContent；
 * AI 更新链路拿到 ops 后由 applyOps 改写 ParsedDoc 再 serialize 回来。
 */
const DEFAULT_MD = `---
theme: seriph
title: 未命名演示
---

# 欢迎使用 Slidev PPT 平台

AI 对话生成 PPT，左侧对话、中间编辑、右侧预览。

---

## 第二页

在这里编辑 Markdown，或在左侧对话让 AI 帮你修改。
`;

export const useDocumentStore = defineStore('document', () => {
  const docMd = ref<string>(DEFAULT_MD);

  const parsed = computed<ParsedDoc>(() => parseSlidev(docMd.value));

  const slideCount = computed(() => parsed.value.slides.length);
  const theme = computed(() => parsed.value.frontmatter.raw.match(/^theme:\s*(.+)$/m)?.[1]?.trim() ?? '');

  /** 编辑器双向绑定入口 */
  function setContent(md: string) {
    docMd.value = md;
  }

  /** AI 链路：把 applyOps 后的 ParsedDoc 写回 */
  function setParsedDoc(doc: ParsedDoc) {
    docMd.value = serializeSlidev(doc);
  }

  return { docMd, parsed, slideCount, theme, setContent, setParsedDoc };
});
