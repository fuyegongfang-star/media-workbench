// T2.4 账号级汇总纯函数 + LLM 适配器单测（不依赖数据库/Redis/LLM 密钥）。
// 运行：node --test server/test/account-summary.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import prompt from '../dist/modules/analysis/analysis.prompt.js';
const {
  renderAccountSummaryMessages,
  parseStrategyDraftJson,
  normalizeStrategyDraft,
  DEFAULT_ACCOUNT_SUMMARY_USER_TEMPLATE,
} = prompt;

import providerMod from '../dist/modules/generation/openai-compatible.provider.js';
const { OpenAICompatibleProvider } = providerMod;

test('renderAccountSummaryMessages: 返回 system+user 且替换占位符', () => {
  const msgs = renderAccountSummaryMessages('我的号', [{ title: '素材A', summary: '摘要A' }]);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.ok(msgs[1].content.includes('我的号'));
  assert.ok(msgs[1].content.includes('素材A'));
  assert.ok(msgs[1].content.includes('摘要A'));
  assert.ok(!msgs[1].content.includes('{{'));
});

test('renderAccountSummaryMessages: 多条聚合与空列表兜底', () => {
  const multi = renderAccountSummaryMessages('号B', [
    { title: 'a', summary: 's1' },
    { title: 'b', summary: 's2' },
  ]);
  assert.ok(multi[1].content.includes('1. 【a】s1'));
  assert.ok(multi[1].content.includes('2. 【b】s2'));
  const empty = renderAccountSummaryMessages('号C', []);
  assert.ok(empty[1].content.includes('（无已选拆解结论）'));
});

test('renderAccountSummaryMessages: 空模板回退内置兜底', () => {
  const msgs = renderAccountSummaryMessages('X', [{ title: 't', summary: 's' }], '   ');
  assert.ok(msgs[1].content.includes(DEFAULT_ACCOUNT_SUMMARY_USER_TEMPLATE.slice(0, 8)));
});

test('parseStrategyDraftJson: 干净 JSON → draft 字段完整', () => {
  const r = parseStrategyDraftJson(
    '{"position":{"核心定位":"p"},"audience":{"人群":"u"},"pillars":["x","y"],"titlePref":{"风格":"f"},"structure":"结构范式","tone":{"调性":"t"},"boundaries":["红线"]}',
  );
  assert.ok(r.draft);
  assert.deepEqual(r.draft.position, { 核心定位: 'p' });
  assert.deepEqual(r.draft.pillars, ['x', 'y']);
  assert.equal(r.draft.structure, '结构范式');
  assert.deepEqual(r.draft.boundaries, ['红线']);
});

test('parseStrategyDraftJson: 去 ```json 围栏', () => {
  const r = parseStrategyDraftJson('```json\n{"position":{"a":1},"pillars":["p"]}\n```');
  assert.ok(r.draft);
  assert.deepEqual(r.draft.position, { a: 1 });
});

test('parseStrategyDraftJson: 前后散文也能抽取 JSON', () => {
  const r = parseStrategyDraftJson('结论如下：\n{"audience":{"c":"d"},"structure":"S"}\n以上');
  assert.ok(r.draft);
  assert.equal(r.draft.structure, 'S');
});

test('parseStrategyDraftJson: 缺失字段补默认值', () => {
  const r = parseStrategyDraftJson('{"position":{"x":1}}');
  assert.ok(r.draft);
  assert.deepEqual(r.draft.position, { x: 1 });
  assert.deepEqual(r.draft.pillars, []);
  assert.deepEqual(r.draft.boundaries, []);
  assert.equal(r.draft.structure, '');
  assert.deepEqual(r.draft.audience, {});
  assert.deepEqual(r.draft.tone, {});
});

test('parseStrategyDraftJson: 无法解析则兜底 rawText', () => {
  const r = parseStrategyDraftJson('模型抽风没有 JSON');
  assert.equal(r.rawText, '模型抽风没有 JSON');
});

test('parseStrategyDraftJson: 空串兜底 rawText 为空', () => {
  const r = parseStrategyDraftJson('');
  assert.equal(r.rawText, '');
});

test('normalizeStrategyDraft: 字符串→数组 / 数组→数组 / 对象保持 / 默认值', () => {
  const d = normalizeStrategyDraft({
    position: { a: 1 },
    pillars: '单条',
    boundaries: ['b1'],
    structure: { k: 'v' },
    tone: [1, 2], // 数组→当作空对象兜底
    audience: null,
  });
  assert.deepEqual(d.position, { a: 1 });
  assert.deepEqual(d.pillars, ['单条']);
  assert.deepEqual(d.boundaries, ['b1']);
  assert.equal(typeof d.structure, 'string');
  assert.deepEqual(d.audience, {});
  assert.deepEqual(d.tone, {});
});

// ---- 全链路（mock fetch）：渲染 → provider.chat → 解析 → 规范化 ----
test('全链路：mock provider 返回策略 JSON，解析出规范化草稿', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content:
              '```json\n{"position":{"核心定位":"定位"},"pillars":["栏目1"],"structure":"范式","boundaries":["红线"]}\n```',
          },
        },
      ],
      usage: { prompt_tokens: 7, completion_tokens: 20 },
    }),
  });
  const p = new OpenAICompatibleProvider({ baseUrl: 'https://api.example.com/v1/', apiKey: 'sk', model: 'm' });
  const messages = renderAccountSummaryMessages('号', [{ title: 't', summary: 's' }]);
  const res = await p.chat(messages, { model: 'm' });
  const parsed = parseStrategyDraftJson(res.text);
  assert.ok(parsed.draft);
  assert.deepEqual(parsed.draft.position, { 核心定位: '定位' });
  assert.deepEqual(parsed.draft.pillars, ['栏目1']);
  assert.equal(parsed.draft.structure, '范式');
});
