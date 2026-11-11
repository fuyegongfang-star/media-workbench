// T1.3 纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/data-integrity.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

// data-integrity.ts 编译为 CJS，经 interop 取默认导出再解构
import di from '../dist/prisma/data-integrity.js';

const {
  isSoftDeletable,
  withSoftDeleteFilter,
  buildSoftDeleteMutation,
  extractObjectId,
  buildAuditEventData,
} = di;

test('isSoftDeletable: 带 deletedAt 的实体为真，User/AuditEvent 为假', () => {
  assert.equal(isSoftDeletable('OwnedAccount'), true);
  assert.equal(isSoftDeletable('SourceMaterial'), true);
  assert.equal(isSoftDeletable('ContentProject'), true);
  assert.equal(isSoftDeletable('LaunchPlan'), true);
  assert.equal(isSoftDeletable('User'), false);
  assert.equal(isSoftDeletable('AuditEvent'), false);
  assert.equal(isSoftDeletable(undefined), false);
});

test('withSoftDeleteFilter: 读取查询注入 deletedAt:null', () => {
  const out = withSoftDeleteFilter('SourceMaterial', 'findMany', { where: { referenceAccountId: 'a1' } });
  assert.deepEqual(out.where, { referenceAccountId: 'a1', deletedAt: null });
});

test('withSoftDeleteFilter: 已显式 deletedAt 时尊重原意，不覆盖', () => {
  const out = withSoftDeleteFilter('SourceMaterial', 'findMany', { where: { deletedAt: { not: null } } });
  assert.deepEqual(out.where, { deletedAt: { not: null } });
});

test('withSoftDeleteFilter: 非读取操作或非软删模型不改动', () => {
  const a = withSoftDeleteFilter('SourceMaterial', 'delete', { where: { id: 'x' } });
  assert.equal(a.where?.deletedAt, undefined);
  const b = withSoftDeleteFilter('User', 'findMany', {});
  assert.equal(b.where, undefined);
});

test('buildSoftDeleteMutation: delete → update + 置 deletedAt', () => {
  const m = buildSoftDeleteMutation('Topic', 'delete', { where: { id: 't1' } });
  assert.equal(m.operation, 'update');
  assert.equal(m.args.where.id, 't1');
  assert.ok(m.args.data.deletedAt instanceof Date);
});

test('buildSoftDeleteMutation: deleteMany → updateMany + 空 where 兜底', () => {
  const m = buildSoftDeleteMutation('Topic', 'deleteMany', {});
  assert.equal(m.operation, 'updateMany');
  assert.deepEqual(m.args.where, {});
  assert.ok(m.args.data.deletedAt instanceof Date);
});

test('buildSoftDeleteMutation: 非删除/非软删实体返回 null', () => {
  assert.equal(buildSoftDeleteMutation('Topic', 'update', {}), null);
  assert.equal(buildSoftDeleteMutation('User', 'delete', {}), null);
});

test('extractObjectId: create 取 result.id，update 取 where.id，批量记 many', () => {
  assert.equal(extractObjectId('create', {}, { id: 'abc' }), 'abc');
  assert.equal(extractObjectId('update', { where: { id: 'xyz' } }), 'xyz');
  assert.equal(extractObjectId('deleteMany', {}, { count: 3 }), 'many');
  assert.equal(extractObjectId('update', {}), undefined);
});

test('buildAuditEventData: 不写明文密钥，字段齐全', () => {
  const ev = buildAuditEventData({
    model: 'Topic',
    operation: 'delete',
    objectId: 't1',
    userId: 'u1',
  });
  assert.deepEqual(ev, { userId: 'u1', objectType: 'Topic', objectId: 't1', action: 'delete' });
  assert.equal(Object.prototype.hasOwnProperty.call(ev, 'secret'), false);
});
