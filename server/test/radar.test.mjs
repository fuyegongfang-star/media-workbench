// T6.1 选题雷达：纯函数 + 采集器单测（不依赖数据库/Redis/LLM/真实网络）。
// 运行：node --test server/test/radar.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/radar/radar.util.js';
const {
  normalizeTitle, fingerprintOf, sanitizeConfig, relevanceOf, normalizeHeat,
  scoreOf, dedupeAndRank, parseRadarTitles, fallbackTitles,
  accountDedupeKey, filterSeenAccounts,
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

// ---------------- T6.3 盯号采集器（零 Key，纯函数部分）----------------
import acct from '../dist/modules/radar/collectors/account.collector.js';
const { cleanHandle, cleanChannel, parseRssItems, parseJinaTweets, parseYoutubeChannelHtml, toOriginalXUrl, XAccountCollector, YoutubeAccountCollector } = acct;

test('cleanHandle: @handle / x.com URL / 纯串 归一化，去非法字符', () => {
  assert.equal(cleanHandle('@elonmusk'), 'elonmusk');
  assert.equal(cleanHandle('https://x.com/OpenAI'), 'OpenAI');
  assert.equal(cleanHandle('https://twitter.com/foo/status/123'), 'foo');
  assert.equal(cleanHandle('  @bad-name!  '), 'badname');
  assert.equal(cleanHandle(''), '');
});

test('cleanChannel: UC 频道 ID 与 @handle 均可，去掉不安全字符', () => {
  assert.equal(cleanChannel('UCX6OQ3DkcsbYNE6H8uQQuVA'), 'UCX6OQ3DkcsbYNE6H8uQQuVA');
  assert.equal(cleanChannel('@MrBeast'), '@MrBeast');
  assert.equal(cleanChannel('https://www.youtube.com/@NeoLab'), '@NeoLab');
});

test('parseRssItems: Nitter RSS 解析出标题/链接/时间，限条数', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>第一条推文</title><link>https://x.com/u/status/111</link><pubDate>Mon, 16 Nov 2026 06:53:33 GMT</pubDate><description>d1</description></item>
    <item><title>第二条 &amp; 推文</title><link>https://x.com/u/status/222</link><pubDate>Mon, 16 Nov 2026 05:00:00 GMT</pubDate><description>d2</description></item>
    <item><title>第三条</title><link>https://x.com/u/status/333</link><description>d3</description></item>
  </channel></rss>`;
  const out = parseRssItems(xml, 'x_account', 2);
  assert.equal(out.length, 2); // 限条数：第三条被截断
  assert.equal(out[0].title, '第一条推文');
  assert.equal(out[0].url, 'https://x.com/u/status/111'); // Nitter 镜像链接已归一到 x.com 原帖
  assert.match(out[0].publishedAt, /^2026-11-16T06:53:33/);
  assert.equal(out[1].title, '第二条 & 推文'); // HTML 实体反转义
  const all = parseRssItems(xml, 'x_account', 10);
  assert.equal(all.length, 3);
  assert.equal(all[2].publishedAt, undefined); // 无 pubDate 的条目不加时间字段
});

test('toOriginalXUrl: Nitter 镜像链接转 x.com 原帖', () => {
  assert.equal(toOriginalXUrl('http://nitter.mie.foundation/elonmusk/status/2122221516867895726#m'), 'https://x.com/elonmusk/status/2122221516867895726');
  assert.equal(toOriginalXUrl('https://x.com/u/status/1234567890123456789'), 'https://x.com/u/status/1234567890123456789');
  assert.equal(toOriginalXUrl('https://example.com/not-a-tweet'), 'https://example.com/not-a-tweet');
});

test('parseJinaTweets: 从 Markdown 抽 status id，去重并限条数', () => {
  const md = 'some text [link](https://x.com/u/status/1234567890123456789) and https://x.com/u/status/1234567890123456789 and https://x.com/u/status/9876543210987654321';
  const out = parseJinaTweets(md, 'u', 5);
  assert.equal(out.length, 2);
  assert.equal(out[0].url, 'https://x.com/u/status/1234567890123456789');
  assert.equal(out[0].sourceName, 'x_account');
});

test('parseYoutubeChannelHtml: 频道页 richItemRenderer 抽真实标题/链接/去重/限条', () => {
  const html = `<html>
    <div>"richItemRenderer":{"content":{"lockupViewModel":{"contentId":"q6fgVVmdpgY",
      "metadata":{"lockupMetadataViewModel":{"title":{"content":"我在现实中重现饥饿游戏"}}}}}},"videoId":"q6fgVVmdpgY"</div>
    <div>"richItemRenderer":{"content":"...","videoId":"_c2e1NcI3Sc",
      "lockupMetadataViewModel":{"title":{"content":"击败哈兰德 赢取 10 万美元"}}}</div>
    <div>"richItemRenderer":{"content":"...","videoId":"q6fgVVmdpgY","title":{"content":"重复视频"}}</div>
    <div>"richItemRenderer":{"content":"...","videoId":"RE3_PGwDwhw"}</div>
  </html>`;
  const out = parseYoutubeChannelHtml(html, '@MrBeast', 10);
  assert.equal(out.length, 3); // 去重 q6fgVVmdpgY
  assert.equal(out[0].title, '我在现实中重现饥饿游戏');
  assert.equal(out[0].url, 'https://www.youtube.com/watch?v=q6fgVVmdpgY');
  assert.equal(out[0].sourceName, 'youtube_account');
  assert.equal(out[1].title, '击败哈兰德 赢取 10 万美元');
  assert.equal(out[2].title, 'YouTube @MrBeast 视频 RE3_PGwDwhw'); // 无标题时兜底
  const limited = parseYoutubeChannelHtml(html, '@MrBeast', 2);
  assert.equal(limited.length, 2);
});

test('sanitizeConfig: accountDedupeDays 夹逼 0-90、非法回落 7、0 关闭', () => {
  assert.equal(sanitizeConfig({}).accountDedupeDays, 7);
  assert.equal(sanitizeConfig({ accountDedupeDays: 0 }).accountDedupeDays, 0);
  assert.equal(sanitizeConfig({ accountDedupeDays: 999 }).accountDedupeDays, 90);
  assert.equal(sanitizeConfig({ accountDedupeDays: -5 }).accountDedupeDays, 0);
  assert.equal(sanitizeConfig({ accountDedupeDays: '12' }).accountDedupeDays, 12);
  assert.equal(sanitizeConfig({ accountDedupeDays: 'abc' }).accountDedupeDays, 7);
  assert.equal(DEFAULT_RADAR_CONFIG.accountDedupeDays, 7);
});

test('accountDedupeKey: URL 优先、无 URL 用标题指纹、与历史落库键一致', () => {
  assert.equal(accountDedupeKey('https://www.youtube.com/watch?v=q6fgVVmdpgY', '任意标题'), 'url:https://www.youtube.com/watch?v=q6fgVVmdpgY');
  assert.equal(accountDedupeKey('  https://x.com/u/status/123  ', 't'), 'url:https://x.com/u/status/123');
  const fpKey = accountDedupeKey(undefined, '我在现实中重现饥饿游戏');
  assert.equal(fpKey, `fp:${fingerprintOf('我在现实中重现饥饿游戏')}`);
  // 同一标题不同空白得同一键（与落库侧 fingerprint 规范化一致）
  assert.equal(accountDedupeKey('', '  AI  工具  '), accountDedupeKey(undefined, 'ai 工具'));
});

test('filterSeenAccounts: 只过滤命中 seen 的盯号内容，热榜与其它盯号保留', () => {
  const items = [
    { sourceName: 'youtube_account', url: 'https://www.youtube.com/watch?v=AAA', title: '视频A' },
    { sourceName: 'youtube_account', url: 'https://www.youtube.com/watch?v=BBB', title: '视频B' },
    { sourceName: 'x_account', url: 'https://x.com/u/status/111', title: '推文1' },
    { sourceName: 'toutiao', url: 'https://hot/article/1', title: '热点' },
  ];
  const seen = new Set([accountDedupeKey('https://www.youtube.com/watch?v=AAA', '视频A')]);
  const out = filterSeenAccounts(items, seen, 7);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((i) => i.sourceName), ['youtube_account', 'x_account', 'toutiao']);
  assert.equal(out[0].title, '视频B'); // 命中的视频A 被剔除
  // 窗口关闭 / seen 为空时原样返回
  assert.equal(filterSeenAccounts(items, seen, 0), items);
  assert.equal(filterSeenAccounts(items, new Set(), 7), items);
});

test('账号采集器：未配置账号时返回空，不触网', async () => {
  const x = new XAccountCollector();
  const yt = new YoutubeAccountCollector();
  assert.deepEqual(await x.collect([], 10, { x: [], youtube: [] }), []);
  assert.deepEqual(await yt.collect([], 10, { x: [], youtube: [] }), []);
  assert.deepEqual(await x.collect([], 10), []); // accounts 缺省
});

test('sanitizeConfig: 新增两个盯号来源开关默认开启，可单独关闭', () => {
  const cfg = sanitizeConfig({ sources: { x_account: false } });
  assert.equal(cfg.sources.x_account, false);
  assert.equal(cfg.sources.youtube_account, true);
  assert.equal(DEFAULT_RADAR_CONFIG.sources.x_account, true);
});
