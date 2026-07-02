import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 设置 store —— web 端模型 / ops 模式 / base_url / key 的运行时覆盖配置。
 *
 * 持久化策略（方案 A，安全优先）：
 *   - 非敏感项（chatModel / structureModel / aiOpsMode / baseUrl）存 localStorage，
 *     刷新页面后保留。
 *   - apiKey 永不入 localStorage —— 仅在会话内存中，通过 /api/ai/* 请求 body 传给服务端，
 *     服务端用完不存。
 *
 * 覆盖语义：留空 = 用 .env 默认（服务端 runtimeConfig 兜底）。
 *   /api/ai/* 端点接收可选的 chatModel/structureModel/opsMode/baseUrl/apiKey，
 *   server 端优先用请求里的，回退 runtimeConfig。
 *
 * defaults 来自 GET /api/settings（读 .env，不含 key），用于 UI 占位提示。
 */

/** ops 提取模式（与 server/utils/ai/models.ts 的 OpsMode 对齐） */
export type OpsMode = 'tool_use' | 'json';

/** 内置默认模型（与 server 端 DEFAULT_* 对齐；/api/settings 拉取后用 .env 覆盖） */
const BUILTIN_DEFAULT_CHAT_MODEL = 'claude-sonnet-4-6';
const BUILTIN_DEFAULT_STRUCTURE_MODEL = 'claude-opus-4-8';

const STORAGE_KEY = 'slidev-ppt:ai-settings:v1';

/** 持久化到 localStorage 的子集（绝不包含 apiKey） */
interface PersistedSettings {
  chatModel: string;
  structureModel: string;
  aiOpsMode: OpsMode;
  baseUrl: string;
}

/** /api/settings 返回的 .env 默认值（不含 key） */
export interface SettingsDefaults {
  chatModel: string;
  structureModel: string;
  aiOpsMode: OpsMode;
  baseUrl: string;
}

function emptyPersisted(): PersistedSettings {
  return { chatModel: '', structureModel: '', aiOpsMode: 'tool_use', baseUrl: '' };
}

/** 客户端判定：避免依赖 Nuxt 的 import.meta.client 类型增强（typeof window 普适）。 */
const IS_CLIENT = typeof window !== 'undefined';

/** 从 localStorage 读取持久化配置；SSR / 解析失败时返回空对象。 */
function loadPersisted(): PersistedSettings {
  if (!IS_CLIENT) return emptyPersisted();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPersisted();
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    return {
      chatModel: typeof parsed.chatModel === 'string' ? parsed.chatModel : '',
      structureModel: typeof parsed.structureModel === 'string' ? parsed.structureModel : '',
      aiOpsMode: parsed.aiOpsMode === 'json' ? 'json' : 'tool_use',
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
    };
  } catch {
    return emptyPersisted();
  }
}

function savePersisted(s: PersistedSettings): void {
  if (!IS_CLIENT) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 隐私模式 / 配额满：静默失败，覆盖值仅本会话有效
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const persisted = loadPersisted();

  const chatModel = ref(persisted.chatModel);
  const structureModel = ref(persisted.structureModel);
  const aiOpsMode = ref<OpsMode>(persisted.aiOpsMode);
  const baseUrl = ref(persisted.baseUrl);
  /** 仅内存：永不入 localStorage。留空 = 用 .env 默认。 */
  const apiKey = ref('');

  /** .env 默认值（UI 占位提示用）；loadDefaults 拉取后填充。 */
  const defaults = ref<SettingsDefaults>({
    chatModel: BUILTIN_DEFAULT_CHAT_MODEL,
    structureModel: BUILTIN_DEFAULT_STRUCTURE_MODEL,
    aiOpsMode: 'tool_use',
    baseUrl: '',
  });
  const defaultsLoaded = ref(false);

  /** 拉取 .env 默认值（不含 key），用于 UI 占位。失败则回落到内置默认。 */
  async function loadDefaults(): Promise<void> {
    if (defaultsLoaded.value) return;
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = (await res.json()) as SettingsDefaults;
        defaults.value = {
          chatModel: data.chatModel || BUILTIN_DEFAULT_CHAT_MODEL,
          structureModel: data.structureModel || BUILTIN_DEFAULT_STRUCTURE_MODEL,
          aiOpsMode: data.aiOpsMode === 'json' ? 'json' : 'tool_use',
          baseUrl: data.baseUrl || '',
        };
      }
    } catch {
      // 拉取失败不阻塞：UI 仍用内置默认做占位
    } finally {
      defaultsLoaded.value = true;
    }
  }

  /** 持久化非敏感项（apiKey 不入 localStorage）。 */
  function persist(): void {
    savePersisted({
      chatModel: chatModel.value.trim(),
      structureModel: structureModel.value.trim(),
      aiOpsMode: aiOpsMode.value,
      baseUrl: baseUrl.value.trim(),
    });
  }

  /**
   * 生成 /api/ai/* 请求 body 的覆盖参数：仅包含用户实际填写的字段。
   * apiKey 为空则不传（服务端用 .env 默认）。
   */
  function aiOverrides(): Record<string, string> {
    const o: Record<string, string> = {};
    const cm = chatModel.value.trim();
    const sm = structureModel.value.trim();
    const bu = baseUrl.value.trim();
    const k = apiKey.value.trim();
    if (cm) o.chatModel = cm;
    if (sm) o.structureModel = sm;
    o.opsMode = aiOpsMode.value;
    if (bu) o.baseUrl = bu;
    if (k) o.apiKey = k;
    return o;
  }

  /** 清空临时 apiKey（如需手动清除）。 */
  function clearApiKey(): void {
    apiKey.value = '';
  }

  return {
    chatModel,
    structureModel,
    aiOpsMode,
    baseUrl,
    apiKey,
    defaults,
    defaultsLoaded,
    loadDefaults,
    persist,
    aiOverrides,
    clearApiKey,
  };
});
