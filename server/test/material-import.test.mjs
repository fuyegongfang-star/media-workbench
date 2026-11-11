// T2.2 素材导入纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/material-import.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import util from '../dist/modules/analysis/material-import.util.js';
const {
  normalizeMaterialText,
  computeFingerprint,
  parseMaterials,
  classifyMaterialCandidates,
} = util;

test('normalizeMaterialText: 小写 + 去空白与标点（含中文标点）', () => {
  assert.equal(normalizeMaterialText('  Hello，World！ '), 'helloworld');
  assert.equal(normalizeMaterialText('AI  写作。/测试'), 'ai写作测试');
});

test('computeFingerprint: 确定且对标题/正文顺序敏感', () => {
  const a = computeFingerprint('标题A', '正文内容');
  const a2 = computeFingerprint('标题A', '正文内容');
  const b = computeFingerprint('正文内容', '标题A');
  assert.equal(a, a2);
  assert.notEqual(a, b);
  // 与文档公式一致：sha256(normalize(title)+'\n'+normalize(body))
  const expected = createHash('sha256').update(normalizeMaterialText('标题A') + '\n' + normalizeMaterialText('正文内容')).digest('hex');
  assert.equal(a, expected);
});

test('parseMaterials CSV: 带表头解析 + 缺 title 跳过', async () => {
  const raw = 'title,body,sourceUrl\n某爆款,开头钩子+观点,https://x.com/a\n,只有正文无标题,https://y.com';
  const { rows, skipped } = await parseMaterials(raw, 'csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, '某爆款');
  assert.equal(rows[0].body, '开头钩子+观点');
  assert.equal(rows[0].sourceUrl, 'https://x.com/a');
  assert.equal(skipped.length, 1);
});

test('parseMaterials CSV: 无表头按列序', async () => {
  const raw = '标题B,正文B,https://b.com';
  const { rows } = await parseMaterials(raw, 'csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, '标题B');
  assert.equal(rows[0].body, '正文B');
});

test('parseMaterials JSON: 数组 + 单对象(form) 均支持', async () => {
  const arr = JSON.stringify([{ title: 'A', body: 'a' }, { title: 'B', body: 'b' }]);
  const { rows: r1 } = await parseMaterials(arr, 'json');
  assert.equal(r1.length, 2);
  const single = JSON.stringify({ title: 'Solo', body: 's' });
  const { rows: r2 } = await parseMaterials(single, 'form');
  assert.equal(r2.length, 1);
  assert.equal(r2[0].title, 'Solo');
});

test('parseMaterials JSON: 非法 JSON 抛错', async () => {
  await assert.rejects(() => parseMaterials('{bad', 'json'), /JSON 解析失败/);
});

test('parseMaterials markdown: 按标题拆分 + 无标题整篇兜底', async () => {
  const md = '# 主标题\n忽略的前言\n## 第一款标题\n这是第一款的正文。\n## 第二款标题\n第二款正文。';
  const { rows } = await parseMaterials(md, 'markdown');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, '第一款标题');
  assert.match(rows[0].body, /这是第一款的正文/);
  assert.equal(rows[1].title, '第二款标题');
  const plain = await parseMaterials('就一段普通文字没有标题', 'markdown');
  assert.equal(plain.rows.length, 1);
});

test('parseMaterials lines: 标题 - 正文 / 标题：正文', async () => {
  const raw = '10万+标题写法 - 先抛冲突再给方法\n情绪文案：用第一人称更有代入感';
  const { rows } = await parseMaterials(raw, 'lines');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, '10万+标题写法');
  assert.equal(rows[0].body, '先抛冲突再给方法');
  assert.equal(rows[1].title, '情绪文案');
});

test('classifyMaterialCandidates: 库内命中 + 批次内重复 + 默认动作', () => {
  const libFp = computeFingerprint('库内素材', '内容L');
  const batchFp = computeFingerprint('批次素材', '内容B');
  const rows = [
    { title: '新素材', body: '新鲜内容' },
    { title: '库内素材', body: '内容L' }, // 命中库内
    { title: '批次素材', body: '内容B' }, // 批次内首现（new）
    { title: '批次素材', body: '内容B' }, // 批次内重复
  ];
  const existing = new Map([[libFp, 'ex-id-1']]);
  const c = classifyMaterialCandidates(rows, existing);
  assert.equal(c[0].status, 'new');
  assert.equal(c[0].action, 'create');
  assert.equal(c[1].status, 'duplicate');
  assert.equal(c[1].existingId, 'ex-id-1');
  assert.equal(c[1].reason, '与库内已有素材指纹相同');
  assert.equal(c[1].action, 'skip');
  assert.equal(c[2].status, 'new');
  assert.equal(c[2].action, 'create');
  assert.equal(c[3].status, 'duplicate');
  assert.equal(c[3].batchDuplicateOf, 2);
  assert.equal(c[3].reason, '批次内重复');
});

test('parseMaterials excel: 真实工作簿 base64 往返解析', async () => {
  const XLSX = await import('xlsx');
  const wsData = [
    { title: 'Excel标题1', body: 'Excel正文1', sourceUrl: 'https://e.com/1' },
    { title: 'Excel标题2', body: 'Excel正文2' },
  ];
  const ws = XLSX.utils.json_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const { rows } = await parseMaterials(base64, 'excel');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Excel标题1');
  assert.equal(rows[0].body, 'Excel正文1');
  assert.equal(rows[0].sourceUrl, 'https://e.com/1');
  assert.equal(rows[1].title, 'Excel标题2');
});
