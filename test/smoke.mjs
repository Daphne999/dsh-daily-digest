/**
 * smoke.mjs —— 用假 ctx 验证 digest_scan 注册与两次调用的行为差异。
 *
 * 第一次调用应当「建基线」，第二次调用在没有任何变化时应当「没有新增」。
 * 用法：node test/smoke.mjs [stateDir]
 */
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apply } from '../lib/index.js';

const stateDir = process.argv[2] || mkdtempSync(path.join(os.tmpdir(), 'dsh-digest-'));
const registered = [];
const fakeCtx = {
  logger: { info: () => {} },
  get: (k) => (k === 'tools' ? { register: (def) => registered.push(def) } : undefined),
  effect: () => {},
  on: () => {},
};

await apply(fakeCtx, { stateDir, marketPort: 61310, topN: 5 });
const tool = registered.find((t) => t.name === 'digest_scan');
if (!tool) {
  console.error('❌ 没有注册 digest_scan');
  process.exit(1);
}
console.log('✅ digest_scan 已注册\n');

const first = await tool.execute({ scope: 'all' });
console.log('--- 第一次（建基线）---');
console.log(first.report);

const second = await tool.execute({ scope: 'all' });
console.log('\n--- 第二次（应无新增）---');
console.log(second.report);

const bad = await tool.execute({ scope: 'nonsense' });
if (bad.scope !== 'all') {
  console.error('❌ 非法 scope 没有被兜底成 all');
  process.exit(1);
}
console.log('\n✅ 非法 scope 正确兜底');
