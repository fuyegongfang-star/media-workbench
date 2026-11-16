// T6.7 站点品牌 / TDK / SEO·GEO 配置纯函数单测（不依赖数据库）。
// 运行：node --test server/test/site-seo.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import seo from '../dist/modules/system/seo.util.js';

const { DEFAULT_SEO, SEO_FIELDS, mergeSeo, publicSeo } = seo;

test('DEFAULT_SEO 覆盖全部白名单字段，且默认允许收录 / 输出 AI 摘要', () => {
  assert.deepEqual(Object.keys(DEFAULT_SEO).sort(), Object.keys(SEO_FIELDS).sort());
  assert.equal(DEFAULT_SEO.indexable, true);
  assert.equal(DEFAULT_SEO.llmsEnabled, true);
  assert.equal(DEFAULT_SEO.logoUrl, '');
  assert.ok(DEFAULT_SEO.geoSummary.length > 20);
});

test('mergeSeo: 默认 → 已存 → 入参 覆盖，空入参返回默认', () => {
  assert.deepEqual(mergeSeo(null, null), DEFAULT_SEO);
  const r = mergeSeo({ seoTitle: '旧标题', ownerName: '旧所有者' }, { seoTitle: '新标题' });
  assert.equal(r.seoTitle, '新标题');
  assert.equal(r.ownerName, '旧所有者');
  assert.equal(r.indexable, true);
});

test('mergeSeo: 忽略未知字段与非布尔/非字符串值', () => {
  const r = mergeSeo(null, {
    junk: '<script>alert(1)</script>',
    indexable: 'yes',
    seoTitle: 123,
    ownerName: null,
  });
  assert.equal(r.junk, undefined);
  assert.equal(r.indexable, true);
  assert.equal(r.seoTitle, '');
  assert.equal(r.ownerName, '');
});

test('mergeSeo: 显式空串清空，未传字段保持原值', () => {
  const saved = mergeSeo(null, { seoTitle: 'A', ogImageUrl: 'https://a.example/og.png' });
  const cleared = mergeSeo(saved, { seoTitle: '' });
  assert.equal(cleared.seoTitle, '');
  assert.equal(cleared.ogImageUrl, 'https://a.example/og.png');
});

test('mergeSeo: URL 白名单允许 http(s) 与站内绝对路径，拒绝危险协议', () => {
  const r = mergeSeo(null, {
    canonicalUrl: 'https://zmt.example.cc/',
    logoUrl: '/brand/logo.svg',
    ogImageUrl: 'javascript:alert(1)',
    ownerUrl: 'data:text/html,hi',
    icpUrl: '//evil.example/',
  });
  assert.equal(r.canonicalUrl, 'https://zmt.example.cc/');
  assert.equal(r.logoUrl, '/brand/logo.svg');
  assert.equal(r.ogImageUrl, '');
  assert.equal(r.ownerUrl, '');
  assert.equal(r.icpUrl, '');
});

test('mergeSeo: 非法 URL 不误清已有合法值', () => {
  const saved = mergeSeo(null, { ownerUrl: 'https://owner.example/' });
  const r = mergeSeo(saved, { ownerUrl: 'javascript:fetch(1)' });
  assert.equal(r.ownerUrl, 'https://owner.example/');
});

test('mergeSeo: 邮箱格式校验、布尔只接受 boolean、控制字符清洗与长度截断', () => {
  const r = mergeSeo(null, {
    supportEmail: 'ops@example.com',
    llmsEnabled: false,
    indexable: 1,
    seoTitle: `标题\r\n注入`,
    copyrightNote: 'x'.repeat(400),
  });
  assert.equal(r.supportEmail, 'ops@example.com');
  assert.equal(r.llmsEnabled, false);
  assert.equal(r.indexable, true);
  assert.equal(r.seoTitle, '标题  注入');
  assert.equal(r.copyrightNote.length, SEO_FIELDS.copyrightNote.max);
  assert.equal(mergeSeo(null, { supportEmail: 'not-an-email' }).supportEmail, '');
});

test('publicSeo: 用默认值补齐缺失字段，输出可直接渲染的完整结构', () => {
  const r = publicSeo({ seoTitle: '自定义标题' });
  assert.equal(r.seoTitle, '自定义标题');
  for (const key of Object.keys(SEO_FIELDS)) assert.ok(key in r);
});
