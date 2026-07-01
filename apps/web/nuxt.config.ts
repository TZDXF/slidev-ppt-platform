// Nuxt 配置 — Slidev PPT 平台前端
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],

  // 全局样式：Tailwind + shadcn-vue CSS 变量主题
  css: ['~/assets/css/main.css'],

  // shadcn-vue 组件用 pathPrefix:false，组件名即文件名（Button / Textarea …）
  // extensions:vue 避免 index.ts barrel 被当作组件注册（与同名 .vue 冲突）
  components: [{ path: '~/components', pathPrefix: false, extensions: ['vue'] }],

  // monorepo 内 workspace 包需 transpile；reka-ui / codemirror 走 ESM 需转译
  build: {
    transpile: ['@slidev-ppt/shared', 'reka-ui'],
  },

  vite: {
    optimizeDeps: {
      // CodeMirror6 与 reka-ui 为纯 ESM，预打包避免 dev 首屏 reload
      include: [
        'codemirror',
        '@codemirror/autocomplete',
        '@codemirror/lang-markdown',
        '@codemirror/theme-one-dark',
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/commands',
        '@codemirror/language',
        'reka-ui',
        'lucide-vue-next',
      ],
    },
  },

  // 后端代理 Claude API，key 不出服务端
  runtimeConfig: {
    anthropicApiKey: '', // ANTHROPIC_API_KEY，国内需走代理
    anthropicBaseUrl: '', // ANTHROPIC_BASE_URL，代理地址
    anthropicChatModel: '', // ANTHROPIC_CHAT_MODEL，对话/页级 CRUD（默认 claude-sonnet-4-6）
    anthropicStructureModel: '', // ANTHROPIC_STRUCTURE_MODEL，大纲/全量重生成（默认 claude-opus-4-8）
    aiOpsMode: 'tool_use', // AI_OPS_MODE：tool_use（生产）| json（兼容不支持 tool_use 的代理）
    renderServiceUrl: '', // RENDER_SERVICE_URL，渲染调度服务地址
    public: {
      // 客户端可见配置
    },
  },

  app: {
    head: {
      title: 'Slidev PPT 平台',
      htmlAttrs: { lang: 'zh-CN', class: 'dark' },
    },
  },
});
