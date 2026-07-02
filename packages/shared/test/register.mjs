// 让 node 在加载时把 `./x.js` 解析到 `./x.ts`（type stripping 场景下），
// 这样 publish.ts 内部的 `from './slidev.js'` 能在测试里直接跑通。
import { register } from 'node:module';

register(
  './resolve-hook-impl.mjs',
  import.meta.url,
);
