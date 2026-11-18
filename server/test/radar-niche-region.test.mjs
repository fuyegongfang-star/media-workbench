// T6.10 选题雷达：赛道按国内/海外归集 + 关键词按地区路由（纯函数 + collectAll 分发，不依赖 DB/网络）。
// 运行：node --test server/test/radar-niche-region.test.mjs（需先 npm --prefix server run build）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import contract from '../dist/modules/radar/radar.contract.js';
const { SOURCE_REGION, DEFAULT_RADAR_CONFIG, NICHE_REGION_OPTIONS } = contract;
import util from '../dist/modules/radar/radar.util.js';
const {
  normalizeNicheRegion,
  nichesForRegion,
  keywordsForRegion,
  keywordsByRegion,
  sanitizeConfig,
} = util;
import collectors from '../dist/modules/radar/collectors/index.js';
const { COLLECTORS, collectAll } = collectors;

const SAMPLE_NICHES = [
  { name: '国内A', enabled: true, region: 'domestic', keywords: ['副业', '网赚'] },
  { name: '海外A', enabled: true, region: 'overseas', keywords: ['SaaS', 'startup'] },
  { name: '通用A', enabled: true, region: 'both', keywords: ['AI', '发布'] },
  { name: '禁用国内', enabled: false, region: 'domestic', keywords: ['不该出现'] },
];

// ---------------- 地区归一化 ----------------
test('normalizeNicheRegion: 合法值保留，非法/缺失一律 both（存量兼容）', () => {
  assert.equal(normalizeNicheRegion('domestic'), 'domestic');
  assert.equal(normalizeNicheRegion('overseas'), 'overseas');
  assert.equal(normalizeNicheRegion('both'), 'both');
  assert.equal(normalizeNicheRegion(undefined), 'both');
  assert.equal(normalizeNicheRegion(null), 'both');
  assert.equal(normalizeNicheRegion('hacked'), 'both');
  assert.equal(normalizeNicheRegion(123), 'both');
});

test('NICHE_REGION_OPTIONS: 三档且顺序为 国内/海外/通用', () => {
  assert.deepEqual(NICHE_REGION_OPTIONS.map((o) => o.value), ['domestic', 'overseas', 'both']);
});

// ---------------- 按地区筛赛道 ----------------
test('nichesForRegion: 只返回该地区 + 通用 + 已启用赛道', () => {
  const domestic = nichesForRegion(SAMPLE_NICHES, 'domestic');
  assert.deepEqual(domestic.map((n) => n.name), ['国内A', '通用A']);
  const overseas = nichesForRegion(SAMPLE_NICHES, 'overseas');
  assert.deepEqual(overseas.map((n) => n.name), ['海外A', '通用A']);
});

test('nichesForRegion: 国内赛道绝不会进入海外条目归属，反之亦然', () => {
  for (const n of nichesForRegion(SAMPLE_NICHES, 'overseas')) assert.notEqual(n.name, '国内A');
  for (const n of nichesForRegion(SAMPLE_NICHES, 'domestic')) assert.notEqual(n.name, '海外A');
});

// ---------------- 按地区路由关键词 ----------------
test('keywordsForRegion: 国内只拿中文词+通用，海外只拿英文词+通用', () => {
  assert.deepEqual(keywordsForRegion(SAMPLE_NICHES, 'domestic'), ['副业', '网赚', 'AI', '发布']);
  assert.deepEqual(keywordsForRegion(SAMPLE_NICHES, 'overseas'), ['SaaS', 'startup', 'AI', '发布']);
  // 核心回归：中文赛道词不会污染海外源，英文赛道词不会污染国内源
  assert.ok(!keywordsForRegion(SAMPLE_NICHES, 'overseas').includes('副业'));
  assert.ok(!keywordsForRegion(SAMPLE_NICHES, 'domestic').includes('SaaS'));
});

test('keywordsForRegion: 保序去重（大小写不敏感）、去空、跳过禁用', () => {
  const niches = [
    { name: 'a', enabled: true, region: 'domestic', keywords: ['AI', 'ai', '  ', '副业'] },
    { name: 'b', enabled: true, region: 'both', keywords: ['AI', '发布'] },
    { name: 'off', enabled: false, region: 'domestic', keywords: ['禁用词'] },
  ];
  assert.deepEqual(keywordsForRegion(niches, 'domestic'), ['AI', '副业', '发布']);
  assert.ok(!keywordsForRegion(niches, 'domestic').includes('禁用词'));
});

test('keywordsByRegion: 一次构造国内/海外两张词表', () => {
  const by = keywordsByRegion(SAMPLE_NICHES);
  assert.deepEqual(Object.keys(by).sort(), ['domestic', 'overseas']);
  assert.deepEqual(by.domestic, ['副业', '网赚', 'AI', '发布']);
  assert.deepEqual(by.overseas, ['SaaS', 'startup', 'AI', '发布']);
});

test('keywordsForRegion: 无任何赛道时返回空数组（采集器按既有语义不过滤）', () => {
  assert.deepEqual(keywordsForRegion([], 'domestic'), []);
  assert.deepEqual(keywordsForRegion([], 'overseas'), []);
});

// ---------------- 配置清洗 / 存量兼容 ----------------
test('sanitizeConfig: 赛道 region 白名单清洗，非法回落 both', () => {
  const cfg = sanitizeConfig({
    niches: [
      { name: 'a', keywords: ['x'], region: 'overseas' },
      { name: 'b', keywords: ['y'], region: 'hacked' },
      { name: 'c', keywords: ['z'] }, // 存量缺字段
    ],
  });
  assert.equal(cfg.niches[0].region, 'overseas');
  assert.equal(cfg.niches[1].region, 'both');
  assert.equal(cfg.niches[2].region, 'both');
});

test('sanitizeConfig: 存量赛道升级后两边都参与，行为不变', () => {
  const cfg = sanitizeConfig({ niches: [{ name: '副业', keywords: ['副业', '网赚'] }] });
  const by = keywordsByRegion(cfg.niches);
  assert.deepEqual(by.domestic, ['副业', '网赚']);
  assert.deepEqual(by.overseas, ['副业', '网赚']);
});

test('sanitizeConfig: 空 niches 回落到带地区的默认分组', () => {
  const cfg = sanitizeConfig({ niches: [] });
  assert.ok(cfg.niches.some((n) => n.region === 'domestic'));
  assert.ok(cfg.niches.some((n) => n.region === 'overseas'));
  assert.ok(cfg.niches.some((n) => n.region === 'both'));
});

test('DEFAULT_RADAR_CONFIG: 国内/海外/通用三类齐全，且地区字段类型正确', () => {
  const regions = new Set(DEFAULT_RADAR_CONFIG.niches.map((n) => n.region));
  assert.ok(regions.has('domestic') && regions.has('overseas') && regions.has('both'));
  for (const n of DEFAULT_RADAR_CONFIG.niches) {
    assert.ok(['domestic', 'overseas', 'both'].includes(n.region), `赛道 ${n.name} 缺少合法 region`);
  }
  // 默认词库按地区路由后，国内源不会拿到纯英文赛道词，海外源不会拿到纯中文赛道词
  const by = keywordsByRegion(DEFAULT_RADAR_CONFIG.niches);
  assert.ok(!by.domestic.includes('indie hacker'));
  assert.ok(!by.overseas.includes('副业'));
  assert.ok(by.domestic.includes('副业'));
  assert.ok(by.overseas.includes('SaaS'));
});

// ---------------- collectAll 真实分发 ----------------
test('collectAll: 按 SOURCE_REGION 把地区关键词分发给对应采集器', async () => {
  const seen = {};
  const original = {};
  for (const id of Object.keys(COLLECTORS)) {
    original[id] = COLLECTORS[id];
    COLLECTORS[id] = {
      collect: async (keywords) => { seen[id] = keywords; return []; },
    };
  }
  try {
    const byRegion = { domestic: ['副业', '网赚'], overseas: ['SaaS', 'startup'] };
    await collectAll(
      { toutiao: true, bilibili: true, hnrss: true, sogou_wechat: true, x_account: true, youtube_account: true },
      byRegion,
      10,
      { x: [], youtube: [] },
      [],
    );
    // 国内源
    for (const id of ['toutiao', 'bilibili', 'sogou_wechat']) {
      assert.equal(SOURCE_REGION[id], 'domestic');
      assert.deepEqual(seen[id], byRegion.domestic, `${id} 应只收到国内关键词`);
    }
    // 海外源
    for (const id of ['hnrss', 'x_account', 'youtube_account']) {
      assert.equal(SOURCE_REGION[id], 'overseas');
      assert.deepEqual(seen[id], byRegion.overseas, `${id} 应只收到海外关键词`);
    }
  } finally {
    for (const id of Object.keys(original)) COLLECTORS[id] = original[id];
  }
});

test('collectAll: enabled=false 的源不会被调用', async () => {
  const seen = {};
  const original = {};
  for (const id of Object.keys(COLLECTORS)) {
    original[id] = COLLECTORS[id];
    COLLECTORS[id] = { collect: async (keywords) => { seen[id] = keywords; return []; } };
  }
  try {
    await collectAll({ toutiao: true, hnrss: false }, { domestic: ['A'], overseas: ['B'] }, 5, { x: [], youtube: [] }, []);
    assert.deepEqual(seen.toutiao, ['A']);
    assert.equal(seen.hnrss, undefined);
  } finally {
    for (const id of Object.keys(original)) COLLECTORS[id] = original[id];
  }
});
