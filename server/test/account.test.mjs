// T1.7 账号与策略纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/account.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/account/account.util.js';
const { isPrismaJsonValue, nextStrategyVersion, planDefaultStrategyToggle, planBindStrategyToAccount } = util;

test('isPrismaJsonValue: 标量/对象/数组/嵌套/null 通过', () => {
  assert.equal(isPrismaJsonValue('x'), true);
  assert.equal(isPrismaJsonValue(123), true);
  assert.equal(isPrismaJsonValue(true), true);
  assert.equal(isPrismaJsonValue(null), true);
  assert.equal(isPrismaJsonValue(undefined), true);
  assert.equal(isPrismaJsonValue({ a: 1, b: [1, '2', null] }), true);
  assert.equal(isPrismaJsonValue([{ k: 'v' }]), true);
});

test('isPrismaJsonValue: 函数/Date 等非常规值拒绝', () => {
  assert.equal(isPrismaJsonValue(() => 1), false);
  assert.equal(isPrismaJsonValue(Symbol('x')), false);
});

test('nextStrategyVersion: 空集合为 1，否则 max+1', () => {
  assert.equal(nextStrategyVersion([]), 1);
  assert.equal(nextStrategyVersion([1]), 2);
  assert.equal(nextStrategyVersion([1, 2, 3]), 4);
});

test('planDefaultStrategyToggle: 设为默认且当前非默认 → 需清其它', () => {
  const r = planDefaultStrategyToggle({ isDefault: true, strategyId: 's2', activeDefaultId: 's1' });
  assert.deepEqual(r, { targetDefault: true, unsetOthers: true });
});

test('planDefaultStrategyToggle: 设为默认且当前已是默认 → 无需清其它', () => {
  const r = planDefaultStrategyToggle({ isDefault: true, strategyId: 's1', activeDefaultId: 's1' });
  assert.deepEqual(r, { targetDefault: true, unsetOthers: false });
});

test('planDefaultStrategyToggle: 显式取消且当前是默认 → 标记改动', () => {
  const r = planDefaultStrategyToggle({ isDefault: false, strategyId: 's1', activeDefaultId: 's1' });
  assert.deepEqual(r, { targetDefault: false, unsetOthers: true });
});

test('planDefaultStrategyToggle: 未传 isDefault → 维持现状', () => {
  const r = planDefaultStrategyToggle({ strategyId: 's2', activeDefaultId: 's1' });
  assert.deepEqual(r, { targetDefault: false, unsetOthers: false });
});

// ---------- T2.5 策略版本绑定到自有账号 ----------

test('planBindStrategyToAccount: 绑定到新版本 → boundId 变更', () => {
  const r = planBindStrategyToAccount({ strategyId: 's1', currentBoundId: null });
  assert.deepEqual(r, { boundId: 's1', changed: true });
});

test('planBindStrategyToAccount: 重复绑定同一版本 → 无变更', () => {
  const r = planBindStrategyToAccount({ strategyId: 's1', currentBoundId: 's1' });
  assert.deepEqual(r, { boundId: 's1', changed: false });
});

test('planBindStrategyToAccount: 切换到另一版本 → boundId 变更', () => {
  const r = planBindStrategyToAccount({ strategyId: 's2', currentBoundId: 's1' });
  assert.deepEqual(r, { boundId: 's2', changed: true });
});

test('planBindStrategyToAccount: null/undefined 解绑 → boundId 置空且变更', () => {
  assert.deepEqual(planBindStrategyToAccount({ strategyId: null, currentBoundId: 's1' }), {
    boundId: null,
    changed: true,
  });
  assert.deepEqual(planBindStrategyToAccount({ strategyId: undefined, currentBoundId: 's1' }), {
    boundId: null,
    changed: true,
  });
  assert.deepEqual(planBindStrategyToAccount({ strategyId: null, currentBoundId: null }), {
    boundId: null,
    changed: false,
  });
});
