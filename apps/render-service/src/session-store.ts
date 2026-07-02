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
import { mkdir, writeFile, readFile, rm, lstat, symlink } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
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

  /** 写入 slides.md（HMR 自动重渲染）。返回会话目录路径。
   *  幂等且自愈：若目标路径因历史坏挂载残留为目录，先删除再写；写完同步确认是普通文件。 */
  async writeMd(docId: string, md: string): Promise<string> {
    const dir = await this.ensure(docId);
    const file = join(dir, 'slides.md');
    // 历史上单文件 bind mount 若在源文件不存在时被 Docker 建成目录，writeFile 会 EISDIR。
    // 这里自愈：目标是目录就先清掉，保证 writeFile 一定能落盘成普通文件。
    if (existsSync(file)) {
      const st = statSync(file);
      if (!st.isFile()) {
        await rm(file, { recursive: true, force: true });
      }
    }
    await writeFile(file, md, 'utf8');
    // 同步确认：必须是普通文件，否则后续 docker 挂载会再次踩 EISDIR。
    const after = statSync(file);
    if (!after.isFile()) {
      throw new Error(`slides.md 写入后仍非普通文件: ${file}`);
    }
    return dir;
  }

  /** 在会话目录内建立 components → 镜像内置组件目录的符号链接。
   *  dev server 容器把命名卷挂到 /deck（:ro），slides.md 在 /deck/<docId>/ 下，
   *  Slidev 以 slides.md 所在目录为项目根查找 components/。链接目标 /app/components
   *  仅在 dev server 容器内有意义；链接本身只存路径字符串，由 render-service 创建即可。 */
  async ensureComponentsSymlink(docId: string): Promise<void> {
    const dir = await this.ensure(docId);
    const link = join(dir, 'components');
    try {
      const st = await lstat(link).catch(() => null);
      if (st) {
        // 已存在：若不是符号链接（比如历史残留目录）则清掉重建
        if (!st.isSymbolicLink()) {
          await rm(link, { recursive: true, force: true });
          await symlink(config.builtinComponentsDir, link, 'dir');
        }
        return;
      }
      await symlink(config.builtinComponentsDir, link, 'dir');
    } catch {
      // best-effort：链接创建失败不阻断启动（内置组件不可用时仅影响引用组件的幻灯片）
    }
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
