// T3.10 发布后效果数据回收 — 纯函数单测（不依赖数据库/网络/微信）。
// 运行：node --test server/test/metrics.test.mjs（需先 npm --prefix server run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/metrics/metrics.util.js';
const {
  normalizeMetricNumber,
  parseMetricQuery,
  buildMetricWhere,
  clampMetricPage,
  metricOrderBy,
  shapeMetric,
  aggregateMetricRows,
  parseWechatUserRead,
  parseWechatArticleRead,
  parseWechatUserSummary,
} = util;

// ---------- normalizeMetricNumber ----------
test('normalizeMetricNumber: 负数/NaN/非数 → 0，小数截断', () => {
  assert.equal(normalizeMetricNumber(-5), 0);
  assert.equal(normalizeMetricNumber('abc'), 0);
  assert.equal(normalizeMetricNumber(undefined), 0);
  assert.equal(normalizeMetricNumber(12.9), 12);
  assert.equal(normalizeMetricNumber('42'), 42);
});

// ---------- parseMetricQuery ----------
test('parseMetricQuery: 字符串 DTO → 强类型，非法忽略', () => {
  const q = parseMetricQuery({
    ownedAccountId: 'acc1',
    topicId: 't1',
    source: 'manual',
    dateFrom: '2026-01-01',
    dateTo: '2026-12-31',
    page: '2',
    pageSize: '50',
    bogus: 'x',
  });
  assert.equal(q.ownedAccountId, 'acc1');
  assert.equal(q.topicId, 't1');
  assert.equal(q.source, 'manual');
  assert.equal(q.dateFrom, '2026-01-01');
  assert.equal(q.page, 2);
  assert.equal(q.pageSize, 50);
  assert.equal(q.bogus, undefined);
});

test('parseMetricQuery: 非法日期忽略，空对象返回空', () => {
  assert.equal(parseMetricQuery({ dateFrom: 'nope' }).dateFrom, undefined);
  assert.deepEqual(parseMetricQuery({}), {});
});

// ---------- buildMetricWhere ----------
test('buildMetricWhere: 账号/选题/标题 → contentProject 关系过滤', () => {
  const w = buildMetricWhere({ ownedAccountId: 'a', topicId: 't', titleId: 'ti' });
  assert.deepEqual(w.contentProject, {
    ownedAccountId: 'a',
    topicId: 't',
    selectedTitleId: 'ti',
  });
});

test('buildMetricWhere: source + 日期范围（合法）→ 参数化 where', () => {
  const w = buildMetricWhere({ source: 'manual', dateFrom: '2026-01-01', dateTo: '2026-12-31' });
  assert.equal(w.source, 'manual');
  assert.ok(w.metricDate.gte instanceof Date);
  assert.ok(w.metricDate.lte instanceof Date);
});

test('buildMetricWhere: 空查询 → 空 where', () => {
  assert.deepEqual(buildMetricWhere({}), {});
});

// ---------- clampMetricPage ----------
test('clampMetricPage: 默认与边界夹紧', () => {
  assert.deepEqual(clampMetricPage(undefined, undefined), { skip: 0, take: 20, page: 1, pageSize: 20 });
  assert.deepEqual(clampMetricPage(3, 10), { skip: 20, take: 10, page: 3, pageSize: 10 });
  assert.deepEqual(clampMetricPage(0, 0), { skip: 0, take: 20, page: 1, pageSize: 20 });
  assert.deepEqual(clampMetricPage(2, 9999), { skip: 100, take: 100, page: 2, pageSize: 100 });
});

// ---------- metricOrderBy ----------
test('metricOrderBy: 默认倒序，oldest 升序', () => {
  assert.deepEqual(metricOrderBy(), { metricDate: 'desc' });
  assert.deepEqual(metricOrderBy('oldest'), { metricDate: 'asc' });
});

// ---------- shapeMetric ----------
test('shapeMetric: 日期转 ISO 当天 + 数字归一', () => {
  const m = shapeMetric({
    id: 'm1',
    contentProjectId: 'p1',
    externalArticleId: 'wx1',
    metricDate: new Date('2026-05-01T08:00:00Z'),
    readCount: 10.5,
    shareCount: -3,
    favoriteCount: 4,
    likeCount: 5,
    followerIncrease: 6,
    unfollowCount: 7,
    source: 'manual',
    fetchedAt: new Date('2026-05-02T00:00:00Z'),
  });
  assert.equal(m.metricDate, '2026-05-01');
  assert.equal(m.readCount, 10);
  assert.equal(m.shareCount, 0);
  assert.equal(m.fetchedAt.startsWith('2026-05-02'), true);
});

// ---------- aggregateMetricRows ----------
test('aggregateMetricRows: 按 key 求和 + 样本数 + 排序', () => {
  const rows = [
    { key: 'a', label: '选题A', readCount: 10, shareCount: 1, favoriteCount: 1, likeCount: 1, followerIncrease: 0, unfollowCount: 0 },
    { key: 'b', label: '选题B', readCount: 5, shareCount: 0, favoriteCount: 0, likeCount: 0, followerIncrease: 0, unfollowCount: 0 },
    { key: 'a', label: '选题A', readCount: 20, shareCount: 2, favoriteCount: 2, likeCount: 2, followerIncrease: 0, unfollowCount: 0 },
  ];
  const agg = aggregateMetricRows(rows);
  assert.equal(agg.length, 2);
  const a = agg.find((x) => x.key === 'a');
  assert.equal(a.readCount, 30);
  assert.equal(a.count, 2);
  assert.equal(agg[0].key, 'a'); // 阅读最高在前
});

test('aggregateMetricRows: 空输入返回 []，未知 key 聚合', () => {
  assert.deepEqual(aggregateMetricRows([]), []);
  const agg = aggregateMetricRows([
    { key: 'unknown', label: '', readCount: 1, shareCount: 0, favoriteCount: 0, likeCount: 0, followerIncrease: 0, unfollowCount: 0 },
  ]);
  assert.equal(agg[0].label, 'unknown');
});

// ---------- parseWechatUserRead ----------
test('parseWechatUserRead: 解析 ref_date + 阅读/分享/收藏', () => {
  const json = {
    list: [
      { ref_date: '2026-05-01', int_page_read_user: 100, share_user: 10, add_to_fav_user: 5 },
      { ref_date: '2026-05-02', int_page_read_count: 200, share_count: 20, add_to_fav_count: 8 },
    ],
  };
  const seeds = parseWechatUserRead(json);
  assert.equal(seeds.length, 2);
  assert.equal(seeds[0].readCount, 100);
  assert.equal(seeds[0].shareCount, 10);
  assert.equal(seeds[0].favoriteCount, 5);
  assert.equal(seeds[0].source, 'wechat_user_read');
  assert.equal(seeds[0].metricDate.toISOString().slice(0, 10), '2026-05-01');
  assert.equal(seeds[1].readCount, 200);
});

// ---------- parseWechatArticleRead ----------
test('parseWechatArticleRead: 按 msgid 拆分 + 标识', () => {
  const json = {
    list: [
      { ref_date: '2026-05-01', msgid: 'wxmsg_123_1', int_page_read_user: 50, share_user: 3, add_to_fav_user: 2 },
      { ref_date: '2026-05-01', msgid: 'wxmsg_456_1', int_page_read_user: 70, share_user: 4 },
    ],
  };
  const seeds = parseWechatArticleRead(json);
  assert.equal(seeds.length, 2);
  assert.equal(seeds[0].externalArticleId, 'wxmsg_123_1');
  assert.equal(seeds[0].readCount, 50);
  assert.equal(seeds[0].source, 'wechat_article_read');
  assert.equal(seeds[1].externalArticleId, 'wxmsg_456_1');
  assert.equal(seeds[1].readCount, 70);
});

// ---------- parseWechatUserSummary ----------
test('parseWechatUserSummary: 涨粉/取关映射', () => {
  const json = {
    list: [{ ref_date: '2026-05-01', new_user: 12, cancel_user: 3, cumulate_user: 500 }],
  };
  const seeds = parseWechatUserSummary(json);
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].followerIncrease, 12);
  assert.equal(seeds[0].unfollowCount, 3);
  assert.equal(seeds[0].readCount, 0);
  assert.equal(seeds[0].source, 'wechat_user_summary');
});

// ---------- 解析健壮性：非法日期 / 空 / 缺字段 ----------
test('解析函数：非法 ref_date / 空 list / 缺字段 → 安全降级', () => {
  assert.equal(parseWechatUserRead({ list: [{ ref_date: 'bad', int_page_read_user: 5 }] })[0].metricDate.getTime(), new Date(0).getTime());
  assert.deepEqual(parseWechatUserRead({}), []);
  assert.deepEqual(parseWechatArticleRead(null), []);
  assert.equal(parseWechatUserSummary({ list: [{}] })[0].followerIncrease, 0);
});
