// T3.8 导出 / 发布信息 / AI 生成标识声明纯函数单测（不依赖数据库 / LLM 密钥）。
// 运行：node --test server/test/export.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/content/project/export.util.js';
const {
  renderExportMarkdown,
  buildExportFilename,
  validatePublishRecordInput,
  DEFAULT_AI_DECLARATION,
} = util;

// ---------- renderExportMarkdown ----------

test('renderExportMarkdown: 含 AI 生成=true 时追加默认声明页脚', () => {
  const md = renderExportMarkdown({
    title: '标题A',
    accountName: '我的公众号',
    topicTitle: '选题B',
    strategyVersion: 3,
    aiGenerated: true,
    body: '正文内容段落一。',
  });
  assert.match(md, /^---\n/);
  assert.match(md, /title:\s*标题A/);
  assert.match(md, /account:\s*我的公众号/);
  assert.match(md, /strategyVersion:\s*3/);
  assert.match(md, /aiGenerated:\s*true/);
  assert.match(md, /# 标题A/);
  assert.match(md, /正文内容段落一。/);
  assert.match(md, /AI 生成内容声明（合规 §12）/);
  assert.ok(md.includes(DEFAULT_AI_DECLARATION));
});

test('renderExportMarkdown: aiGenerated=false 时不追加声明页脚', () => {
  const md = renderExportMarkdown({
    title: '纯人工稿',
    aiGenerated: false,
    body: '人工撰写。',
  });
  assert.doesNotMatch(md, /AI 生成内容声明/);
  assert.match(md, /aiGenerated:\s*false/);
});

test('renderExportMarkdown: 自定义声明优先于默认声明', () => {
  const md = renderExportMarkdown({
    aiGenerated: true,
    aiDeclaration: '本文由作者独立完成，未使用 AI。',
    body: 'x',
  });
  assert.ok(!md.includes(DEFAULT_AI_DECLARATION));
  assert.match(md, /本文由作者独立完成，未使用 AI。/);
});

test('renderExportMarkdown: front-matter 含发布信息与外链', () => {
  const md = renderExportMarkdown({
    title: '带发布信息',
    aiGenerated: false,
    body: '正文',
    publishedAt: '2026-11-06T15:00:00.000Z',
    externalUrl: 'https://mp.weixin.qq.com/s/abc',
  });
  assert.match(md, /publishedAt:\s*2026-11-06T15:00:00.000Z/);
  assert.match(md, /externalUrl:\s*"https:\/\/mp.weixin.qq.com\/s\/abc"/);
});

test('renderExportMarkdown: 空 body 与缺失标题不报错', () => {
  const md = renderExportMarkdown({ aiGenerated: false, body: '' });
  assert.match(md, /^---\n/);
  assert.doesNotMatch(md, /# /);
});

test('renderExportMarkdown: 含特殊字符的标题用 JSON 标量安全包裹', () => {
  const md = renderExportMarkdown({ title: '标题: 含冒号#号', aiGenerated: false, body: 'b' });
  assert.match(md, /title:\s*"标题: 含冒号#号"/);
});

// ---------- buildExportFilename ----------

test('buildExportFilename: 基于标题 + 日期 + id 尾缀', () => {
  const f = buildExportFilename('我的文章', 'abcdef123456');
  assert.ok(f.startsWith('我的文章-abcdef12-'));
  assert.ok(f.endsWith('.md'));
});

test('buildExportFilename: 净化非法文件名字符（防穿透/非法）', () => {
  const f = buildExportFilename('a/b\\c:d*?"<>|x', null);
  assert.doesNotMatch(f, /[\\/:*?"<>|]/);
  assert.ok(f.startsWith('a_b_c_d_x-') || f.includes('a_b_c'));
});

test('buildExportFilename: 空标题回退默认名且不过长', () => {
  const longTitle = 'x'.repeat(200);
  const f = buildExportFilename(longTitle, null);
  assert.ok(f.length <= 80 + 12 + 4);
  assert.ok(f.endsWith('.md'));
});

// ---------- validatePublishRecordInput ----------

test('validatePublishRecordInput: 合法输入 → ok 且默认 PUBLISHED', () => {
  const r = validatePublishRecordInput({ externalUrl: 'https://x.com' });
  assert.equal(r.ok, true);
  assert.equal(r.data.status, 'PUBLISHED');
});

test('validatePublishRecordInput: 指定 ARCHIVED 与发布时间', () => {
  const r = validatePublishRecordInput({ status: 'ARCHIVED', publishedAt: '2026-11-06T10:00:00.000Z' });
  assert.equal(r.ok, true);
  assert.equal(r.data.status, 'ARCHIVED');
  assert.ok(r.data.publishedAt instanceof Date);
});

test('validatePublishRecordInput: 非法 status → 报错', () => {
  const r = validatePublishRecordInput({ status: 'DRAFT' });
  assert.equal(r.ok, false);
  assert.match(r.error, /PUBLISHED/);
});

test('validatePublishRecordInput: 非法时间 → 报错', () => {
  const r = validatePublishRecordInput({ publishedAt: 'not-a-date' });
  assert.equal(r.ok, false);
  assert.match(r.error, /publishedAt/);
});

test('validatePublishRecordInput: externalUrl 过长 → 报错', () => {
  const r = validatePublishRecordInput({ externalUrl: 'x'.repeat(2001) });
  assert.equal(r.ok, false);
});

test('validatePublishRecordInput: 非对象输入 → 报错', () => {
  assert.equal(validatePublishRecordInput(null).ok, false);
  assert.equal(validatePublishRecordInput('abc').ok, false);
});
