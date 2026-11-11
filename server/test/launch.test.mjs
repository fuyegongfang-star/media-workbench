// T4.1 图文起号计划 —— 纯函数单测（不依赖 DB/Redis）。
// 运行：先 `npm run build` 产出 dist，再 `node --test test/launch.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/launch/launch.util.js';
const {
  isProjectDone,
  deriveTaskStatusFromProject,
  computePlanProgress,
  nextImageSortOrder,
  reorderImages,
  PROJECT_DONE_STATUSES,
} = util;

test('isProjectDone: 仅 PUBLISHED/ARCHIVED 视为已发布', () => {
  assert.equal(isProjectDone('PUBLISHED'), true);
  assert.equal(isProjectDone('ARCHIVED'), true);
  assert.equal(isProjectDone('APPROVED'), false);
  assert.equal(isProjectDone('CREATING'), false);
  assert.equal(isProjectDone(null), false);
  assert.equal(isProjectDone(undefined), false);
});

test('PROJECT_DONE_STATUSES 与内容项目状态枚举一致', () => {
  assert.deepEqual([...PROJECT_DONE_STATUSES].sort(), ['ARCHIVED', 'PUBLISHED']);
});

test('deriveTaskStatusFromProject: 关联项目已发布 → 任务置 done 并回写发布时间', () => {
  const r = deriveTaskStatusFromProject(
    { status: 'pending', publishedAt: null },
    { status: 'PUBLISHED', publishedAt: new Date('2026-11-07T10:00:00Z') },
  );
  assert.equal(r.status, 'done');
  assert.equal(r.publishedAt?.toISOString(), '2026-11-07T10:00:00.000Z');
});

test('deriveTaskStatusFromProject: 关联项目已归档 → 任务置 done', () => {
  const r = deriveTaskStatusFromProject(
    { status: 'in_progress', publishedAt: null },
    { status: 'ARCHIVED', publishedAt: null },
  );
  assert.equal(r.status, 'done');
  assert.ok(r.publishedAt instanceof Date);
});

test('deriveTaskStatusFromProject: 项目未发布 → 保留人工状态，不降级', () => {
  const r = deriveTaskStatusFromProject(
    { status: 'in_progress', publishedAt: null },
    { status: 'CREATING', publishedAt: null },
  );
  assert.equal(r.status, 'in_progress');
  assert.equal(r.publishedAt, null);
});

test('deriveTaskStatusFromProject: 已跳过任务不被项目发布覆盖', () => {
  const r = deriveTaskStatusFromProject(
    { status: 'skipped', publishedAt: null },
    { status: 'PUBLISHED', publishedAt: new Date('2026-11-07T10:00:00Z') },
  );
  assert.equal(r.status, 'skipped');
  assert.equal(r.publishedAt, null);
});

test('deriveTaskStatusFromProject: 未关联项目 → 保持原状', () => {
  const r = deriveTaskStatusFromProject(
    { status: 'pending', publishedAt: null },
    null,
  );
  assert.equal(r.status, 'pending');
  assert.equal(r.publishedAt, null);
});

test('computePlanProgress: 空计划 → 0 完成率', () => {
  const p = computePlanProgress([]);
  assert.equal(p.total, 0);
  assert.equal(p.done, 0);
  assert.equal(p.linked, 0);
  assert.equal(p.completionRate, 0);
});

test('computePlanProgress: 统计各状态 / 完成率 / 关联数', () => {
  const p = computePlanProgress([
    { status: 'done', projectId: 'p1' },
    { status: 'done', projectId: null },
    { status: 'in_progress', projectId: 'p2' },
    { status: 'pending', projectId: null },
    { status: 'skipped', projectId: 'p3' },
  ]);
  assert.equal(p.total, 5);
  assert.equal(p.done, 2);
  assert.equal(p.linked, 3);
  assert.equal(p.completionRate, 40);
  assert.equal(p.byStatus.done, 2);
  assert.equal(p.byStatus.in_progress, 1);
  assert.equal(p.byStatus.pending, 1);
  assert.equal(p.byStatus.skipped, 1);
});

// ============ T4.2 图片组排序 ============
test('nextImageSortOrder: 空组 → 0', () => {
  assert.equal(nextImageSortOrder([]), 0);
});

test('nextImageSortOrder: 取最大 + 1', () => {
  assert.equal(nextImageSortOrder([0, 1, 3, 2]), 4);
});

test('reorderImages: 按提交顺序赋 sortOrder，丢弃伪造 id', () => {
  const r = reorderImages(['c', 'a', 'b', 'zzz'], ['a', 'b', 'c']);
  assert.deepEqual(
    r.map((x) => [x.id, x.sortOrder]),
    [['c', 0], ['a', 1], ['b', 2]],
  );
});

test('reorderImages: 未提交的真实 id 追加到末尾（保持原序）', () => {
  const r = reorderImages(['b'], ['a', 'b', 'c']);
  assert.deepEqual(
    r.map((x) => [x.id, x.sortOrder]),
    [['b', 0], ['a', 1], ['c', 2]],
  );
});

test('reorderImages: 重复 id 只计一次', () => {
  const r = reorderImages(['a', 'a', 'b'], ['a', 'b']);
  assert.deepEqual(
    r.map((x) => [x.id, x.sortOrder]),
    [['a', 0], ['b', 1]],
  );
});
