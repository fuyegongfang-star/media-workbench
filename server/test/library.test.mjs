// T4.3 素材库纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/library.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/library/library.util.js';
const {
  normalizeTags,
  buildMaterialWhere,
  clampPage,
  parseMaterialQuery,
  materialOrderBy,
  aggregateTagCounts,
  shapeMaterial,
} = util;

// ---------- normalizeTags ----------
test('normalizeTags: 逗号/空格/分号/换行混合分隔 + 裁剪空白', () => {
  assert.deepEqual(normalizeTags(' 爆款 , 方法 ；案例, 方法 '), ['爆款', '方法', '案例']);
});

test('normalizeTags: 大小写不敏感去重（保留首次出现原文）', () => {
  assert.deepEqual(normalizeTags(['SEO', 'seo', 'Seo']), ['SEO']);
});

test('normalizeTags: 数组输入 / 非字符串过滤 / 空输入返回 []', () => {
  assert.deepEqual(normalizeTags(['a', 1, null, 'b']), ['a', 'b']);
  assert.deepEqual(normalizeTags(undefined), []);
  assert.deepEqual(normalizeTags(42), []);
});

test('normalizeTags: 单标签超长截断至 50，总量上限 30', () => {
  const long = 'x'.repeat(60);
  const r = normalizeTags([long]);
  assert.equal(r[0].length, 50);
  const many = Array.from({ length: 50 }, (_, i) => `t${i}`);
  assert.equal(normalizeTags(many).length, 30);
});

// ---------- buildMaterialWhere ----------
test('buildMaterialWhere: 关键词 → OR（标题/正文/作者/来源，大小写不敏感）', () => {
  const w = buildMaterialWhere({ q: 'AI' });
  assert.equal(Array.isArray(w.OR), true);
  assert.equal(w.OR.length, 4);
  assert.deepEqual(w.OR[0], { title: { contains: 'AI', mode: 'insensitive' } });
  assert.ok(!('deletedAt' in w)); // 软删过滤由 T1.3 扩展注入，这里不掺入
});

test('buildMaterialWhere: 账号 + 平台 → referenceAccount 关系过滤', () => {
  const w = buildMaterialWhere({ referenceAccountId: 'acc1', platform: ['wechat'] });
  assert.deepEqual(w.referenceAccount, { id: 'acc1', platform: { in: ['wechat'] } });
});

test('buildMaterialWhere: 标签 hasSome / 作者 sourceUrl 包含', () => {
  const w = buildMaterialWhere({ tags: ['a', 'b'], author: '张三', sourceUrl: 'example.com' });
  assert.deepEqual(w.tags, { hasSome: ['a', 'b'] });
  assert.deepEqual(w.author, { contains: '张三', mode: 'insensitive' });
  assert.deepEqual(w.sourceUrl, { contains: 'example.com', mode: 'insensitive' });
});

test('buildMaterialWhere: 收藏/归档布尔 + hasAnalysis some/none', () => {
  assert.deepEqual(buildMaterialWhere({ favorite: true }).favorite, true);
  assert.deepEqual(buildMaterialWhere({ archived: false }).archived, false);
  assert.deepEqual(buildMaterialWhere({ hasAnalysis: true }).analyses, { some: {} });
  assert.deepEqual(buildMaterialWhere({ hasAnalysis: false }).analyses, { none: {} });
});

test('buildMaterialWhere: 日期范围 gte/lte（非法日期忽略）', () => {
  const w = buildMaterialWhere({ dateFrom: '2026-01-01T00:00:00Z', dateTo: '2026-12-31T00:00:00Z' });
  assert.ok(w.importedAt.gte instanceof Date);
  assert.ok(w.importedAt.lte instanceof Date);
  const w2 = buildMaterialWhere({ dateFrom: 'not-a-date' });
  assert.ok(!('importedAt' in w2));
});

test('buildMaterialWhere: 空查询 → 空 where', () => {
  assert.deepEqual(buildMaterialWhere({}), {});
});

// ---------- clampPage ----------
test('clampPage: 默认值与边界夹紧', () => {
  assert.deepEqual(clampPage(undefined, undefined), { skip: 0, take: 20, page: 1, pageSize: 20 });
  assert.deepEqual(clampPage(3, 10), { skip: 20, take: 10, page: 3, pageSize: 10 });
  assert.deepEqual(clampPage(0, 0), { skip: 0, take: 20, page: 1, pageSize: 20 });
  assert.deepEqual(clampPage(2, 9999), { skip: 100, take: 100, page: 2, pageSize: 100 });
});

// ---------- parseMaterialQuery ----------
test('parseMaterialQuery: 字符串 DTO 解析为强类型', () => {
  const q = parseMaterialQuery({
    q: 'AI',
    platform: 'wechat,xiaohongshu',
    tags: '爆款, 方法',
    favorite: 'true',
    archived: 'false',
    hasAnalysis: 'true',
    dateFrom: '2026-01-01',
    sort: 'imported',
  });
  assert.equal(q.q, 'AI');
  assert.deepEqual(q.platform, ['wechat', 'xiaohongshu']);
  assert.deepEqual(q.tags, ['爆款', '方法']);
  assert.equal(q.favorite, true);
  assert.equal(q.archived, false);
  assert.equal(q.hasAnalysis, true);
  assert.equal(q.sort, 'imported');
});

test('parseMaterialQuery: 未知 sort 被忽略，空 DTO → 空对象', () => {
  assert.deepEqual(parseMaterialQuery({ sort: 'banana' }), {});
  assert.deepEqual(parseMaterialQuery({}), {});
});

// ---------- materialOrderBy ----------
test('materialOrderBy: 排序映射', () => {
  assert.deepEqual(materialOrderBy('newest'), { createdAt: 'desc' });
  assert.deepEqual(materialOrderBy('oldest'), { importedAt: 'asc' });
  assert.deepEqual(materialOrderBy('collected'), { collectedAt: 'desc' });
  assert.deepEqual(materialOrderBy(), { createdAt: 'desc' });
});

// ---------- aggregateTagCounts ----------
test('aggregateTagCounts: 计数 + 频次降序、同频按字母', () => {
  const rows = [{ tags: ['a', 'b'] }, { tags: ['a'] }, { tags: ['b', 'a'] }, { tags: ['c'] }, { tags: null }];
  const r = aggregateTagCounts(rows);
  assert.deepEqual(r, [
    { tag: 'a', count: 3 },
    { tag: 'b', count: 2 },
    { tag: 'c', count: 1 },
  ]);
});

// ---------- shapeMaterial ----------
test('shapeMaterial: 日期转 ISO、引用账号投影、计数聚合、副本标记', () => {
  const d = new Date('2026-05-01T08:00:00Z');
  const m = {
    id: 'm1',
    referenceAccountId: 'acc1',
    referenceAccount: { name: '竞品A', platform: 'wechat' },
    title: '标题',
    author: null,
    sourceUrl: null,
    tags: ['x'],
    favorite: true,
    archived: false,
    duplicateOfId: 'm0',
    fingerprint: 'fp',
    importedAt: d,
    collectedAt: null,
    createdAt: d,
    updatedAt: d,
    _count: { analyses: 2 },
  };
  const s = shapeMaterial(m);
  assert.equal(s.referenceAccountName, '竞品A');
  assert.equal(s.platform, 'wechat');
  assert.equal(s.favorite, true);
  assert.equal(s.hasAnalysis, true);
  assert.equal(s.isDuplicate, true);
  assert.equal(s.importedAt, d.toISOString());
});

test('shapeMaterial: 无 _count 时 hasAnalysis 取 analyses 数组长度', () => {
  const s = shapeMaterial({ id: 'm', referenceAccountId: 'a', title: 't', tags: [], analyses: [{ id: 'x' }] });
  assert.equal(s.hasAnalysis, true);
});
