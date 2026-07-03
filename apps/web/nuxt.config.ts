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
    transpile: ['@slidev-ppt/shared', '@slidev-ppt/components', 'reka-ui'],
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
  // 运行时从 NUXT_<KEY> 环境变量注入（Nuxt 自动映射）；compose 里用 NUXT_ 前缀
  runtimeConfig: {
    anthropicApiKey: '', // NUXT_ANTHROPIC_API_KEY
    anthropicBaseUrl: '', // NUXT_ANTHROPIC_BASE_URL
    anthropicChatModel: '', // NUXT_ANTHROPIC_CHAT_MODEL
    anthropicStructureModel: '', // NUXT_ANTHROPIC_STRUCTURE_MODEL
    aiOpsMode: 'tool_use', // NUXT_AI_OPS_MODE：tool_use | json
    renderServiceUrl: '', // NUXT_RENDER_SERVICE_URL
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
