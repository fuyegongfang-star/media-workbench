// T5.2 单一清单源 + 平台模板预留位 纯函数单测（需先 npm run build 产出 dist）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import src from '../dist/modules/content/project/review-checklist.source.js';
const {
  COMPLIANCE_CHECKLIST_ID,
  REVIEW_CHECKLIST_STATIC_LABELS,
  buildReviewChecklist,
  stampComplianceItem,
  syncComplianceChecklistItem,
  normalizeReviewChecklistInput,
} = src;

import { SUPPORTED_PLATFORMS, DEFAULT_PLATFORM, resolvePlatform, PLATFORM_LABELS } from '../dist/modules/content/platforms.js';
import util from '../dist/modules/content/project/content-project.util.js';
const { shapeProjectContext, defaultReviewChecklist } = util;

test('buildReviewChecklist: 静态项 + 合规派生项单一清单源', () => {
  const list = buildReviewChecklist('1');
  // 静态项数量 + 1 条合规项
  assert.equal(list.length, REVIEW_CHECKLIST_STATIC_LABELS.length + 1);
  const compliance = list[list.length - 1];
  assert.equal(compliance.id, COMPLIANCE_CHECKLIST_ID);
  assert.equal(compliance.source, 'compliance');
  assert.equal(compliance.checked, false);
  assert.match(compliance.label, /词表 v1/);
  // 静态项带 source=static
  assert.equal(list[0].source, 'static');
});

test('defaultReviewChecklist 委托单一清单源', () => {
  const list = defaultReviewChecklist();
  const compliance = list.find((it) => it.id === COMPLIANCE_CHECKLIST_ID);
  assert.ok(compliance, '默认清单应包含合规派生项');
  assert.equal(compliance.source, 'compliance');
});

test('stampComplianceItem: 已存在合规项则刷新 label/版本，保留 checked 与 note', () => {
  const input = [
    { id: 'r1', label: '旧标题合规', checked: true, note: 'x' },
    { id: COMPLIANCE_CHECKLIST_ID, label: '旧合规项 v0', checked: true, source: 'compliance', note: 'keep' },
  ];
  const out = stampComplianceItem(input, '2');
  const c = out.find((it) => it.id === COMPLIANCE_CHECKLIST_ID);
  assert.equal(c.label, '合规预审通过（无阻断级极限词/违禁词，词表 v2）');
  assert.equal(c.checked, true, '保留已勾选状态');
  assert.equal(c.note, 'keep', '保留合规项自身的 note');
  assert.equal(out.length, input.length, '不增减项');
});

test('stampComplianceItem: 无合规项则追加', () => {
  const input = [{ id: 'r1', label: '仅静态项', checked: false }];
  const out = stampComplianceItem(input, '3');
  assert.equal(out.length, 2);
  const c = out[out.length - 1];
  assert.equal(c.id, COMPLIANCE_CHECKLIST_ID);
  assert.match(c.label, /词表 v3/);
});

test('syncComplianceChecklistItem: 预审通过 → 合规项 checked=true', () => {
  const input = [{ id: 'r1', label: '静态', checked: false }];
  const out = syncComplianceChecklistItem(input, true, '1');
  const c = out.find((it) => it.id === COMPLIANCE_CHECKLIST_ID);
  assert.equal(c.checked, true);
});

test('syncComplianceChecklistItem: 预审未通过 → 合规项保持 unchecked（等待修改/覆盖）', () => {
  const input = [{ id: 'r1', label: '静态', checked: false }];
  const out = syncComplianceChecklistItem(input, false, '1');
  const c = out.find((it) => it.id === COMPLIANCE_CHECKLIST_ID);
  assert.equal(c.checked, false);
});

test('normalizeReviewChecklistInput: 透传 source，缺省 static', () => {
  const r = normalizeReviewChecklistInput([
    { id: 'r1', label: '静态项', checked: true },
    { id: 'compliance', label: '合规', checked: false, source: 'compliance' },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.items[0].source, 'static');
  assert.equal(r.items[1].source, 'compliance');
});

test('normalizeReviewChecklistInput: 空 label / 非数组 拒绝', () => {
  assert.equal(normalizeReviewChecklistInput('nope').ok, false);
  assert.equal(normalizeReviewChecklistInput([{ label: '' }]).ok, false);
});

test('平台模板预留位: 默认 wechat，非法回退默认，合法解析', () => {
  assert.equal(DEFAULT_PLATFORM, 'wechat');
  assert.ok(SUPPORTED_PLATFORMS.includes('xiaohongshu'));
  assert.equal(resolvePlatform('douyin'), 'douyin');
  assert.equal(resolvePlatform('unknown-platform'), 'wechat');
  assert.equal(resolvePlatform(null), 'wechat');
  assert.ok(PLATFORM_LABELS.douyin, '应含平台中文名');
});

test('shapeProjectContext: 含 fieldOrigins 来源标记（定格/实时）', () => {
  const c = shapeProjectContext({
    account: { id: 'a', name: '账号A' },
    strategy: { id: 's', version: 2 },
    promptTemplate: { id: 'pt', version: 3 },
    snapshot: {
      title: '标题C',
      topic: { title: '选题X', audience: '青年', angle: '干货', tags: ['a'] },
      strategySummary: 'summary',
      analysisSummary: 'analysis',
    },
  });
  assert.equal(c.fieldOrigins.account, 'live');
  assert.equal(c.fieldOrigins.title, 'snapshot');
  assert.equal(c.fieldOrigins.topic, 'snapshot');
  assert.equal(c.fieldOrigins.strategyVersion, 'live');
  assert.equal(c.fieldOrigins.strategySummary, 'snapshot');
  assert.equal(c.fieldOrigins.promptTemplate, 'live');
  assert.equal(c.fieldOrigins.analysisSummary, 'snapshot');
});
