// 选题雷达自定义数据源纯函数单测（RSS/JSON 解析、配置清洗、本地 mock HTTP）。
// 运行：node --test server/test/radar-custom-source.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import collector from '../dist/modules/radar/collectors/custom-source.collector.js';
import radarUtil from '../dist/modules/radar/radar.util.js';

const { parseCustomPayload, cleanHttpUrl, fetchCustomSource, collectCustomSources } = collector;
const { sanitizeConfig, sanitizeCustomSources } = radarUtil;

const RSS = `<?xml version="1.0"?><rss><channel>
  <item><title><![CDATA[AI 工具周报 &amp; 新趋势]]></title><link>https://example.com/a</link><pubDate>Mon, 16 Nov 2026 08:00:00 GMT</pubDate></item>
  <item><title>副业复盘</title><link>https://example.com/b</link></item>
</channel></rss>`;

const ATOM = `<feed><entry><title>Atom 标题</title><link rel="alternate" href="https://example.com/atom"/><updated>2026-11-16T08:00:00Z</updated></entry></feed>`;

test('parseCustomPayload: RSS item 与 CDATA / 实体解码', () => {
  const items = parseCustomPayload(RSS, 'rss', 10, 'custom:s1');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'AI 工具周报 & 新趋势');
  assert.equal(items[0].url, 'https://example.com/a');
  assert.equal(items[0].sourceName, 'custom:s1');
  assert.equal(items[0].sourceType, 'custom');
  assert.ok(items[0].publishedAt.includes('2026'));
});

test('parseCustomPayload: Atom entry 的 link[href] 也能解析', () => {
  const items = parseCustomPayload(ATOM, 'rss', 5, 'custom:s2');
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.com/atom');
});

test('parseCustomPayload: JSON 支持顶层数组 / items 包装 / 字段映射 / limit', () => {
  const arr = JSON.stringify([
    { title: '热点 A', url: 'https://x.com/a', heat: 12 },
    { name: '热点 B', link: 'https://x.com/b', score: 8 },
    { text: '热点 C' },
  ]);
  const a = parseCustomPayload(arr, 'json', 2, 'custom:j1');
  assert.equal(a.length, 2);
  assert.equal(a[0].title, '热点 A');
  assert.equal(a[0].heat, 12);
  assert.equal(a[1].url, 'https://x.com/b');

  const wrapped = parseCustomPayload(JSON.stringify({ items: [{ title: '一条' }] }), 'json', 10, 'custom:j2');
  assert.equal(wrapped.length, 1);
  assert.equal(parseCustomPayload('{bad json', 'json', 10, 'custom:j3').length, 0);
  assert.equal(parseCustomPayload('{}', 'json', 10, 'custom:j4').length, 0);
});

test('cleanHttpUrl: 拒绝 javascript:/data:/相对路径', () => {
  assert.equal(cleanHttpUrl(' javascript:alert(1)'), '');
  assert.equal(cleanHttpUrl('data:text/plain,hi'), '');
  assert.equal(cleanHttpUrl('/local/feed'), '');
  assert.equal(cleanHttpUrl(' https://example.com/feed.xml '), 'https://example.com/feed.xml');
});

test('sanitizeCustomSources: URL 白名单 / 去重 / 数量上限 / 稳定 id', () => {
  const list = sanitizeCustomSources([
    { name: '源 A', url: 'https://a.com/rss', format: 'json', enabled: false, keywords: ['AI', ' ', 3] },
    { name: '源 B', url: 'javascript:alert(1)', format: 'rss' },
    { id: 'mine', name: '源 C', url: 'http://c.com/api', format: 'rss' },
    { name: '重复 URL', url: 'https://a.com/rss', format: 'rss' },
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].format, 'json');
  assert.equal(list[0].enabled, false);
  assert.deepEqual(list[0].keywords, ['AI']);
  assert.ok(list[0].id.startsWith('src_'));
  assert.equal(list[1].id, 'mine');
  assert.equal(sanitizeCustomSources(null).length, 0);
  assert.ok(sanitizeCustomSources(Array.from({ length: 30 }, (_, i) => ({ url: `https://x.com/${i}` })), 5).length <= 5);
});

test('sanitizeConfig: 保留合法自定义源，缺失时回落空数组', () => {
  const cfg = sanitizeConfig({
    customSources: [{ id: 'ok', name: '我的源', url: 'https://ok.com/feed', format: 'rss', enabled: true }],
  });
  assert.equal(cfg.customSources.length, 1);
  assert.equal(cfg.customSources[0].id, 'ok');
  assert.deepEqual(sanitizeConfig({}).customSources, []);
});

test('fetchCustomSource / collectCustomSources: 本地 mock HTTP 成功与单源失败降级', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/ok') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ items: [{ title: '本地源条目', url: 'https://example.com/1' }] }));
    } else {
      res.statusCode = 500;
      res.end('boom');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  t.after(() => server.close());

  const ok = await fetchCustomSource({ url: `${base}/ok`, format: 'json' }, 10, 'custom:mock', 3000);
  assert.equal(ok.ok, true);
  assert.equal(ok.count, 1);
  assert.equal(ok.sample[0].title, '本地源条目');
  assert.equal(ok.items[0].sourceName, 'custom:mock');

  const bad = await fetchCustomSource({ url: `${base}/bad`, format: 'json' }, 10, 'custom:bad', 3000);
  assert.equal(bad.ok, false);
  assert.equal(bad.count, 0);
  assert.match(bad.error, /HTTP 500/);

  const outcomes = await collectCustomSources([
    { id: 'a', name: '好源', url: `${base}/ok`, format: 'json', enabled: true, keywords: [] },
    { id: 'b', name: '坏源', url: `${base}/bad`, format: 'json', enabled: true, keywords: [] },
    { id: 'c', name: '停用', url: `${base}/ok`, format: 'json', enabled: false, keywords: [] },
  ], 10);
  assert.equal(outcomes.length, 2); // 停用的不采集
  assert.equal(outcomes[0].items.length, 1);
  assert.equal(outcomes[1].items.length, 0);
  assert.ok(outcomes[1].error);
});
