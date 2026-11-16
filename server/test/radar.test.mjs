// T6.1 选题雷达：纯函数 + 采集器单测（不依赖数据库/Redis/LLM/真实网络）。
// 运行：node --test server/test/radar.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/radar/radar.util.js';
const {
  normalizeTitle, fingerprintOf, sanitizeConfig, relevanceOf, normalizeHeat,
  scoreOf, dedupeAndRank, parseRadarTitles, fallbackTitles,
} = util;

import contract from '../dist/modules/radar/radar.contract.js';
const { DEFAULT_RADAR_CONFIG } = contract;

// ---------------- 指纹与规范化 ----------------
test('normalizeTitle: NFC + 空白折叠 + 小写', () => {
  assert.equal(normalizeTitle('  AI  工具  '), 'ai 工具');
  assert.equal(normalizeTitle('ＡＩ工具'), 'ａｉ工具');
  assert.equal(normalizeTitle(''), '');
  assert.equal(normalizeTitle(null), '');
});

test('fingerprintOf: 同标题不同空白得同一指纹，不同标题不同指纹', () => {
  const a = fingerprintOf('AI 副业 月入过万');
  const b = fingerprintOf('  AI   副业 月入过万 ');
  const c = fingerprintOf('AI 副业 月入十万');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{64}$/);
});

// ---------------- 配置清洗 ----------------
test('sanitizeConfig: 缺省回落默认值', () => {
  const cfg = sanitizeConfig(null);
  assert.ok(cfg.niches.length >= 1);
  assert.equal(cfg.output.totalItems, 20);
  assert.equal(cfg.schedule.time, '08:00');
  assert.deepEqual(cfg.monitoredAccounts, { x: [], youtube: [] });
});

test('sanitizeConfig: 条数夹逼 + 时间格式校验 + 空串过滤', () => {
  const cfg = sanitizeConfig({
    niches: [{ name: '测试', enabled: true, keywords: ['a', '', '  ', 'b'] }],
    output: { totalItems: 999, featuredItems: 99, titlesPerItem: 0 },
    schedule: { enabled: true, time: '25:99' },
    monitoredAccounts: { x: ['u1', ''], youtube: [] },
  });
  assert.equal(cfg.output.totalItems, 100);
  assert.equal(cfg.output.featuredItems, 20);
  assert.equal(cfg.output.titlesPerItem, 1);
  assert.equal(cfg.schedule.time, '08:00'); // 非法时间回落
  assert.deepEqual(cfg.niches[0].keywords, ['a', 'b']);
  assert.deepEqual(cfg.monitoredAccounts.x, ['u1']);
});

test('sanitizeConfig: 主推条数不超过总条数', () => {
  const cfg = sanitizeConfig({ output: { totalItems: 5, featuredItems: 20 } });
  assert.equal(cfg.output.totalItems, 5);
  assert.equal(cfg.output.featuredItems, 5);
});

test('DEFAULT_RADAR_CONFIG 可独立使用不被测试污染', () => {
  assert.equal(DEFAULT_RADAR_CONFIG.output.totalItems, 20);
  assert.equal(DEFAULT_RADAR_CONFIG.schedule.enabled, false);
});

// ---------------- 打分 ----------------
test('relevanceOf: 命中多关键词得高分，空关键词得 0', () => {
  const kws = ['副业', 'AI', '变现'];
  assert.equal(relevanceOf('副业 AI 变现', kws), 1);
  assert.ok(relevanceOf('AI 工具', kws) > 0);
  assert.equal(relevanceOf('完全不相关', kws), 0);
  assert.equal(relevanceOf('AI', []), 0);
});

test('normalizeHeat: 对数压缩且限制在 0-100', () => {
  assert.equal(normalizeHeat(undefined, 100), 0);
  assert.equal(normalizeHeat(-1, 100), 0);
  assert.equal(normalizeHeat(100, 100), 100);
  assert.ok(normalizeHeat(10, 10000) < 50);
});

test('scoreOf: 相关度权重高于热度', () => {
  assert.ok(scoreOf(1, 0) > scoreOf(0, 1));
  assert.equal(scoreOf(0, 0), 0);
});

// ---------------- 去重排序 ----------------
test('dedupeAndRank: 同指纹只留一条、按分降序、限制条数', () => {
  const mk = (title, score, fp = fingerprintOf(title)) => ({ title, score, heat: 0, fingerprint: fp, sourceName: 'x', sourceType: 'hotlist' });
  const items = [
    mk('A', 0.9), mk('B', 0.7), mk('A', 0.5), mk('C', 0.8), mk('D', 0.1),
  ];
  const out = dedupeAndRank(items, 3);
  assert.equal(out.length, 3);
  assert.equal(out[0].title, 'A');
  assert.equal(out[1].title, 'C');
  assert.equal(out[2].title, 'B');
});

// ---------------- 标题解析与兜底 ----------------
test('parseRadarTitles: 裸 JSON / 代码块 / 废话包裹都能解析', () => {
  const json = '{"titles":[{"text":"标题1","basis":"角度1"},{"text":"标题2"}]}';
  assert.equal(parseRadarTitles(json, '', 3).length, 2);
  assert.equal(parseRadarTitles('```json\n' + json + '\n```', '', 3)[0].text, '标题1');
  assert.equal(parseRadarTitles('好的，结果如下：' + json, '', 3).length, 2);
  assert.deepEqual(parseRadarTitles('不是 JSON', '', 3), []);
});

test('fallbackTitles: 无 LLM 时仍产出指定数量的标题', () => {
  const out = fallbackTitles('AI 副业月入过万', '副业与网赚', 3);
  assert.equal(out.length, 3);
  assert.ok(out[0].text.includes('副业与网赚'));
  assert.ok(out[0].basis.includes('模板'));
});
