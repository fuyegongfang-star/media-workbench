// T4.5 批量操作纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/batch.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/content/batch/batch.util.js';
const { normalizeTags, planTagPatch, validateBatchRequest, STATUS_OPTIONS } = util;

// ---------- normalizeTags ----------
test('normalizeTags: 过滤非字符串/空白/去重/保序', () => {
  assert.deepEqual(normalizeTags([' a ', '', 'b', 'a', 1, null, 'b']), ['a', 'b']);
});
test('normalizeTags: 非数组返回空', () => {
  assert.deepEqual(normalizeTags('x'), []);
  assert.deepEqual(normalizeTags(undefined), []);
});

// ---------- planTagPatch ----------
test('planTagPatch add: 并入并去重', () => {
  assert.deepEqual(planTagPatch(['a', 'b'], 'add', ['b', 'c']), ['a', 'b', 'c']);
});
test('planTagPatch remove: 剔除输入项', () => {
  assert.deepEqual(planTagPatch(['a', 'b', 'c'], 'remove', ['b']), ['a', 'c']);
});
test('planTagPatch replace: 以输入为准', () => {
  assert.deepEqual(planTagPatch(['a', 'b'], 'replace', ['x', 'x', 'y']), ['x', 'y']);
});
test('planTagPatch 默认模式视为 add', () => {
  assert.deepEqual(planTagPatch(['a'], undefined, ['b']), ['a', 'b']);
});

// ---------- validateBatchRequest ----------
test('validateBatchRequest: 合法 setStatus', () => {
  const r = validateBatchRequest({ type: 'topic', action: 'setStatus', ids: ['t1'], status: 'active' });
  assert.equal(r.ok, true);
  assert.equal(r.data.status, 'active');
});
test('validateBatchRequest: 合法 tag（默认 add）', () => {
  const r = validateBatchRequest({ type: 'project', action: 'tag', ids: ['p1'], tags: ['x', 'y'] });
  assert.equal(r.ok, true);
  assert.equal(r.data.tagMode, 'add');
});
test('validateBatchRequest: 合法 delete', () => {
  const r = validateBatchRequest({ type: 'title', action: 'delete', ids: ['c1', 'c2'] });
  assert.equal(r.ok, true);
});
test('validateBatchRequest: publish 仅 project 允许', () => {
  assert.equal(validateBatchRequest({ type: 'topic', action: 'publish', ids: ['t1'] }).ok, false);
  assert.equal(validateBatchRequest({ type: 'project', action: 'publish', ids: ['p1'] }).ok, true);
});
test('validateBatchRequest: 非法 type', () => {
  assert.equal(validateBatchRequest({ type: 'xxx', action: 'delete', ids: ['1'] }).ok, false);
});
test('validateBatchRequest: 空 ids 拒绝', () => {
  assert.equal(validateBatchRequest({ type: 'topic', action: 'delete', ids: [] }).ok, false);
});
test('validateBatchRequest: 超长 ids 拒绝', () => {
  const ids = Array.from({ length: 201 }, (_, i) => `id${i}`);
  assert.equal(validateBatchRequest({ type: 'topic', action: 'delete', ids }).ok, false);
});
test('validateBatchRequest: setStatus 状态不合法', () => {
  assert.equal(validateBatchRequest({ type: 'topic', action: 'setStatus', ids: ['t1'], status: 'BOGUS' }).ok, false);
});
test('validateBatchRequest: tag 缺 tags 拒绝', () => {
  assert.equal(validateBatchRequest({ type: 'project', action: 'tag', ids: ['p1'] }).ok, false);
});
test('validateBatchRequest: tagMode 非法拒绝', () => {
  assert.equal(validateBatchRequest({ type: 'project', action: 'tag', ids: ['p1'], tags: ['a'], tagMode: 'nope' }).ok, false);
});
test('STATUS_OPTIONS 覆盖三种类型', () => {
  assert.ok(STATUS_OPTIONS.topic.includes('draft'));
  assert.ok(STATUS_OPTIONS.title.includes('selected'));
  assert.ok(STATUS_OPTIONS.project.includes('APPROVED'));
});
