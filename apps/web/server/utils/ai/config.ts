/**
 * 运行时 AI 配置：从 Nuxt runtimeConfig 读取 key / baseUrl / 模型名 / ops 模式。
 *
 * key 与 baseUrl 绝不出服务端 —— 客户端只通过 /api/ai/* SSE 端点间接调用。
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

export function getAiConfig(): AiConfig {
  const rc = useRuntimeConfig();
  const opsMode = (rc.aiOpsMode === 'json' ? 'json' : 'tool_use') as OpsMode;
  return {
    apiKey: rc.anthropicApiKey as string,
    baseUrl: rc.anthropicBaseUrl as string,
    chatModel: (rc.anthropicChatModel as string) || DEFAULT_CHAT_MODEL,
    structureModel: (rc.anthropicStructureModel as string) || DEFAULT_STRUCTURE_MODEL,
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
