/**
 * AI 对话 → 页级 CRUD 编辑 ops 的 SSE 端点（方案 A）。
 *
 * 流程：
 *   1. 接收 { docMd, message, history, confirm?, requestId? }
 *   2. parseSlidev 当前 MD → 注入分页结构 + 组件清单到 system prompt
 *   3. Claude tool_use（或 json 模式）产出 EditOp[]
 *   4. SSE 流式：先 reason 增量（AI 自然语言说明），再 ops
 *   5. 破坏性 op（deleteSlide / moveSlide）且未带 confirm → 返回 pending_confirm，不 apply
 *   6. 否则 applyOps → serializeSlidev 写回；apply 前存版本快照（可撤销）
 *
 * 确认回流：前端带 requestId + confirm:true 再次调用 → 直接 apply 缓存的 ops，不重跑 AI。
 *
 * SSE 事件：
 *   reason          { delta }             AI 说明增量
 *   ops             { ops }               EditOp[]
 *   pending_confirm { requestId, ops }    破坏性 ops 待确认（未 apply）
 *   applied         { md, slides, snapshotId, previousMd }
 *   done            {}
 *   error           { message }
 */
import type { EditOp } from '@slidev-ppt/shared';
import { applyOps, parseSlidev, serializeSlidev } from '@slidev-ppt/shared';
import { APPLY_EDITS_TOOL, APPLY_EDITS_TOOL_NAME } from '../../utils/ai/ops-schema.js';
import { JSON_OPS_OUTPUT_INSTRUCTION, buildUpdateSystemPrompt } from '../../utils/ai/prompts.js';
import { OpsCollector } from '../../utils/ai/ops-collector.js';
import { cachePendingOps, popPendingOps, storeSnapshot } from '../../utils/ai/version-store.js';

interface UpdateBody {
  docMd?: string;
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  confirm?: boolean;
  requestId?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<UpdateBody>(event);
  if (!body?.message && !body?.confirm) {
    setResponseStatus(event, 400);
    return { error: 'message 必填（或在确认流程下提供 confirm）' };
  }

  const cfg = getAiConfig();
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
      // ---- 确认回流：直接 apply 缓存的 ops ----
      if (body.confirm && body.requestId) {
        const cached = popPendingOps(body.requestId);
        if (cached) {
          send('reason', { delta: '应用上次待确认的修改。' });
          send('ops', { ops: cached });
          const applied = applyAndSnapshot(body.docMd ?? '', cached);
          send('applied', applied);
          send('done', {});
          return;
        }
        // 缓存失效：落到 AI 流程重新生成
      }

      const doc = body.docMd ? parseSlidev(body.docMd) : null;
      const history = body.history ?? [];

      // ---- 收集 ops ----
      let resolvedOps: EditOp[] = [];
      const collector = new OpsCollector(cfg.opsMode, {
        onReasonDelta: (delta) => send('reason', { delta }),
        onOps: (ops) => {
          resolvedOps = ops;
        },
      });

      const system = buildUpdateSystemPrompt(doc) + (cfg.opsMode === 'json' ? '\n\n' + JSON_OPS_OUTPUT_INSTRUCTION : '');

      const params: Record<string, unknown> = {
        model: cfg.chatModel,
        max_tokens: 4096,
        system,
        messages: [...history, { role: 'user', content: body.message ?? '' }],
      };
      if (cfg.opsMode === 'tool_use') {
        params.tools = [APPLY_EDITS_TOOL];
        params.tool_choice = { type: 'tool', name: APPLY_EDITS_TOOL_NAME };
      }

      await streamMessages(client, params, {
        onText: (delta) => collector.feedText(delta),
        onToolJson: (partial) => collector.feedToolJson(partial),
      });
      collector.finish();

      const ops = resolvedOps;
      send('ops', { ops });

      if (ops.length === 0) {
        send('done', {});
        return;
      }

      // ---- 破坏性操作需确认 ----
      const destructive = ops.some((o) => o.type === 'deleteSlide' || o.type === 'moveSlide');
      if (destructive && !body.confirm) {
        const requestId = cachePendingOps(ops);
        send('pending_confirm', {
          requestId,
          ops,
          message: '本次修改包含删页 / 重排操作，需确认后才会应用',
        });
        send('done', {});
        return;
      }

      // ---- apply + 存版本快照 ----
      const applied = applyAndSnapshot(body.docMd ?? '', ops);
      send('applied', applied);
      send('done', {});
    } catch (e) {
      send('error', { message: (e as Error).message });
    } finally {
      close();
    }
  })();

  return stream;
});

/** apply 前存版本快照，返回新 MD 与快照信息。 */
function applyAndSnapshot(docMd: string, ops: EditOp[]) {
  const doc = parseSlidev(docMd);
  const snapshotId = storeSnapshot(docMd);
  const newDoc = applyOps(doc, ops);
  const md = serializeSlidev(newDoc);
  return {
    md,
    slides: newDoc.slides.length,
    snapshotId,
    previousMd: docMd,
  };
}
