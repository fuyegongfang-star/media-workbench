// T1.5 状态机纯函数单测（不依赖数据库 / Redis）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/tasks.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canTransition, nextStatus } from '../dist/modules/tasks/task-state-machine.js';

test('queued --start--> running', () => {
  assert.equal(nextStatus('queued', 'start'), 'running');
});

test('running --succeed--> success', () => {
  assert.equal(nextStatus('running', 'succeed'), 'success');
});

test('running --fail--> failed', () => {
  assert.equal(nextStatus('running', 'fail'), 'failed');
});

test('running --cancel--> cancelled', () => {
  assert.equal(nextStatus('running', 'cancel'), 'cancelled');
});

test('queued --cancel--> cancelled', () => {
  assert.equal(nextStatus('queued', 'cancel'), 'cancelled');
});

test('failed --retry--> queued', () => {
  assert.equal(nextStatus('failed', 'retry'), 'queued');
});

test('cancelled --retry--> queued', () => {
  assert.equal(nextStatus('cancelled', 'retry'), 'queued');
});

test('canTransition: 合法流转为真', () => {
  assert.equal(canTransition('queued', 'start'), true);
  assert.equal(canTransition('running', 'succeed'), true);
  assert.equal(canTransition('failed', 'retry'), true);
});

test('canTransition: 非法流转为假', () => {
  assert.equal(canTransition('success', 'start'), false);
  assert.equal(canTransition('queued', 'succeed'), false);
  assert.equal(canTransition('queued', 'retry'), false);
});

test('nextStatus: 非法流转抛错', () => {
  assert.throws(() => nextStatus('success', 'start'), /非法状态流转/);
  assert.throws(() => nextStatus('queued', 'succeed'), /非法状态流转/);
});
