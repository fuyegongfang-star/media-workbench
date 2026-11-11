// T4.4 内容日历纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/calendar.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/calendar/calendar.util.js';
const {
  parseLocalDate,
  dateToKey,
  addDays,
  defaultCalendarRange,
  normalizeCalendarQuery,
  validateRescheduleDate,
  groupByDate,
  sortCalendarItems,
  makeCalendarItem,
  KIND_LABELS,
  KIND_ROUTES,
} = util;

// ---------- parseLocalDate ----------
test('parseLocalDate: 合法 YYYY-MM-DD 解析为本地午夜', () => {
  const d = parseLocalDate('2026-03-15');
  assert.ok(d instanceof Date);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 15);
  assert.equal(d.getHours(), 0);
});

test('parseLocalDate: 非法格式返回 null', () => {
  assert.equal(parseLocalDate('2026/03/15'), null);
  assert.equal(parseLocalDate('2026-3-1'), null);
  assert.equal(parseLocalDate('not-a-date'), null);
  assert.equal(parseLocalDate('2026-13-01'), null);
  assert.equal(parseLocalDate(12345), null);
});

// ---------- dateToKey ----------
test('dateToKey: Date → 本地 YYYY-MM-DD', () => {
  assert.equal(dateToKey(new Date(2026, 2, 15, 23, 59)), '2026-03-15');
});

test('dateToKey: 空/非法返回空串', () => {
  assert.equal(dateToKey(null), '');
  assert.equal(dateToKey('garbage'), '');
});

// ---------- addDays ----------
test('addDays: 正负偏移', () => {
  const d = parseLocalDate('2026-03-15');
  assert.equal(dateToKey(addDays(d, 1)), '2026-03-16');
  assert.equal(dateToKey(addDays(d, -15)), '2026-02-28');
  assert.equal(dateToKey(addDays(d, 60)), '2026-05-14');
});

// ---------- defaultCalendarRange ----------
test('defaultCalendarRange: 返回 from<to 且跨度 60 天（基于今天）', () => {
  const { from, to } = defaultCalendarRange(new Date(2026, 10, 8));
  assert.equal(from, '2026-10-24'); // 今天往前 15 天
  assert.equal(to, '2026-12-23'); // 再 +60 天
});

// ---------- normalizeCalendarQuery ----------
test('normalizeCalendarQuery: 显式范围归一到 [from, to+1天)', () => {
  const { from, to } = normalizeCalendarQuery({ from: '2026-03-01', to: '2026-03-31' });
  assert.equal(dateToKey(from), '2026-03-01');
  assert.equal(dateToKey(to), '2026-04-01'); // 闭区间：次日
});

test('normalizeCalendarQuery: 缺省回退默认窗口（[from, to) 半开，to = 显示末日+1）', () => {
  const { from, to } = normalizeCalendarQuery({});
  const fromD = parseLocalDate(dateToKey(from));
  assert.ok(fromD);
  // 默认跨度 60 天：显示末日 = from+60，闭区间 to = 显示末日+1 = from+61
  assert.equal(dateToKey(to), dateToKey(addDays(fromD, 61)));
  assert.ok(from < to);
});

test('normalizeCalendarQuery: 非法输入回退默认', () => {
  const { from, to } = normalizeCalendarQuery({ from: 'bad', to: 'also-bad' });
  assert.ok(from < to);
});

// ---------- validateRescheduleDate ----------
test('validateRescheduleDate: 合法返回 ok+Date', () => {
  const r = validateRescheduleDate('2026-04-10');
  assert.equal(r.ok, true);
  assert.equal(dateToKey(r.value), '2026-04-10');
});

test('validateRescheduleDate: 非法返回 ok=false+error', () => {
  const r = validateRescheduleDate('2026/04/10');
  assert.equal(r.ok, false);
  assert.match(r.error, /YYYY-MM-DD/);
});

// ---------- makeCalendarItem / KIND 映射 ----------
test('makeCalendarItem: 四类 kind 的 labels 与 routes 正确', () => {
  for (const kind of ['topic', 'title', 'content', 'launch']) {
    const it = makeCalendarItem(kind, 'x', '标题', 'active', '2026-03-15', '账号A');
    assert.equal(it.kind, kind);
    assert.equal(it.date, '2026-03-15');
    assert.equal(it.accountName, '账号A');
    assert.equal(it.link, KIND_ROUTES[kind]);
    assert.equal(KIND_LABELS[kind].length > 0, true);
  }
});

test('makeCalendarItem: 非法锚点日期归为空串', () => {
  const it = makeCalendarItem('topic', 'x', 't', null, 'nonsense', null);
  assert.equal(it.date, '');
});

// ---------- groupByDate ----------
test('groupByDate: 按本地日分组 + 组内排序（kind 顺序→title）', () => {
  const items = [
    makeCalendarItem('content', 'c1', 'B', 'APPROVED', '2026-03-15', null),
    makeCalendarItem('topic', 't1', 'A', 'active', '2026-03-15', null),
    makeCalendarItem('launch', 'l1', 'C', 'pending', '2026-03-16', null),
  ];
  const g = groupByDate(items);
  assert.deepEqual(Object.keys(g).sort(), ['2026-03-15', '2026-03-16']);
  // 同日内：topic 先于 content
  assert.equal(g['2026-03-15'][0].kind, 'topic');
  assert.equal(g['2026-03-15'][1].kind, 'content');
});

test('groupByDate: 无日期项归入 unscheduled', () => {
  const g = groupByDate([makeCalendarItem('topic', 't', 'A', null, null, null)]);
  assert.equal(Object.keys(g)[0], 'unscheduled');
});

// ---------- sortCalendarItems ----------
test('sortCalendarItems: 日期升序，同日按 kind 顺序', () => {
  const items = [
    makeCalendarItem('launch', 'l', 'C', 'pending', '2026-03-15', null),
    makeCalendarItem('topic', 't', 'A', 'active', '2026-03-15', null),
    makeCalendarItem('topic', 't2', 'A2', 'active', '2026-03-14', null),
  ];
  const sorted = sortCalendarItems(items);
  assert.deepEqual(sorted.map((i) => `${i.date}:${i.kind}`), [
    '2026-03-14:topic',
    '2026-03-15:topic',
    '2026-03-15:launch',
  ]);
});
