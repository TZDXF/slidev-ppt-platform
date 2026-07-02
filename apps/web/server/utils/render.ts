/**
 * 渲染调度服务代理：control API（启停 / 轮询 / 写 MD）经 Nuxt server 转发，
 * 把 renderServiceUrl 留在服务端，避免客户端直连暴露内网。
 *
 * 预览 iframe 的 previewUrl（${RENDER_BASE}/p/<token>）本身是面向浏览器的公开
 * 预览入口（生产由 Nginx 暴露），由前端直接 iframe 接入；HMR WebSocket 也走该域。
 */
export function getRenderServiceUrl(): string {
  const rc = useRuntimeConfig();
  return (rc.renderServiceUrl as string) || '';
}

/** 缺配置时给前端明确的 503，而非 502 堆栈 */
export function assertRenderServiceUrl(): string {
  const url = getRenderServiceUrl();
  if (!url) {
    throw createError({
      statusCode: 503,
      statusMessage: '渲染服务未配置：runtimeConfig.renderServiceUrl 为空（需设置 RENDER_SERVICE_URL）',
    });
  }
  return url.replace(/\/+$/, '');
}

/** 渲染服务返回体（与 render-service types.ts 的 PreviewResponse 一致） */
export interface PreviewResponse {
  docId: string;
  status: 'pending' | 'starting' | 'ready' | 'restarting' | 'failed' | 'stopped';
  previewUrl: string | null;
  queuePosition?: number;
  message?: string;
}

/**
 * 转发到渲染服务。非 2xx 时渲染服务仍可能返回结构化 body（如 404 stopped），
 * 把 body 透传给前端；仅网络/解析失败才抛 502。
 */
export async function proxyRender<T = PreviewResponse>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const base = assertRenderServiceUrl();
  // 用原生 fetch 而非 Nuxt 的 $fetch：后者对动态 path 会触发 TypedInternalResponse
  // 路由匹配的深度递归。非 2xx 时渲染服务仍可能返回结构化 body，透传给前端。
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    throw createError({
      statusCode: 502,
      statusMessage: `渲染服务网络错误：${err?.message ?? String(e)}`,
    });
  }
  const text = await res.text();
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: `渲染服务返回非 JSON：${text.slice(0, 200)}`,
    });
  }
}
