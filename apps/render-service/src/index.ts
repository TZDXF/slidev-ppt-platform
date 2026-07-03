/**
 * 渲染调度服务 HTTP 入口。
 *
 * 路由：
 * - GET  /health            服务健康
 * - GET  /metrics           调度指标（冷启动、并发、回收策略）
 * - POST /preview/:docId    分配/启动 dev server，返回 { previewUrl, status }
 * - GET  /preview/:docId    查询状态（pending 时带 queuePosition，供前端轮询）
 * - PUT  /preview/:docId/md 写入 MD，已存在容器则 Slidev HMR 自动重渲染
 * - DELETE /preview/:docId  手动销毁容器
 * - ALL  /p/:token/*        反代到容器 dev server（HTTP + WS 升级），同时重置空闲计时器
 *
 * 预览 URL 形态（任务要求"子域名/端口反代"）：
 * - 默认 port 模式：previewUrl = ${PREVIEW_BASE}/p/<token>/，流量经本服务反代
 *   （尾斜杠不可省：dev server 以 --base /p/<token>/ 启动，Vite 对裸 /p/<token> 回 404）
 * - subdomain 模式：previewUrl = http://preview-<token>.<host>，Nginx 重写到 /p/<token>/
 *   （生产由 Nginx 接入，本服务仍承担反代与空闲计时）
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { connect as tcpConnect } from 'node:net';
import { config } from './config.js';
import { acquire, writeMd, getStatus, reclaim, touch, getByToken, getMetrics, initPool } from './pool.js';
import type { PreviewRequest, PreviewResponse } from './types.js';

const PORT = config.port;

/** 反代上游地址：real 模式按容器名（slidev-sandbox 网络内 DNS）+ 容器内端口直连，
 *  不再用 127.0.0.1:hostPort（render-service 自身在容器内，loopback 不可达宿主端口映射）。
 *  mock 模式回退到 hostPort，仅供调度 API 联调，预览反代不可用。 */
function upstream(s: { containerName: string; hostPort?: number }): { host: string; port: number } {
  if (config.dockerMode === 'mock') {
    return { host: '127.0.0.1', port: s.hostPort ?? 0 };
  }
  return { host: s.containerName, port: config.containerPort };
}

function send(res: ServerResponse, code: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(json);
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5 * 1024 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // 反代到容器：/p/:token/...
  if (path.startsWith('/p/')) {
    return proxyHttp(req, res, path);
  }

  if (path === '/health' && method === 'GET') {
    return send(res, 200, { service: 'render-service', status: 'online' });
  }
  if (path === '/metrics' && method === 'GET') {
    return send(res, 200, getMetrics());
  }

  // /preview/:docId[ /md ]
  const m = path.match(/^\/preview\/([^/]+)(?:\/(md))?$/);
  if (m) {
    const docId = decodeURIComponent(m[1]!);
    const sub = m[2];
    try {
      if (method === 'POST' && !sub) {
        const body = (await readJson(req)) as PreviewRequest;
        const result = await acquire(docId, body);
        return send(res, result.status === 'pending' ? 202 : 200, result);
      }
      if (method === 'GET' && !sub) {
        const result = getStatus(docId);
        if (!result) return send(res, 404, { docId, status: 'stopped', previewUrl: null } satisfies PreviewResponse);
        return send(res, 200, result);
      }
      if (method === 'PUT' && sub === 'md') {
        const body = (await readJson(req)) as { md?: string };
        if (typeof body.md !== 'string') return send(res, 400, { error: 'md required' });
        const result = await writeMd(docId, body.md);
        return send(res, 200, result);
      }
      if (method === 'DELETE' && !sub) {
        await reclaim(docId, 'manual');
        return send(res, 200, { docId, status: 'stopped', previewUrl: null } satisfies PreviewResponse);
      }
    } catch (e) {
      console.error('[http] handler error', e);
      return send(res, 500, { error: (e as Error).message });
    }
  }

  send(res, 404, { error: 'not found', path });
});

// WebSocket 升级：HMR 走 ws，必须转发以保活预览
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const m = url.pathname.match(/^\/p\/([^/]+)/);
  if (!m) { socket.destroy(); return; }
  const token = m[1]!;
  const s = getByToken(token);
  if (!s || !s.hostPort || (s.status !== 'ready' && s.status !== 'starting')) {
    socket.destroy();
    return;
  }
  touch(token); // 重置空闲计时器
  // 原始 TCP 转发：保留完整 /p/<token>/ 路径（Vite --base 自行剥离），Host 沿用浏览器原值。
  // 容器回包原样回写给客户端，后续帧双向 pipe。
  const { host, port } = upstream(s);
  const target = tcpConnect(port, host, () => {
    let raw = `${req.method} ${url.pathname}${url.search ?? ''} HTTP/1.1\r\n`;
    const headers = { ...req.headers };
    for (const [k, v] of Object.entries(headers)) {
      if (v !== undefined) raw += `${k}: ${Array.isArray(v) ? v.join(', ') : v}\r\n`;
    }
    raw += '\r\n';
    target.write(raw);
    if (head.length) target.write(head);
    target.pipe(socket);
    socket.pipe(target);
  });
  target.on('error', () => socket.destroy());
  socket.on('error', () => target.destroy());
});

/** HTTP 反代到容器，并重置空闲计时器 */
function proxyHttp(req: IncomingMessage, res: ServerResponse, path: string): void {
  const m = path.match(/^\/p\/([^/]+)/);
  if (!m) return send(res, 404, { error: 'bad proxy path' });
  const token = m[1]!;
  const s = getByToken(token);
  if (!s || !s.hostPort) return send(res, 404, { error: 'unknown preview token' });
  if (s.status !== 'ready' && s.status !== 'starting') {
    return send(res, 503, { error: 'container not ready', status: s.status });
  }
  touch(token); // HMR/预览请求重置空闲回收

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Vite 以 --base /p/<token>/ 启动，访问裸 /p/<token>（无尾斜杠）时回 404
  // "did you mean /p/<token>/" 而非 302。此处补 302 到带斜杠形式（保留 query），
  // 兜底旧 previewUrl 契约与手动访问；buildPreviewUrl 现已直接发带斜杠形式。
  if (url.pathname === `/p/${token}`) {
    res.writeHead(302, { location: `/p/${token}/${url.search || ''}` });
    res.end();
    return;
  }

  const { host, port } = upstream(s);
  // 转发完整原始路径（保留 /p/<token>/ 前缀）：Slidev 以 --base /p/<token>/ 启动，
  // Vite 会自行剥离 base；故反代不做路径改写。Host 头沿用浏览器原值（localhost），
  // 避免 Vite 的 DNS rebinding 保护拦截容器名主机。
  const proxyReq = httpRequest({
    host,
    port,
    method: req.method,
    path: url.pathname + (url.search || ''),
    headers: { ...req.headers },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (e) => {
    if (!res.headersSent) send(res, 502, { error: 'upstream error', detail: e.message });
    else res.end();
  });
  req.pipe(proxyReq);
}

async function main(): Promise<void> {
  await initPool();
  server.listen(PORT, () => {
    console.log(`[render-service] listening on :${PORT} (preview base=${config.previewBase} mode=${config.previewMode})`);
  });
}

void main();
