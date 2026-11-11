// T3.11 合规预审纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/compliance.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import dict from '../dist/modules/content/compliance/compliance-dictionary.js';
const { defaultComplianceDictionary, DICTIONARY_VERSION } = dict;
import util from '../dist/modules/content/compliance/compliance.util.js';
const {
  scanCompliance,
  summarizeCompliance,
  renderHighlight,
  mergeCustomWords,
  buildComplianceSummaryText,
} = util;

const D = defaultComplianceDictionary();

test('defaultComplianceDictionary: 含 blocking 与 warning 分级词', () => {
  assert.ok(Array.isArray(D) && D.length > 0, '词典非空');
  assert.ok(D.some((w) => w.severity === 'blocking'), '存在 blocking 词（硬卡点）');
  assert.ok(D.some((w) => w.severity === 'warning'), '存在 warning 词（仅提示）');
  assert.equal(DICTIONARY_VERSION, '1');
});

test('scanCompliance: 检出 blocking 极限词并给出正确位置', () => {
  const text = '本产品为国家级最佳选择，销量第一。';
  const matches = scanCompliance(text, D);
  const words = matches.map((m) => m.word);
  assert.ok(words.includes('国家级'), '应命中 国家级');
  assert.ok(words.includes('最佳'), '应命中 最佳');
  assert.ok(words.includes('销量第一'), '应命中 销量第一');
  // 位置校验：'国家级' 在索引 5 起
  const gj = matches.find((m) => m.word === '国家级');
  assert.equal(text.slice(gj.start, gj.end), '国家级');
  assert.equal(gj.severity, 'blocking');
});

test('scanCompliance: 同一词多次出现均记录（标红每一处）', () => {
  const text = '最佳方案，最佳选择，最佳体验';
  const matches = scanCompliance(text, D);
  const best = matches.filter((m) => m.word === '最佳');
  assert.equal(best.length, 3, '“最佳”出现 3 次应记录 3 条');
});

test('scanCompliance: 大小写不敏感（英文/数字混合词 100%）', () => {
  const text = '效果提升 100% 确定';
  const matches = scanCompliance(text, D);
  assert.ok(matches.some((m) => m.word === '100%'), '应命中 100%');
});

test('scanCompliance: 重叠词只保留正确匹配（最顶级 ⊃ 顶级）', () => {
  const text = '这是最顶级的产品';
  const matches = scanCompliance(text, D);
  const words = matches.map((m) => m.word);
  assert.ok(words.includes('最顶级'), '应命中 最顶级');
  // 不应产生重复/错位的 顶级 片段导致渲染异常
  const hl = renderHighlight(text, matches);
  assert.ok(hl.length >= 1);
});

test('summarizeCompliance: blocking 存在则 passed=false 且 maxSeverity=blocking', () => {
  const m = scanCompliance('国家级推荐', D);
  const s = summarizeCompliance(m);
  assert.equal(s.passed, false);
  assert.equal(s.blockingCount, 1);
  assert.equal(s.maxSeverity, 'blocking');
});

test('summarizeCompliance: 仅 warning 时 passed=true、maxSeverity=warning', () => {
  // 仅命中 warning 词（如“最大”）的场景
  const warnOnly = D.filter((w) => w.severity === 'warning');
  const m = scanCompliance('这是最大的容量', warnOnly);
  const s = summarizeCompliance(m);
  assert.equal(s.passed, true, '仅 warning 不阻断（passed）');
  assert.equal(s.blockingCount, 0);
  assert.equal(s.maxSeverity, 'warning');
});

test('summarizeCompliance: 空文本无风险', () => {
  const s = summarizeCompliance(scanCompliance('', D));
  assert.equal(s.passed, true);
  assert.equal(s.riskCount, 0);
  assert.equal(s.maxSeverity, null);
});

test('renderHighlight: 标红分段正确切分命中区间', () => {
  const text = '我们是最佳品牌';
  const matches = scanCompliance(text, D);
  const hl = renderHighlight(text, matches);
  const hit = hl.filter((s) => s.hit);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].text, '最佳');
  assert.equal(hit[0].severity, 'blocking');
  // 拼接还原原文
  assert.equal(hl.map((s) => s.text).join(''), text);
});

test('renderHighlight: 空文本返回空数组（安全）', () => {
  assert.deepEqual(renderHighlight('', []), []);
});

test('mergeCustomWords: 自定义词合并且不重复', () => {
  const merged = mergeCustomWords(D, [{ word: '自定违禁词', category: 'sensitive', severity: 'blocking', suggestion: 'x' }]);
  assert.ok(merged.some((w) => w.word === '自定违禁词'));
  // 内置词仍保留
  assert.ok(merged.some((w) => w.word === '国家级'));
});

test('buildComplianceSummaryText: 无风险与有风险摘要', () => {
  assert.ok(buildComplianceSummaryText('普通正文无风险', []).includes('未检出'));
  const m = scanCompliance('国家级产品', D);
  assert.ok(buildComplianceSummaryText('国家级产品', m).includes('阻断'));
});
