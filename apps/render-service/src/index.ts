/**
 * 渲染调度服务（骨架）。
 *
 * 职责（待渲染服务工程师完整实现）：
 * - 维护 Slidev dev server Docker 容器池
 * - 按需启动 / 空闲 5-10 分钟回收 / 并发上限排队
 * - 为每个实例挂载用户 MD + 主题 + 启用组件目录
 * - 返回专属预览 URL 供前端 iframe 接入
 *
 * 本骨架只起一个 HTTP 服务，暴露 /preview/:docId 端点占位。
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 3100);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/preview/') && req.method === 'POST') {
    // TODO: 分配/启动 dev server 容器，返回预览 URL
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      docId: url.pathname.split('/').pop(),
      status: 'pending',
      previewUrl: null, // 待容器就绪后填入
      message: '渲染调度逻辑待实现',
    }));
    return;
  }

  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ service: 'render-service', status: 'online' }));
});

server.listen(PORT, () => {
  console.log(`[render-service] listening on :${PORT}`);
});
