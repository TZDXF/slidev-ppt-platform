/**
 * 运行时 AI 配置：从 Nuxt runtimeConfig 读取 key / baseUrl / 模型名 / ops 模式。
 *
 * key 与 baseUrl 绝不出服务端 —— 客户端只通过 /api/ai/* SSE 端点间接调用。
 *
 * Web 端设置面板（AIP-30）允许前端在 /api/ai/* 请求 body 里携带可选覆盖：
 * chatModel / structureModel / opsMode / baseUrl / apiKey。getAiConfig(overrides)
 * 优先用请求里的覆盖值，回退 runtimeConfig（.env），再回退内置默认。
 * apiKey 覆盖只在本次请求内存中生效，不持久化。
 */
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CHAT_MODEL, DEFAULT_STRUCTURE_MODEL, type OpsMode } from './models.js';

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  /** 对话 / 页级 CRUD 用 */
  chatModel: string;
  /** 大纲 / 全量重生成用 */
  structureModel: string;
  opsMode: OpsMode;
}

/** 前端 /api/ai/* body 里可携带的覆盖参数（全部可选，留空 = 用 .env 默认）。 */
export interface AiConfigOverrides {
  chatModel?: string;
  structureModel?: string;
  opsMode?: string;
  baseUrl?: string;
  apiKey?: string;
}

function pickOverride(override: string | undefined, rcValue: string | undefined, fallback: string): string {
  const o = override?.trim();
  if (o) return o;
  return (rcValue as string) || fallback;
}

export function getAiConfig(overrides?: AiConfigOverrides): AiConfig {
  const rc = useRuntimeConfig();
  const opsRaw = (overrides?.opsMode?.trim() || rc.aiOpsMode || 'tool_use') as string;
  const opsMode = (opsRaw === 'json' ? 'json' : 'tool_use') as OpsMode;
  return {
    apiKey: pickOverride(overrides?.apiKey, rc.anthropicApiKey as string, ''),
    baseUrl: pickOverride(overrides?.baseUrl, rc.anthropicBaseUrl as string, ''),
    chatModel: pickOverride(overrides?.chatModel, rc.anthropicChatModel as string, DEFAULT_CHAT_MODEL),
    structureModel: pickOverride(overrides?.structureModel, rc.anthropicStructureModel as string, DEFAULT_STRUCTURE_MODEL),
    opsMode,
  };
}

export function createAnthropicClient(cfg: AiConfig): Anthropic {
  return new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl || undefined,
  });
}

/** 缺 key 时给前端一个明确的 503，而不是把 key 缺失暴露为 500 堆栈。 */
export function assertConfigured(cfg: AiConfig): void {
  if (!cfg.apiKey) {
    throw new Error('AI 链路未配置：runtimeConfig.anthropicApiKey 为空（需设置 ANTHROPIC_API_KEY）');
  }
}
