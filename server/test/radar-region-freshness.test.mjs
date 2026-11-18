// T6.9 选题雷达：地区分栏 + 发布时间时效过滤（纯函数，不依赖 DB/Redis/网络）。
// 运行：node --test server/test/radar-region-freshness.test.mjs（需先 npm run build）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import contract from '../dist/modules/radar/radar.contract.js';
const { SOURCE_REGION, regionOfSource, FRESHNESS_OPTIONS } = contract;
import util from '../dist/modules/radar/radar.util.js';
const { filterByFreshness, sanitizeConfig, sanitizeCustomSources } = util;

// ---------------- 地区映射 ----------------
test('SOURCE_REGION: 内置源国内/海外归类正确', () => {
  assert.equal(SOURCE_REGION.toutiao, 'domestic');
  assert.equal(SOURCE_REGION.bilibili, 'domestic');
  assert.equal(SOURCE_REGION.sogou_wechat, 'domestic');
  assert.equal(SOURCE_REGION.hnrss, 'overseas');
  assert.equal(SOURCE_REGION.x_account, 'overseas');
  assert.equal(SOURCE_REGION.youtube_account, 'overseas');
});

test('regionOfSource: 内置源按映射、未知源按国内', () => {
  assert.equal(regionOfSource('toutiao'), 'domestic');
  assert.equal(regionOfSource('hnrss'), 'overseas');
  assert.equal(regionOfSource('unknown_source'), 'domestic');
});

test('regionOfSource: 自定义源按用户配置，缺省/非法按国内', () => {
  assert.equal(regionOfSource('custom:abc', 'overseas'), 'overseas');
  assert.equal(regionOfSource('custom:abc', 'domestic'), 'domestic');
  assert.equal(regionOfSource('custom:abc', undefined), 'domestic');
});

// ---------------- 时效过滤 ----------------
test('filterByFreshness: days=0 不限，原样返回', () => {
  const items = [{ title: 'a', publishedAt: '2020-01-01T00:00:00Z' }, { title: 'b' }];
  const r = filterByFreshness(items, 0, new Date('2026-11-18T12:00:00Z'));
  assert.equal(r.kept.length, 2);
  assert.equal(r.droppedByTime, 0);
});

test('filterByFreshness: 按窗口剔除过期、保留窗口内', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const items = [
    { title: 'today', publishedAt: '2026-11-18T08:00:00Z' },   // 4 小时前
    { title: 'two-days', publishedAt: '2026-11-16T12:00:00Z' }, // 2 天前
    { title: 'old', publishedAt: '2026-11-01T00:00:00Z' },      // 17 天前
  ];
  const r3 = filterByFreshness(items, 3, now);
  assert.deepEqual(r3.kept.map((x) => x.title), ['today', 'two-days']);
  assert.equal(r3.droppedByTime, 1);
  const r1 = filterByFreshness(items, 1, now);
  assert.deepEqual(r1.kept.map((x) => x.title), ['today']);
  assert.equal(r1.droppedByTime, 2);
});

test('filterByFreshness: 无时间/非法时间一律保留（时间未知不误删）', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const items = [
    { title: 'no-time' },
    { title: 'bad-time', publishedAt: 'not-a-date' },
    { title: 'future', publishedAt: '2026-11-19T00:00:00Z' }, // 未来 12 小时，容差内
  ];
  const r = filterByFreshness(items, 1, now);
  assert.equal(r.kept.length, 3);
  assert.equal(r.droppedByTime, 0);
});

test('filterByFreshness: 超出未来容差的条目剔除', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const items = [{ title: 'far-future', publishedAt: '2026-12-01T00:00:00Z' }];
  const r = filterByFreshness(items, 1, now);
  assert.equal(r.kept.length, 0);
  assert.equal(r.droppedByTime, 1);
});

// ---------------- 配置清洗 ----------------
test('sanitizeConfig: freshnessDays 只接受预设档位', () => {
  assert.equal(sanitizeConfig({ freshnessDays: 7 }).freshnessDays, 7);
  assert.equal(sanitizeConfig({ freshnessDays: 3 }).freshnessDays, 3);
  assert.equal(sanitizeConfig({ freshnessDays: 4 }).freshnessDays, 0); // 非预设档位回落
  assert.equal(sanitizeConfig({ freshnessDays: -1 }).freshnessDays, 0);
  assert.equal(sanitizeConfig({}).freshnessDays, 0); // 缺省默认不限
});

test('FRESHNESS_OPTIONS: 档位固定为 0/1/3/7/15', () => {
  assert.deepEqual(FRESHNESS_OPTIONS.map((o) => o.days), [0, 1, 3, 7, 15]);
});

test('sanitizeCustomSources: region 白名单清洗（仅 domestic/overseas）', () => {
  const out = sanitizeCustomSources([
    { name: 'a', url: 'https://a.com/feed', region: 'overseas' },
    { name: 'b', url: 'https://b.com/feed', region: 'hacked' },
    { name: 'c', url: 'https://c.com/feed' },
  ]);
  assert.equal(out[0].region, 'overseas');
  assert.equal(out[1].region, 'domestic');
  assert.equal(out[2].region, 'domestic');
});
