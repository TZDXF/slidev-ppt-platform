/**
 * ops 应用器：把 EditOp[] 应用到 ParsedDoc，返回新 doc。
 * 纯函数，不改原 doc；遇到非法 index 抛错（由调用方决定回滚还是忽略）。
 *
 * 副作用边界：本模块只做结构变换，不调 AI、不写存储。
 */
import type { EditOp, UpdateFrontmatterOp } from './ops.js';
import type { ParsedDoc } from './slidev.js';

export function applyOps(doc: ParsedDoc, ops: EditOp[]): ParsedDoc {
  let { frontmatter, slides } = doc;
  // 浅拷贝 slides 数组与 frontmatter，避免改动入参
  let slidesArr = slides.map(s => ({ ...s }));
  let fm = { ...frontmatter };

  for (const op of ops) {
    switch (op.type) {
      case 'updateSlide': {
        if (op.index < 0 || op.index >= slidesArr.length) {
          throw new Error(`updateSlide: index ${op.index} 越界（共 ${slidesArr.length} 页）`);
        }
        slidesArr[op.index] = { index: op.index, content: op.md };
        break;
      }
      case 'insertSlide': {
        const at = op.after + 1; // after=-1 → 0
        if (at < 0 || at > slidesArr.length) {
          throw new Error(`insertSlide: after ${op.after} 越界`);
        }
        slidesArr.splice(at, 0, { index: at, content: op.md });
        break;
      }
      case 'deleteSlide': {
        if (op.index < 0 || op.index >= slidesArr.length) {
          throw new Error(`deleteSlide: index ${op.index} 越界`);
        }
        slidesArr.splice(op.index, 1);
        break;
      }
      case 'moveSlide': {
        if (op.from < 0 || op.from >= slidesArr.length) {
          throw new Error(`moveSlide: from ${op.from} 越界`);
        }
        const removed = slidesArr.splice(op.from, 1);
        const moved = removed[0];
        if (!moved) throw new Error(`moveSlide: from ${op.from} 取出失败`);
        const target = op.to < 0 ? 0 : op.to > slidesArr.length ? slidesArr.length : op.to;
        slidesArr.splice(target, 0, moved);
        break;
      }
      case 'updateFrontmatter': {
        fm = patchFrontmatter(fm, op as UpdateFrontmatterOp);
        break;
      }
      default: {
        const _exhaustive: never = op;
        throw new Error(`未知 op 类型: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  // 重排 index
  slidesArr = slidesArr.map((s, i) => ({ ...s, index: i }));
  return { frontmatter: fm, slides: slidesArr };
}

/**
 * 把 patch 应用到 frontmatter.raw 文本上。
 * 简单实现：按行 key= 解析，patch 中的 key 覆盖或新增，未涉及的行保留。
 * null 值表示删除该 key。
 */
function patchFrontmatter(
  fm: { raw: string; theme?: string },
  op: UpdateFrontmatterOp,
): { raw: string; theme?: string } {
  const lines = fm.raw.split('\n').filter(l => l.trim() !== '');
  const map = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0) map.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  for (const [k, v] of Object.entries(op.patch)) {
    if (v === null) {
      map.delete(k);
    } else {
      map.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }
  const raw = Array.from(map.entries()).map(([k, v]) => `${k}: ${v}`).join('\n');
  const theme = map.get('theme') ?? fm.theme;
  return { raw, theme };
}
