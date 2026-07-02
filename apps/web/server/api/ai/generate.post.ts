/**
 * AI 对话 → 全量生成 Slidev MD 的 SSE 端点。
 *
 * 两步链路：
 *   1. 对话澄清 → JSON 大纲（title / 每页要点 / 配图建议 / 组件选用建议）
 *   2. 大纲 → Slidev MD（frontmatter + --- 分页 + 组件标签）
 *
 * 模型：复杂结构用 structureModel（默认 opus-4-8）。
 * key / baseUrl 走 runtimeConfig，不出服务端。
 *
 * Web 设置面板覆盖（AIP-30）：body 可选携带 chatModel/structureModel/opsMode/
 * baseUrl/apiKey，getAiConfig 优先用请求里的，回退 .env。
 *
 * SSE 事件：
 *   outline  { outline }            大纲 JSON（第一步完成）
 *   md       { delta }               第二步 MD 增量
 *   done     { md, slides }          第二步完成（含完整 MD 与页数）
 *   error    { message }
 */
import { parseSlidev, serializeSlidev } from '@slidev-ppt/shared';
import type { Outline } from '../../utils/ai/prompts.js';
import type { AiConfigOverrides } from '../../utils/ai/config.js';

interface GenerateBody extends AiConfigOverrides {
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<GenerateBody>(event);
  if (!body?.message) {
    setResponseStatus(event, 400);
    return { error: 'message 必填' };
  }

  const cfg = getAiConfig(body);
  try {
    assertConfigured(cfg);
  } catch (e) {
    setResponseStatus(event, 503);
    return { error: (e as Error).message };
  }

  setSseHeaders(event);
  const { stream, send, close } = createSseStream(event);

  const client = createAnthropicClient(cfg);

  void (async () => {
    try {
      const history = body.history ?? [];

      // ---- 第一步：大纲 ----
      const outline = await completeJson<Outline>(client, {
        model: cfg.structureModel,
        max_tokens: 2048,
        system: buildOutlineSystemPrompt(),
        messages: [...history, { role: 'user', content: body.message }],
      });
      send('outline', { outline });

      // ---- 第二步：大纲 → MD（流式）----
      let md = '';
      await streamMessages(
        client,
        {
          model: cfg.structureModel,
          max_tokens: 8192,
          system: buildGenerateSystemPrompt(),
          messages: [{ role: 'user', content: '根据下面的大纲生成 Slidev MD：\n\n' + JSON.stringify(outline, null, 2) }],
        },
        {
          onText: (delta) => {
            md += delta;
            send('md', { delta });
          },
          onToolJson: () => {},
        },
      );

      // 校验：生成的 MD 必须可被 parseSlidev 互逆解析
      const doc = parseSlidev(md);
      const reparsed = serializeSlidev(doc);

      send('done', { md: reparsed, slides: doc.slides.length });
    } catch (e) {
      send('error', { message: (e as Error).message });
    } finally {
      close();
    }
  })();

  return stream;
});
