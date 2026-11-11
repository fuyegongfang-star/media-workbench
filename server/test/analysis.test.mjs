// T2.3 单篇拆解纯函数 + LLM 适配器单测（不依赖数据库/Redis/LLM 密钥）。
// 运行：node --test server/test/analysis.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import prompt from '../dist/modules/analysis/analysis.prompt.js';
const { renderAnalysisMessages, parseAnalysisJson, DEFAULT_SINGLE_ANALYSIS_USER_TEMPLATE } = prompt;

import providerMod from '../dist/modules/generation/openai-compatible.provider.js';
const { OpenAICompatibleProvider } = providerMod;

test('renderAnalysisMessages: 返回 system+user 且替换占位符', () => {
  const msgs = renderAnalysisMessages({ title: 'T1', body: 'B1' });
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.ok(msgs[1].content.includes('T1'));
  assert.ok(msgs[1].content.includes('B1'));
  assert.ok(!msgs[1].content.includes('{{'));
});

test('renderAnalysisMessages: 使用自定义模板替换占位符', () => {
  const msgs = renderAnalysisMessages({ title: 'X', body: 'Y' }, '标题={{title}} 正文={{body}}');
  assert.ok(msgs[1].content.includes('标题=X'));
  assert.ok(msgs[1].content.includes('正文=Y'));
});

test('renderAnalysisMessages: 空模板回退内置兜底', () => {
  const msgs = renderAnalysisMessages({ title: 'A', body: 'B' }, '   ');
  assert.ok(msgs[1].content.includes(DEFAULT_SINGLE_ANALYSIS_USER_TEMPLATE.slice(0, 8)));
});

test('parseAnalysisJson: 干净 JSON 对象', () => {
  const r = parseAnalysisJson('{"theme":"x","hooks":["a"]}');
  assert.equal(r.theme, 'x');
  assert.deepEqual(r.hooks, ['a']);
});

test('parseAnalysisJson: 去掉 ```json 围栏', () => {
  const r = parseAnalysisJson('```json\n{"theme":"y"}\n```');
  assert.equal(r.theme, 'y');
});

test('parseAnalysisJson: 前后有散文也能抽取 JSON', () => {
  const r = parseAnalysisJson('好的，结果如下：\n{"theme":"z","tone":"专业"}\n以上为拆解');
  assert.equal(r.theme, 'z');
  assert.equal(r.tone, '专业');
});

test('parseAnalysisJson: 无法解析则兜底 rawText', () => {
  const r = parseAnalysisJson('这模型抽风了没有 JSON');
  assert.equal(r.rawText, '这模型抽风了没有 JSON');
});

test('parseAnalysisJson: 空串兜底 rawText 为空', () => {
  const r = parseAnalysisJson('');
  assert.equal(r.rawText, '');
});

// ---- OpenAICompatibleProvider：用 mock fetch 验证 HTTP 契约（不联网） ----
test('OpenAICompatibleProvider.chat: 解析 OpenAI 响应 + 用量', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"theme":"demo"}' } }],
        usage: { prompt_tokens: 5, completion_tokens: 12 },
      }),
    };
  };
  const p = new OpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1/',
    apiKey: 'sk-secret',
    model: 'gpt-demo',
  });
  const res = await p.chat([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }], {
    model: 'gpt-demo',
  });
  assert.equal(res.text, '{"theme":"demo"}');
  assert.deepEqual(res.usage, { prompt: 5, completion: 12 });
  assert.ok(calls[0].url.endsWith('/chat/completions'));
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls[0].init.headers.Authorization.startsWith('Bearer '));
});

test('OpenAICompatibleProvider.chat: 去掉 baseUrl 末尾斜杠并拼出正确 URL', async () => {
  let calledUrl = '';
  globalThis.fetch = async (url) => {
    calledUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    };
  };
  const p = new OpenAICompatibleProvider({ baseUrl: 'https://x.com/v1/', apiKey: 'k', model: 'm' });
  await p.chat([{ role: 'user', content: 'hi' }], {});
  assert.equal(calledUrl, 'https://x.com/v1/chat/completions');
});

test('OpenAICompatibleProvider.chat: 非 200 抛清晰错误', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  const p = new OpenAICompatibleProvider({ baseUrl: 'https://api.example.com/v1', apiKey: 'x', model: 'm' });
  await assert.rejects(() => p.chat([{ role: 'user', content: 'hi' }], {}), /HTTP 401/);
});
