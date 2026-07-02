<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Loader2, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { useSettingsStore, type OpsMode } from '@/stores/settings';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const s = useSettingsStore();

// 本地表单副本：编辑期间不直接写 store，保存时才提交
const chatModel = ref('');
const structureModel = ref('');
const aiOpsMode = ref<OpsMode>('tool_use');
const baseUrl = ref('');
const apiKey = ref('');
const saving = ref(false);
const savedFlash = ref(false);

function syncFromStore(): void {
  chatModel.value = s.chatModel;
  structureModel.value = s.structureModel;
  aiOpsMode.value = s.aiOpsMode;
  baseUrl.value = s.baseUrl;
  // key 永不回显：每次打开为空，留空 = 用 .env 默认
  apiKey.value = '';
}

onMounted(() => { void s.loadDefaults(); });

// 每次打开：刷新 .env 默认 + 同步表单副本
watch(() => props.open, (open) => {
  if (open) {
    void s.loadDefaults();
    syncFromStore();
  }
});

function close(): void {
  emit('update:open', false);
}

function save(): void {
  saving.value = true;
  try {
    s.chatModel = chatModel.value.trim();
    s.structureModel = structureModel.value.trim();
    s.aiOpsMode = aiOpsMode.value;
    s.baseUrl = baseUrl.value.trim();
    // key：填了才覆盖内存值；留空保留既有内存 key（若存在），仍为空则用 .env
    const k = apiKey.value.trim();
    if (k) s.apiKey = k;
    s.persist(); // 仅持久化非敏感项（apiKey 不入 localStorage）
    savedFlash.value = true;
    setTimeout(() => { savedFlash.value = false; }, 1200);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition name="settings-dialog">
        <div
          v-if="props.open"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="模型配置"
        >
          <!-- 遮罩 -->
          <div class="absolute inset-0 bg-black/50" @click="close" />

          <!-- 卡片 -->
          <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-lg">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold">模型配置</h2>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  留空即用 .env 默认。刷新后保留（API key 除外）。
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 shrink-0"
                aria-label="关闭"
                @click="close"
              >
                <X class="h-4 w-4" />
              </Button>
            </div>

            <div class="mt-4 space-y-4">
              <!-- 对话模型 -->
              <div class="space-y-1.5">
                <label for="set-chat-model" class="text-sm font-medium">对话模型</label>
                <input
                  id="set-chat-model"
                  v-model="chatModel"
                  type="text"
                  :placeholder="`默认 ${s.defaults.chatModel}`"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <p class="text-xs text-muted-foreground">对话 / 页级 CRUD 用</p>
              </div>

              <!-- 结构模型 -->
              <div class="space-y-1.5">
                <label for="set-struct-model" class="text-sm font-medium">结构模型</label>
                <input
                  id="set-struct-model"
                  v-model="structureModel"
                  type="text"
                  :placeholder="`默认 ${s.defaults.structureModel}`"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <p class="text-xs text-muted-foreground">大纲 / 全量重生成用</p>
              </div>

              <!-- ops 模式 -->
              <div class="space-y-1.5">
                <span class="text-sm font-medium">ops 模式</span>
                <div class="flex gap-2">
                  <button
                    type="button"
                    :class="[
                      'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                      aiOpsMode === 'tool_use'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-input bg-background text-muted-foreground hover:bg-muted',
                    ]"
                    @click="aiOpsMode = 'tool_use'"
                  >
                    tool_use
                  </button>
                  <button
                    type="button"
                    :class="[
                      'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                      aiOpsMode === 'json'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-input bg-background text-muted-foreground hover:bg-muted',
                    ]"
                    @click="aiOpsMode = 'json'"
                  >
                    json
                  </button>
                </div>
                <p class="text-xs text-muted-foreground">
                  默认 {{ s.defaults.aiOpsMode }} · 不支持 tool_use 的兼容代理用 json
                </p>
              </div>

              <!-- base_url -->
              <div class="space-y-1.5">
                <label for="set-base-url" class="text-sm font-medium">Base URL</label>
                <input
                  id="set-base-url"
                  v-model="baseUrl"
                  type="text"
                  :placeholder="s.defaults.baseUrl ? `默认 ${s.defaults.baseUrl}` : '留空用 .env 默认'"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <p class="text-xs text-muted-foreground">Anthropic 兼容代理地址（可选）</p>
              </div>

              <!-- API key -->
              <div class="space-y-1.5">
                <label for="set-api-key" class="text-sm font-medium">API Key</label>
                <input
                  id="set-api-key"
                  v-model="apiKey"
                  type="password"
                  placeholder="留空用 .env 默认（不回显）"
                  autocomplete="off"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <p class="text-xs text-muted-foreground">
                  仅本会话内存，不持久化、永不出服务端
                </p>
              </div>
            </div>

            <div class="mt-5 flex items-center justify-end gap-2">
              <span v-if="savedFlash" class="mr-auto text-xs text-emerald-600">已保存</span>
              <Button variant="ghost" size="sm" class="h-8" @click="close">取消</Button>
              <Button size="sm" class="h-8 gap-1.5" :disabled="saving" @click="save">
                <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
                保存
              </Button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.settings-dialog-enter-active,
.settings-dialog-leave-active {
  transition: opacity 0.15s ease;
}
.settings-dialog-enter-from,
.settings-dialog-leave-to {
  opacity: 0;
}
</style>
