// Slidev 解析/序列化 + contentHash 行为测试。
// 运行：node --test --experimental-strip-types test/slidev.test.mjs（在 packages/shared 目录下）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSlidev, serializeSlidev } from '../src/slidev.ts';
import { contentHash } from '../src/publish.ts';

test('parseSlidev 提取 theme（无引号）', () => {
  const md = `---
theme: seriph
---
# Hello
`;
  const doc = parseSlidev(md);
  assert.equal(doc.frontmatter.theme, 'seriph');
  assert.equal(doc.frontmatter.raw, 'theme: seriph');
});

test('parseSlidev 提取 theme（双引号）', () => {
  const md = `---
theme: "seriph"
---
# Hello
`;
  const doc = parseSlidev(md);
  assert.equal(doc.frontmatter.theme, 'seriph');
});

test('parseSlidev 提取 theme（单引号）', () => {
  const md = `---
theme: 'seriph'
---
# Hello
`;
  const doc = parseSlidev(md);
  assert.equal(doc.frontmatter.theme, 'seriph');
});

test('parseSlidev 多字段 frontmatter 中提取 theme', () => {
  const md = `---
title: My Deck
theme: seriph
aspectRatio: 16/9
---
# Hello
`;
  const doc = parseSlidev(md);
  assert.equal(doc.frontmatter.theme, 'seriph');
});

test('parseSlidev 无 theme 字段时 theme 为 undefined（向后兼容）', () => {
  const md = `---
title: My Deck
---
# Hello
`;
  const doc = parseSlidev(md);
  assert.equal(doc.frontmatter.theme, undefined);
});

test('parseSlidev 无 frontmatter 时 theme 为 undefined', () => {
  const doc = parseSlidev('# Hello');
  assert.equal(doc.frontmatter.theme, undefined);
  assert.equal(doc.frontmatter.raw, '');
});

test('serializeSlidev 与 parseSlidev 互逆（raw 不变）', () => {
  const md = `---
theme: seriph
---
# Hello

---
# World
`;
  const doc = parseSlidev(md);
  const round = parseSlidev(serializeSlidev(doc));
  assert.equal(round.frontmatter.raw, doc.frontmatter.raw);
  assert.equal(round.frontmatter.theme, 'seriph');
  assert.deepEqual(
    round.slides.map(s => s.content),
    doc.slides.map(s => s.content),
  );
});

test('contentHash 区分 theme（正文相同，seriph vs default）', () => {
  const body = `# Hello\n\n---\n\n# World`;
  const mdSeriph = `---
theme: seriph
---
${body}`;
  const mdDefault = `---
title: x
---
${body}`;
  const seriph = parseSlidev(mdSeriph);
  const def = parseSlidev(mdDefault);
  assert.equal(seriph.frontmatter.theme, 'seriph');
  assert.equal(def.frontmatter.theme, undefined);
  const hSeriph = contentHash(seriph, []);
  const hDefault = contentHash(def, []);
  // 修复前 seriph.theme 为 undefined，两者都回退 'default' 而撞 hash
  assert.notEqual(hSeriph, hDefault);
});

test('theme 提取对引号归一化（hash 仍按 raw 真相源，此处只验提取）', () => {
  const body = `# Hello`;
  const mdA = `---
theme: seriph
---
${body}`;
  const mdB = `---
theme: "seriph"
---
${body}`;
  // 两种写法提取出的 theme 一致
  assert.equal(parseSlidev(mdA).frontmatter.theme, parseSlidev(mdB).frontmatter.theme);
  // 注：contentHash 输入含 serializeSlidev(doc)（raw 真相源），
  // 故 raw 文本不同（带不带引号）时 hash 仍不同 —— 这是预期，raw 是真相源。
});
