/**
 * slidev build 执行器。
 *
 * 流程：临时项目目录 → 写 MD（serializeSlidev）→ 装主题 → 软链启用的内置组件
 * → `npx slidev build` → 收紧产物 CSP → 返回 dist 路径。
 *
 * 隔离：每个 build 在独立临时目录进行；超时 BUILD_TIMEOUT_MS（默认 120s）；
 * 资源限制可由容器层 cgroups 兜底（这里至少保证超时杀进程，防卡死队列槽位）。
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeSlidev } from '@slidev-ppt/shared';
import type { ParsedDoc } from '@slidev-ppt/shared';

const BUILD_TIMEOUT_MS = Number(process.env.BUILD_TIMEOUT_MS ?? 120_000);
/** 内置组件源目录（packages/components/src），可通过 env 覆盖 */
const COMPONENTS_DIR =
  process.env.COMPONENTS_DIR ??
    fileURLToPath(new URL('../../packages/components/src', import.meta.url));

export interface BuildInput {
  doc: ParsedDoc;
  components: string[];
  pptId: string;
}

export interface BuildOutput {
  /** dist 目录绝对路径 */
  distDir: string;
  /** 临时项目根目录（调用方负责清理） */
  projectDir: string;
}

/**
 * 在隔离临时目录执行 slidev build，返回 dist 目录。
 * 调用方负责上传产物后清理 projectDir。
 */
export async function runSlidevBuild(input: BuildInput): Promise<BuildOutput> {
  const { doc, components, pptId } = input;
  const projectDir = mkdtempSync(join(tmpdir(), `slidev-build-${pptId}-`));
  const distDir = join(projectDir, 'dist');
  const componentsTarget = join(projectDir, 'components');

  try {
    // 1. 写 slides.md
    const md = serializeSlidev(doc);
    writeFileSync(join(projectDir, 'slides.md'), md, 'utf8');

    // 2. 写 package.json（声明主题依赖，slidev 据此解析主题）
    const theme = doc.frontmatter.theme ?? 'default';
    const deps: Record<string, string> = {};
    if (theme && theme !== 'default' && theme !== 'none') {
      deps[`@slidev/theme-${theme}`] = 'latest';
    }
    writeFileSync(
      join(projectDir, 'package.json'),
      JSON.stringify(
        {
          name: `slidev-build-${pptId}`,
          private: true,
          dependencies: deps,
        },
        null,
        2,
      ),
    );

    // 3. 软链启用的内置组件（Slidev 自动注册 components/ 下 .vue）
    if (components.length) {
      mkdirSync(componentsTarget, { recursive: true });
      for (const name of components) {
        const src = join(COMPONENTS_DIR, `${name}.vue`);
        if (!existsSync(src)) {
          // 组件源缺失：跳过而非整体失败，避免一个未启用组件阻塞发布
          console.warn(`[builder] 组件源不存在，跳过: ${name} (${src})`);
          continue;
        }
        try {
          symlinkSync(src, join(componentsTarget, `${name}.vue`));
        } catch {
          // 某些文件系统不支持 symlink（且无权限），回退拷贝
          copyFileSync(src, join(componentsTarget, `${name}.vue`));
        }
      }
    }

    // 4. 装主题（若声明）
    if (Object.keys(deps).length) {
      await runCmd('npm', ['install', '--no-audit', '--no-fund'], projectDir, BUILD_TIMEOUT_MS);
    }

    // 5. slidev build
    //    SLIDEV_BIN 可覆盖（如镜像内预装的 slidev 二进制）；默认 npx slidev
    const slidevBin = (process.env.SLIDEV_BIN ?? 'npx slidev').split(/\s+/);
    const buildArgs = [...slidevBin.slice(1), 'build', 'slides.md', '--base', `/p/${pptId}/`, '--out', 'dist'];
    await runCmd(slidevBin[0]!, buildArgs, projectDir, BUILD_TIMEOUT_MS);

    // 6. 收紧产物 CSP：HTML 入口注入严格策略（CDN 层应另设 response header 兜底）
    injectCsp(join(distDir, 'index.html'), pptId);

    if (!existsSync(distDir)) {
      throw new Error('slidev build 完成但未生成 dist 目录');
    }
    return { distDir, projectDir };
  } catch (err) {
    rmSync(projectDir, { recursive: true, force: true });
    throw err;
  }
}

/** 运行子进程，超时则杀进程并 reject。 */
function runCmd(bin: string, args: string[], cwd: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: 'ignore', shell: process.platform === 'win32' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`命令超时 (${timeoutMs}ms): ${bin} ${args.join(' ')}`));
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`命令失败 (exit ${code}): ${bin} ${args.join(' ')}`));
    });
  });
}

/**
 * 注入严格 CSP：仅允许同源（CDN）与 slidev 必要的内联脚本/样式。
 * 用 meta 标签是 best-effort；生产应在 CDN/OSS 响应头设置 Content-Security-Policy。
 */
function injectCsp(indexHtml: string, pptId: string): void {
  if (!existsSync(indexHtml)) return;
  const csp = [
    "default-src 'self'",
    // slidev 构建产物用内联 <script> 引导，需 unsafe-inline；其余脚本同源
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; ');
  let html = readFileSync(indexHtml, 'utf8');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
  } else {
    html = meta + html;
  }
  writeFileSync(indexHtml, html, 'utf8');
  void pptId;
}
