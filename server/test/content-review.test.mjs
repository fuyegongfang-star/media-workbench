// T3.6 审核状态机纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/content-review.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/content/project/content-project.util.js';
const {
  reviewCanTransition,
  reviewTransition,
  reviewChecklistComplete,
  defaultReviewChecklist,
  validateReviewChecklistInput,
} = util;

test('reviewCanTransition: CREATING 标记待审核合法 → PENDING_REVIEW', () => {
  const r = reviewCanTransition('CREATING', 'submit');
  assert.equal(r.ok, true);
  assert.equal(r.to, 'PENDING_REVIEW');
});

test('reviewCanTransition: CREATING 直接通过非法（来源不含 CREATING）', () => {
  const r = reviewCanTransition('CREATING', 'approve');
  assert.equal(r.ok, false);
  assert.match(r.error, /合法来源/);
});

test('reviewCanTransition: PENDING_REVIEW 不能标记待审核', () => {
  const r = reviewCanTransition('PENDING_REVIEW', 'submit');
  assert.equal(r.ok, false);
});

test('reviewCanTransition: 未知动作报错', () => {
  const r = reviewCanTransition('CREATING', 'nope');
  assert.equal(r.ok, false);
  assert.match(r.error, /未知审核动作/);
});

test('reviewTransition: 退回修改必须填意见', () => {
  const r = reviewTransition('PENDING_REVIEW', 'send_back', { comment: '   ' });
  assert.equal(r.ok, false);
  assert.match(r.error, /退回意见/);
});

test('reviewTransition: 退回修改填意见 → NEEDS_REVISION', () => {
  const r = reviewTransition('PENDING_REVIEW', 'send_back', { comment: '标题有极限词' });
  assert.equal(r.ok, true);
  assert.equal(r.to, 'NEEDS_REVISION');
});

test('reviewTransition: 通过需清单全勾选（空清单/部分勾选均拒绝）', () => {
  assert.equal(reviewTransition('PENDING_REVIEW', 'approve', { checklist: [] }).ok, false);
  assert.equal(
    reviewTransition('PENDING_REVIEW', 'approve', {
      checklist: [{ id: 'r1', label: 'a', checked: true }, { id: 'r2', label: 'b', checked: false }],
    }).ok,
    false,
  );
  const ok = reviewTransition('PENDING_REVIEW', 'approve', {
    checklist: [{ id: 'r1', label: 'a', checked: true }, { id: 'r2', label: 'b', checked: true }],
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.to, 'APPROVED');
});

test('reviewTransition: NEEDS_REVISION 可重新提交 → PENDING_REVIEW', () => {
  const r = reviewTransition('NEEDS_REVISION', 'submit');
  assert.equal(r.ok, true);
  assert.equal(r.to, 'PENDING_REVIEW');
});

test('reviewChecklistComplete: 空/部分/全勾选', () => {
  assert.equal(reviewChecklistComplete(null), false);
  assert.equal(reviewChecklistComplete([]), false);
  assert.equal(reviewChecklistComplete([{ id: 'r1', label: 'a', checked: false }]), false);
  assert.equal(
    reviewChecklistComplete([
      { id: 'r1', label: 'a', checked: true },
      { id: 'r2', label: 'b', checked: false },
    ]),
    false,
  );
  assert.equal(
    reviewChecklistComplete([
      { id: 'r1', label: 'a', checked: true },
      { id: 'r2', label: 'b', checked: true },
    ]),
    true,
  );
});

test('defaultReviewChecklist: 6 项且均未勾选', () => {
  const list = defaultReviewChecklist();
  assert.equal(list.length, 6);
  assert.ok(list.every((it) => it.checked === false && it.label.length > 0));
  // id 唯一
  assert.equal(new Set(list.map((it) => it.id)).size, list.length);
});

test('validateReviewChecklistInput: 正常数组 / 非法输入', () => {
  const ok = validateReviewChecklistInput([{ id: 'x', label: '标题合规', checked: true, note: '已核对' }]);
  assert.equal(ok.ok, true);
  assert.equal(ok.items.length, 1);
  assert.equal(ok.items[0].id, 'x');
  assert.equal(ok.items[0].note, '已核对');

  assert.equal(validateReviewChecklistInput('not-array').ok, false);
  assert.equal(validateReviewChecklistInput([{ label: '' }]).ok, false); // label 空
  assert.equal(validateReviewChecklistInput([123]).ok, false); // 非对象
  // label 超长截断到 200
  const long = validateReviewChecklistInput([{ label: 'a'.repeat(500), checked: false }]);
  assert.equal(long.ok, true);
  assert.equal(long.items[0].label.length, 200);
  // 缺 id 时回退默认
  const noId = validateReviewChecklistInput([{ label: 'b', checked: false }]);
  assert.equal(noId.ok, true);
  assert.equal(noId.items[0].id, 'r1');
});
