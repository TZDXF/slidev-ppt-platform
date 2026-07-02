/**
 * GET /api/settings —— 返回 .env 默认 AI 配置（不含 key），供 web 端设置面板占位提示。
 *
 * 只暴露非敏感项：chatModel / structureModel / aiOpsMode / baseUrl。
 * apiKey 永不出服务端 —— 前端 key 框留空表示用 .env 默认，无需回显。
 */
import { DEFAULT_CHAT_MODEL, DEFAULT_STRUCTURE_MODEL } from '../utils/ai/models.js';

export default defineEventHandler(() => {
  const rc = useRuntimeConfig();
  return {
    chatModel: (rc.anthropicChatModel as string) || DEFAULT_CHAT_MODEL,
    structureModel: (rc.anthropicStructureModel as string) || DEFAULT_STRUCTURE_MODEL,
    aiOpsMode: rc.aiOpsMode === 'json' ? 'json' : 'tool_use',
    baseUrl: (rc.anthropicBaseUrl as string) || '',
  };
});
