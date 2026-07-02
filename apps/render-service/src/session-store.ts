/**
 * 会话文件系统层。
 *
 * 每个文档在宿主机 SESSIONS_DIR/<docId>/ 下准备一个目录：
 *   slides.md           —— 用户 MD（由 web 端写入，挂载进容器供 Slidev 读取/HMR）
 *   components-extra/   —— 额外启用组件（可选，由调用方提供目录后软链/拷入）
 *
 * 该目录整体挂载进容器 /app，slides.md 作为 Slidev 入口；镜像内置组件在
 * /app/components（由 Dockerfile 预装），额外组件挂载到 /app/components/extra。
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

const EMPTY_DECK = `---
theme: default
title: 未命名演示
---

# 未命名演示

渲染服务已就绪，等待内容写入。
`;

export class SessionStore {
  constructor(private readonly root: string) {}

  /** 确保某文档的会话目录存在，返回其绝对路径 */
  async ensure(docId: string): Promise<string> {
    const dir = join(this.root, this.safe(docId));
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /** 写入 slides.md（HMR 自动重渲染）。返回会话目录路径。 */
  async writeMd(docId: string, md: string): Promise<string> {
    const dir = await this.ensure(docId);
    await writeFile(join(dir, 'slides.md'), md, 'utf8');
    return dir;
  }

  /** 读取当前 slides.md；不存在返回 EMPTY_DECK */
  async readMd(docId: string): Promise<string> {
    const file = join(this.root, this.safe(docId), 'slides.md');
    if (!existsSync(file)) return EMPTY_DECK;
    return readFile(file, 'utf8');
  }

  /** 删除会话目录（回收时调用） */
  async remove(docId: string): Promise<void> {
    const dir = join(this.root, this.safe(docId));
    try {
      const { rm } = await import('node:fs/promises');
      await rm(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }

  /** 规整 docId，避免路径穿越 */
  private safe(docId: string): string {
    return docId.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}

export const sessionStore = new SessionStore(config.sessionsDir);
export { EMPTY_DECK };
