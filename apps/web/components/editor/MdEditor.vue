<script setup lang="ts">
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  /** 占位提示 */
  placeholder?: string;
}>();

const emits = defineEmits<{ 'update:modelValue': [value: string] }>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
/** 标记当前变更来自外部（避免 emit 后又回写造成循环） */
let externalUpdate = false;

function buildExtensions(): Extension[] {
  return [
    lineNumbers(),
    foldGutter(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    markdown({ base: markdownLanguage, addKeymap: true }),
    oneDark,
    EditorView.lineWrapping,
    EditorView.theme({
      '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent' },
      '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
      '.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid hsl(var(--border))' },
    }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !externalUpdate) {
        emits('update:modelValue', u.state.doc.toString());
      }
    }),
  ];
}

onMounted(() => {
  if (!host.value) return;
  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: buildExtensions(),
    }),
    parent: host.value,
  });
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

// 外部内容变更（如 AI 应用 ops、主题切换）→ 同步进编辑器，保留光标位置
watch(
  () => props.modelValue,
  (next) => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (next === current) return;
    externalUpdate = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next },
    });
    externalUpdate = false;
  },
);
</script>

<template>
  <div class="h-full w-full overflow-hidden">
    <div ref="host" class="h-full w-full" />
  </div>
</template>
