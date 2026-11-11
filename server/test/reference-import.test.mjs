// T2.1 对标账号导入纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/reference-import.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/analysis/reference-import.util.js';
const {
  normalizeRefName,
  deriveDomain,
  parseReferenceAccounts,
  classifyCandidates,
  VALID_PLATFORMS,
} = util;

test('normalizeRefName: 去首尾空白 + 小写 + 压缩内部空白', () => {
  assert.equal(normalizeRefName('  Foo   Bar '), 'foo bar');
  assert.equal(normalizeRefName('XX头条'), 'xx头条');
});

test('deriveDomain: 从 URL 派生并去 www.', () => {
  assert.equal(deriveDomain('https://www.example.com/path'), 'example.com');
  assert.equal(deriveDomain('http://blog.example.com'), 'blog.example.com');
  assert.equal(deriveDomain('not-a-url'), null);
  assert.equal(deriveDomain(null), null);
});

test('parseReferenceAccounts CSV: 带表头解析 + 缺 name 跳过', () => {
  const raw = 'name,platform,homepageUrl,domain,note\n某账号,wechat,https://mp.weixin.qq.com/a,example.com,头部\n,,https://x.com,,\n';
  const { rows, skipped } = parseReferenceAccounts(raw, 'csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '某账号');
  assert.equal(rows[0].platform, 'wechat');
  assert.equal(rows[0].homepageUrl, 'https://mp.weixin.qq.com/a');
  assert.equal(rows[0].domain, 'example.com');
  assert.equal(skipped.length, 1);
});

test('parseReferenceAccounts CSV: 无表头按列序解析', () => {
  const raw = '账号B,wechat,https://b.com';
  const { rows } = parseReferenceAccounts(raw, 'csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '账号B');
  assert.equal(rows[0].homepageUrl, 'https://b.com');
});

test('parseReferenceAccounts JSON: 数组解析 + 无效平台回退 wechat + 派生 domain', () => {
  const raw = JSON.stringify([
    { name: 'A号', homepageUrl: 'https://www.a.com/x' },
    { name: 'B号', platform: 'unknown', note: '测试' },
  ]);
  const { rows } = parseReferenceAccounts(raw, 'json');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].domain, 'a.com');
  assert.equal(rows[0].platform, 'wechat');
  assert.equal(rows[1].platform, 'wechat');
  assert.equal(rows[1].note, '测试');
});

test('parseReferenceAccounts JSON: 非法 JSON 抛错', () => {
  assert.throws(() => parseReferenceAccounts('{bad', 'json'), /JSON 解析失败/);
});

test('parseReferenceAccounts lines: 名称-URL / 名称：URL / 仅名称', () => {
  const raw = '某头部号 - https://mp.weixin.qq.com/x\n测评号：https://www.ce.com\n观察号';
  const { rows } = parseReferenceAccounts(raw, 'lines');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, '某头部号');
  assert.equal(rows[0].homepageUrl, 'https://mp.weixin.qq.com/x');
  assert.equal(rows[1].name, '测评号');
  assert.equal(rows[1].domain, 'ce.com');
  assert.equal(rows[2].name, '观察号');
  assert.equal(rows[2].homepageUrl, undefined);
});

test('classifyCandidates: 批次内重复 + 与已有同名标记', () => {
  const rows = [
    { name: 'Alpha', platform: 'wechat' },
    { name: 'Alpha', platform: 'wechat' },
    { name: 'Beta', platform: 'wechat' },
  ];
  const existing = new Map([['beta', 'ex-id-1']]);
  const c = classifyCandidates(rows, existing);
  assert.equal(c[0].status, 'new');
  assert.equal(c[1].status, 'duplicate');
  assert.equal(c[1].reason, '批次内重复');
  assert.equal(c[2].status, 'duplicate');
  assert.equal(c[2].existingId, 'ex-id-1');
});

test('VALID_PLATFORMS 仅含 wechat', () => {
  assert.equal(VALID_PLATFORMS.has('wechat'), true);
  assert.equal(VALID_PLATFORMS.size, 1);
});
