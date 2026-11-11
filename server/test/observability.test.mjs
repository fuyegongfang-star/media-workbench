// T1.9 可观测性纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/observability.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/observability/observability.util.js';
const {
  RECYCLE_MODELS,
  getRecycleModel,
  buildAuditWhere,
  clampPage,
  formatRecycleName,
} = util;

test('RECYCLE_MODELS 与 T1.3 软删实体一致（8 个）', () => {
  assert.equal(RECYCLE_MODELS.length, 8);
  const keys = RECYCLE_MODELS.map((m) => m.model).sort();
  assert.deepEqual(keys, [
    'accountStrategy',
    'contentProject',
    'launchPlan',
    'mediaAsset',
    'ownedAccount',
    'referenceAccount',
    'sourceMaterial',
    'topic',
  ]);
});

test('getRecycleModel: 已知类型返回元数据，未知返回 null', () => {
  assert.equal(getRecycleModel('owned-account')?.model, 'ownedAccount');
  assert.equal(getRecycleModel('nope'), null);
});

test('buildAuditWhere: 仅 objectType', () => {
  assert.deepEqual(buildAuditWhere({ objectType: 'Topic' }), { objectType: 'Topic' });
});

test('buildAuditWhere: 日期区间生成 at.gte/lte', () => {
  const w = buildAuditWhere({ from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });
  assert.ok(w.at && w.at.gte instanceof Date && w.at.lte instanceof Date);
});

test('buildAuditWhere: 无效日期被忽略，不写 at', () => {
  const w = buildAuditWhere({ from: 'not-a-date', action: 'create' });
  assert.equal(w.action, 'create');
  assert.equal(w.at, undefined);
});

test('clampPage: 默认与收敛边界', () => {
  const d = clampPage();
  assert.deepEqual({ page: d.page, pageSize: d.pageSize, skip: d.skip, take: d.take }, {
    page: 1,
    pageSize: 20,
    skip: 0,
    take: 20,
  });
  const big = clampPage(0, 9999);
  assert.equal(big.page, 1);
  assert.equal(big.pageSize, 200);
  assert.equal(big.skip, 0);
  const p3 = clampPage(3, 10);
  assert.equal(p3.skip, 20);
  assert.equal(p3.take, 10);
});

test('formatRecycleName: 普通字段截断 + 版本格式化', () => {
  assert.equal(formatRecycleName({ key: 'owned-account', model: 'ownedAccount', label: '自有账号', nameField: 'name' }, { name: '我的账号' }), '我的账号');
  const long = formatRecycleName({ key: 't', model: 'm', label: 'L', nameField: 'title' }, { title: 'x'.repeat(80) });
  assert.equal(long.length, 61); // 60 + …
  assert.equal(formatRecycleName({ key: 'account-strategy', model: 'accountStrategy', label: '账号策略', nameField: 'version', format: 'version' }, { version: 3 }), 'v3');
  assert.equal(formatRecycleName({ key: 't', model: 'm', label: 'L' }, {}), 'L');
});
