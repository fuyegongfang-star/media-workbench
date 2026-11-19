// T3.7 朱雀检测 / 第三方润色 单测（不依赖数据库）：node --test server/test/text-review.test.mjs
// 覆盖：纯函数归一化 + 朱雀检测 Provider HTTP 契约 + LLM 润色/检测 Provider 解析。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/content/detection/text-review.util.js';
const { normalizeDetectResult, isStaleReview, validateDecision } = util;

import prov from '../dist/modules/generation/detect-polish-provider.service.js';
const {
  ZhuqueDetectProvider,
  LlmDetectProvider,
  LlmPolishProvider,
  extractPolishText,
  splitTextForPolish,
  polishMaxTokens,
} = prov;

// ---------- 纯函数 ----------

test('normalizeDetectResult: 朱雀 shape（summary + version）', () => {
  const r = normalizeDetectResult({ summary: '疑似 AI 生成', aiProb: 0.95, version: 'v1' });
  assert.equal(r.summary, '疑似 AI 生成');
  assert.equal(r.serviceVersion, 'v1');
});

test('normalizeDetectResult: LLM shape 无 summary 时用分值拼摘要', () => {
  const r = normalizeDetectResult({ aiScore: 0.3, risks: ['冗余', '口语化'] });
  assert.match(r.summary, /AI 评分/);
  assert.match(r.summary, /冗余/);
});

test('normalizeDetectResult: 0~100 分与 0~1 分都能正确折算', () => {
  assert.match(normalizeDetectResult({ score: 80 }).summary, /80%/);
  assert.match(normalizeDetectResult({ probability: 0.12 }).summary, /12%/);
});

test('isStaleReview: 旧版本结果判定', () => {
  assert.equal(isStaleReview('v1', 'v2'), true);
  assert.equal(isStaleReview('v1', 'v1'), false);
  assert.equal(isStaleReview('v1', null), false);
});

test('validateDecision: 合法 / 非法取值', () => {
  assert.deepEqual(validateDecision('accepted'), { ok: true, value: 'accepted' });
  assert.deepEqual(validateDecision('flagged'), { ok: true, value: 'flagged' });
  assert.equal(validateDecision('bad').ok, false);
  assert.equal(validateDecision(123).ok, false);
});

test('extractPolishText: 去 ``` 围栏与首尾包裹引号', () => {
  assert.equal(extractPolishText('```markdown\n润色后正文\n```'), '润色后正文');
  assert.equal(extractPolishText('"润色后正文"'), '润色后正文');
  assert.equal(extractPolishText('“润色后正文”'), '润色后正文');
});

// ---------- 朱雀检测 Provider（HTTP 契约） ----------

test('ZhuqueDetectProvider: 解析响应并校验请求 URL / 鉴权头', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ summary: '疑似 AI 生成', aiProb: 0.95, version: 'zq-1' }) };
  };
  try {
    const p = new ZhuqueDetectProvider({ baseUrl: 'https://detect.example/v1/detect/', apiKey: 'secret', model: 'zq' });
    const r = await p.detect('正文内容', 'vid-1');
    assert.equal(calls[0].url, 'https://detect.example/v1/detect');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer secret');
    assert.equal(r.summary, '疑似 AI 生成');
    assert.equal(r.serviceVersion, 'zq-1');
    assert.equal(r.raw.summary, '疑似 AI 生成');
  } finally {
    globalThis.fetch = orig;
  }
});

test('ZhuqueDetectProvider: 非 2xx 抛清晰错误（不伪造成功）', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  try {
    const p = new ZhuqueDetectProvider({ baseUrl: 'https://x/y', apiKey: 'k', model: 'm' });
    await p.detect('t', 'v');
    assert.fail('应抛出 HTTP 401 错误');
  } catch (e) {
    assert.match(e.message, /HTTP 401/);
  } finally {
    globalThis.fetch = orig;
  }
});

test('ZhuqueDetectProvider: 未配置 baseUrl 抛错', async () => {
  const p = new ZhuqueDetectProvider({ baseUrl: '', apiKey: 'k', model: 'm' });
  await assert.rejects(() => p.detect('t', 'v'), /baseUrl/);
});

// ---------- LLM 润色 Provider ----------

test('LlmPolishProvider: 直接返回润色文本', async () => {
  const fakeLlm = { chat: async () => ({ text: '润色后正文' }) };
  const p = new LlmPolishProvider(fakeLlm, 'm');
  const r = await p.polish('原文', {});
  assert.equal(r.revised, '润色后正文');
});

test('LlmPolishProvider: 模型用围栏包裹时仍可提取正文', async () => {
  const fakeLlm = { chat: async () => ({ text: '```\n润色后正文\n```' }) };
  const p = new LlmPolishProvider(fakeLlm, 'm');
  const r = await p.polish('原文', { tone: '更口语化' });
  assert.equal(r.revised, '润色后正文');
});

test('splitTextForPolish: 短文本原样返回单段', () => {
  const chunks = splitTextForPolish('这是一段短文。', 1800);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], '这是一段短文。');
});

test('splitTextForPolish: 长文本按段落切分且每段不超上限', () => {
  const para = '内容'.repeat(500); // 1000 字符一段
  const text = Array.from({ length: 8 }, () => para).join('\n\n');
  const chunks = splitTextForPolish(text, 1800);
  assert.ok(chunks.length >= 4, `应切成多段，实际 ${chunks.length}`);
  for (const c of chunks) assert.ok(c.length <= 1800 + 50, `单段 ${c.length} 不应超上限`);
  // 内容不丢失（忽略分隔空白）
  assert.equal(chunks.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
});

test('splitTextForPolish: 超长单段落按句末标点兜底切分', () => {
  const sentence = '这是一句完整的话。';
  const text = sentence.repeat(400); // 3600 字符，无空行
  const chunks = splitTextForPolish(text, 1800);
  assert.ok(chunks.length >= 2, `超长单段应被切开，实际 ${chunks.length}`);
  for (const c of chunks) assert.ok(c.length <= 1800 + 20, `单句切分块 ${c.length} 不应超上限`);
});

test('polishMaxTokens: 动态上限保底 600 / 硬顶 3000', () => {
  assert.equal(polishMaxTokens(10), 600);
  assert.equal(polishMaxTokens(1000), 1400);
  assert.equal(polishMaxTokens(10000), 3000);
});

test('LlmPolishProvider: 长文分段调用，单次输入/输出上限受控（不触发 token 超限）', async () => {
  const calls = [];
  const fakeLlm = {
    chat: async (messages, opts) => {
      calls.push({ userLen: messages[1].content.length, maxTokens: opts.maxTokens });
      return { text: `润色片段${calls.length}` };
    },
  };
  const p = new LlmPolishProvider(fakeLlm, 'm');
  const para = '内容'.repeat(500); // 1000 字符一段
  const text = Array.from({ length: 8 }, () => para).join('\n\n');
  const r = await p.polish(text, {});
  assert.ok(calls.length >= 4, '长文应触发多次分段调用');
  for (const c of calls) {
    assert.ok(c.maxTokens <= 3000, `单次 maxTokens ${c.maxTokens} 不应超过 3000`);
    assert.ok(c.userLen < 1900, `单次输入 ${c.userLen} 不应塞入整篇正文`);
  }
  assert.ok(r.revised.includes('润色片段'), '结果应拼接各段润色输出');
});

// ---------- LLM 检测 Provider ----------

test('LlmDetectProvider: 解析模型 JSON 检测输出', async () => {
  const fakeLlm = { chat: async () => ({ text: '```json\n{"aiScore":0.5,"summary":"中等风险"}\n```' }) };
  const p = new LlmDetectProvider(fakeLlm, 'm');
  const r = await p.detect('正文', 'vid-1');
  assert.equal(r.summary, '中等风险');
  assert.equal(typeof r.raw, 'object');
});

test('LlmDetectProvider: 模型返回非 JSON 时不崩溃，回退原始文本摘要', async () => {
  const fakeLlm = { chat: async () => ({ text: '无法判断' }) };
  const p = new LlmDetectProvider(fakeLlm, 'm');
  const r = await p.detect('正文', 'vid-1');
  assert.ok(r.summary.length > 0);
  assert.equal(r.raw.rawText, '无法判断');
});
