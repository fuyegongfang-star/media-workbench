// T4.6 成本/配额看板 — 纯函数单测（不依赖数据库/网络/密钥）。
// 运行：node --test server/test/cost-dashboard.test.mjs（需先 npm --prefix server run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/dashboard/cost-dashboard.util.js';
const {
  normalizeCost,
  parseCostQuery,
  resolvePeriodRange,
  buildGenerationRunWhere,
  computeTotals,
  aggregateByModel,
  aggregateByStage,
  buildDailySeries,
  computeQuotaAlerts,
  getMonthStart,
} = util;

const mkRow = (o = {}) => ({
  model: o.model ?? 'gpt-4o',
  stage: o.stage ?? 'draft',
  status: o.status ?? 'success',
  cost: o.cost ?? null,
  durationMs: o.durationMs ?? null,
  createdAt: o.createdAt ?? new Date('2026-11-08T10:00:00.000Z'),
  createdById: o.createdById ?? null,
});

// ---------- normalizeCost ----------
test('normalizeCost: 负数/NaN/非数 → 0，正常保留', () => {
  assert.equal(normalizeCost(-1), 0);
  assert.equal(normalizeCost('abc'), 0);
  assert.equal(normalizeCost(undefined), 0);
  assert.equal(normalizeCost(3.456), 3.456);
});

// ---------- parseCostQuery ----------
test('parseCostQuery: 默认 period=30d，非法 period 回退 30d', () => {
  assert.equal(parseCostQuery({}).period, '30d');
  assert.equal(parseCostQuery({ period: 'bogus' }).period, '30d');
  assert.equal(parseCostQuery({ period: '7d' }).period, '7d');
});

test('parseCostQuery: 字符串字段清洗 + 日期合法性', () => {
  const q = parseCostQuery({ model: '  gpt-4o ', stage: 'draft', status: 'success', dateFrom: '2026-11-01', dateTo: 'not-a-date', createdById: 'u1' });
  assert.equal(q.model, 'gpt-4o');
  assert.equal(q.stage, 'draft');
  assert.equal(q.status, 'success');
  assert.equal(q.dateFrom, '2026-11-01');
  assert.equal(q.dateTo, undefined);
  assert.equal(q.createdById, 'u1');
});

test('parseCostQuery: 仅空白字段被忽略', () => {
  const q = parseCostQuery({ model: '   ', stage: '' });
  assert.equal(q.model, undefined);
  assert.equal(q.stage, undefined);
});

// ---------- resolvePeriodRange ----------
test('resolvePeriodRange: 7d/30d 区间长度正确', () => {
  const now = new Date('2026-11-08T12:00:00.000Z');
  const r7 = resolvePeriodRange('7d', now);
  assert.equal(Math.round((now - r7.from) / 864e5), 6);
  assert.equal(r7.to, now);
  const r30 = resolvePeriodRange('30d', now);
  assert.equal(Math.round((now - r30.from) / 864e5), 29);
  const rAll = resolvePeriodRange('all', now);
  assert.equal(rAll.from, null);
  assert.equal(rAll.to, null);
});

test('resolvePeriodRange: thisMonth 回到当月 1 号', () => {
  const now = new Date('2026-11-08T12:00:00.000Z');
  const r = resolvePeriodRange('thisMonth', now);
  assert.equal(r.from.getFullYear(), 2026);
  assert.equal(r.from.getMonth(), 10); // 0-based: 11月=10
  assert.equal(r.from.getDate(), 1);
});

// ---------- buildGenerationRunWhere ----------
test('buildGenerationRunWhere: 仅注入存在的过滤条件', () => {
  const w = buildGenerationRunWhere(parseCostQuery({ model: 'gpt-4o', stage: 'draft', status: 'success', createdById: 'u1' }));
  assert.equal(w.model, 'gpt-4o');
  assert.equal(w.stage, 'draft');
  assert.equal(w.status, 'success');
  assert.equal(w.createdById, 'u1');
  assert.ok(w.createdAt && w.createdAt.gte && w.createdAt.lte, 'period 应产生日期区间');
});

test('buildGenerationRunWhere: dateFrom/dateTo 与 period 取更严格交集', () => {
  // period=30d 给出 29 天前..now；dateFrom 比 period 起点更晚，应取 dateFrom
  const now = new Date('2026-11-08T12:00:00.000Z');
  const q = parseCostQuery({ period: '30d', dateFrom: '2026-11-05', dateTo: '2026-11-06' });
  const w = buildGenerationRunWhere(q);
  assert.equal(w.createdAt.gte.toISOString().slice(0, 10), '2026-11-05');
  assert.equal(w.createdAt.lte.toISOString().slice(0, 10), '2026-11-06');
  void now;
});

test('buildGenerationRunWhere: period=all 时不注入 createdAt', () => {
  const w = buildGenerationRunWhere(parseCostQuery({ period: 'all' }));
  assert.equal(w.createdAt, undefined);
  assert.equal(w.model, undefined);
});

// ---------- computeTotals ----------
test('computeTotals: 状态计数/花费/时长/成功率', () => {
  const rows = [
    mkRow({ status: 'success', cost: 0.1, durationMs: 100 }),
    mkRow({ status: 'success', cost: 0.3, durationMs: 300 }),
    mkRow({ status: 'failed', cost: null, durationMs: null }),
    mkRow({ status: 'cancelled' }),
    mkRow({ status: 'running' }),
    mkRow({ status: 'queued' }),
    mkRow({ status: 'success', cost: 0.1, durationMs: 0 }),
  ];
  const t = computeTotals(rows);
  assert.equal(t.totalRuns, 7);
  assert.equal(t.successRuns, 3);
  assert.equal(t.failedRuns, 1);
  assert.equal(t.cancelledRuns, 1);
  assert.equal(t.runningRuns, 1);
  assert.equal(t.queuedRuns, 1);
  assert.equal(t.totalCost, 0.5);
  assert.equal(t.totalDurationMs, 400);
  assert.equal(t.avgDurationMs, 200); // (100+300+0)/3
  assert.equal(t.successRate, 3 / 7);
});

test('computeTotals: 空数组安全', () => {
  const t = computeTotals([]);
  assert.equal(t.totalRuns, 0);
  assert.equal(t.successRate, 0);
  assert.equal(t.avgDurationMs, 0);
});

// ---------- aggregateByModel ----------
test('aggregateByModel: 按模型聚合并降序', () => {
  const rows = [
    mkRow({ model: 'gpt-4o', status: 'success', cost: 0.4 }),
    mkRow({ model: 'gpt-4o', status: 'failed', cost: null }),
    mkRow({ model: 'claude', status: 'success', cost: 1.2 }),
  ];
  const byModel = aggregateByModel(rows);
  assert.equal(byModel.length, 2);
  assert.equal(byModel[0].model, 'claude');
  assert.equal(byModel[0].totalCost, 1.2);
  assert.equal(byModel[0].runs, 1);
  assert.equal(byModel[1].model, 'gpt-4o');
  assert.equal(byModel[1].success, 1);
  assert.equal(byModel[1].failed, 1);
  assert.equal(byModel[1].totalCost, 0.4);
});

// ---------- aggregateByStage ----------
test('aggregateByStage: 按阶段聚合', () => {
  const rows = [
    mkRow({ stage: 'draft', status: 'success', cost: 0.5 }),
    mkRow({ stage: 'draft', status: 'success', cost: 0.5 }),
    mkRow({ stage: 'polish', status: 'failed', cost: null }),
  ];
  const byStage = aggregateByStage(rows);
  const draft = byStage.find((s) => s.stage === 'draft');
  assert.equal(draft.runs, 2);
  assert.equal(draft.success, 2);
  assert.equal(draft.totalCost, 1.0);
  const polish = byStage.find((s) => s.stage === 'polish');
  assert.equal(polish.failed, 1);
});

// ---------- buildDailySeries ----------
test('buildDailySeries: 按日分桶，缺失日期补 0，区间外忽略', () => {
  const rows = [
    mkRow({ createdAt: new Date('2026-11-01T00:00:00Z'), cost: 1, status: 'success' }),
    mkRow({ createdAt: new Date('2026-11-01T12:00:00Z'), cost: 1, status: 'failed' }),
    mkRow({ createdAt: new Date('2026-11-03T00:00:00Z'), cost: 2, status: 'success' }),
    mkRow({ createdAt: new Date('2026-10-31T00:00:00Z'), cost: 9, status: 'success' }), // 区间外
  ];
  const from = new Date('2026-11-01T00:00:00Z');
  const to = new Date('2026-11-03T00:00:00Z'); // 本地时区下结束日即 11-03
  const daily = buildDailySeries(rows, from, to);
  assert.equal(daily.length, 3);
  assert.equal(daily[0].date, '2026-11-01');
  assert.equal(daily[0].runs, 2);
  assert.equal(daily[0].success, 1);
  assert.equal(daily[0].failed, 1);
  assert.equal(daily[0].totalCost, 2);
  assert.equal(daily[1].date, '2026-11-02');
  assert.equal(daily[1].runs, 0); // 缺失日补 0
  assert.equal(daily[2].date, '2026-11-03');
  assert.equal(daily[2].totalCost, 2);
});

test('buildDailySeries: from/to 为 null 时按数据最早日回退', () => {
  const rows = [mkRow({ createdAt: new Date('2026-11-05T00:00:00Z'), cost: 1 })];
  const daily = buildDailySeries(rows, null, null, new Date('2026-11-05T00:00:00Z'));
  assert.ok(daily.length >= 1);
  assert.equal(daily[daily.length - 1].date, '2026-11-05');
});

// ---------- computeQuotaAlerts ----------
test('computeQuotaAlerts: 比率与状态判定', () => {
  const budgets = [
    { provider: 'openai', model: 'gpt-4o', monthlyBudget: 10 },
    { provider: 'anthropic', model: 'claude', monthlyBudget: 5 },
    { provider: 'openai', model: 'no-budget-ref', monthlyBudget: 0 }, // 0 预算忽略
  ];
  const monthlyRuns = [
    mkRow({ model: 'gpt-4o', cost: 9 }), // 0.9 → warning
    mkRow({ model: 'gpt-4o', cost: 1 }), // 累计 10 → ratio 1.0 → exceeded
    mkRow({ model: 'claude', cost: 2 }), // 0.4 → ok
    mkRow({ model: 'unknown-model', cost: 3 }), // 无配置
  ];
  const { alerts, summary } = computeQuotaAlerts(monthlyRuns, budgets);
  assert.equal(alerts.length, 2); // 仅 budget>0 的两条
  const gpt = alerts.find((a) => a.model === 'gpt-4o');
  assert.equal(gpt.spent, 10);
  assert.equal(gpt.ratio, 1);
  assert.equal(gpt.status, 'exceeded');
  const claude = alerts.find((a) => a.model === 'claude');
  assert.equal(claude.ratio, 0.4);
  assert.equal(claude.status, 'ok');
  assert.equal(summary.totalBudget, 15);
  assert.equal(summary.totalSpent, 12);
  assert.equal(summary.anyExceeded, true);
  assert.equal(summary.anyWarning, false);
  assert.deepEqual(summary.unconfiguredModels, ['unknown-model']);
});

test('computeQuotaAlerts: 预算 0.8-1.0 之间标记 warning', () => {
  const budgets = [{ provider: 'p', model: 'm', monthlyBudget: 10 }];
  const runs = [mkRow({ model: 'm', cost: 8.5 })];
  const { alerts } = computeQuotaAlerts(runs, budgets);
  assert.equal(alerts[0].ratio, 0.85);
  assert.equal(alerts[0].status, 'warning');
});

test('computeQuotaAlerts: 无预算配置返回空告警', () => {
  const { alerts, summary } = computeQuotaAlerts([mkRow({ model: 'x', cost: 1 })], []);
  assert.equal(alerts.length, 0);
  assert.equal(summary.totalBudget, 0);
});

// ---------- getMonthStart ----------
test('getMonthStart: 回到当月 1 号 00:00', () => {
  const ms = getMonthStart(new Date('2026-11-08T15:30:00'));
  assert.equal(ms.getDate(), 1);
  assert.equal(ms.getHours(), 0);
  assert.equal(ms.getMinutes(), 0);
});
