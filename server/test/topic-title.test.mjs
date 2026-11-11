// T3.1 选题/标题生成：纯函数 + LLM 适配器单测（不依赖数据库/Redis/LLM 密钥）。
// 运行：node --test server/test/topic-title.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import prompt from '../dist/modules/content/generation/topic-title.prompt.js';
const {
  renderTopicGenMessages,
  parseTopics,
  normalizeTopicDraft,
  renderTitleGenMessages,
  parseTitleCandidates,
  normalizeTitleDraft,
  summarizeStrategy,
  clampCount,
} = prompt;

import providerMod from '../dist/modules/generation/openai-compatible.provider.js';
const { OpenAICompatibleProvider } = providerMod;

// ---------------- clampCount ----------------
test('clampCount: 缺省与边界', () => {
  assert.equal(clampCount(undefined, 5), 5);
  assert.equal(clampCount(0, 5), 5); // 非正数 → 回落默认
  assert.equal(clampCount(-3, 5), 5); // 非正数 → 回落默认
  assert.equal(clampCount(8, 5), 8);
  assert.equal(clampCount(999, 5), 20); // 上限 20
  assert.equal(clampCount('3', 5), 3);
});

// ---------------- summarizeStrategy ----------------
test('summarizeStrategy: 拼装字段 / 空兜底', () => {
  const s = {
    position: { 核心定位: 'x' },
    audience: { 人群: 'y' },
    pillars: ['a', 'b'],
    titlePref: { 风格: 'c' },
    structure: 'S',
    tone: { 调性: 't' },
    boundaries: ['红线'],
  };
  const out = summarizeStrategy(s);
  assert.ok(out.includes('定位：')); // 对象会被 JSON.stringify
  assert.ok(out.includes('栏目支柱：a、b'));
  assert.ok(out.includes('结构：S'));
  assert.ok(out.includes('边界：红线'));
  assert.equal(summarizeStrategy({}), '（策略为空）');
});

// ---------------- renderTopicGenMessages ----------------
test('renderTopicGenMessages: system+user 且替换占位符', () => {
  const msgs = renderTopicGenMessages(
    { strategySummary: '策略A', analysisSummary: '分析B', count: 6 },
    '产出{{count}}个\n{{strategySummary}}\n{{analysisSummary}}',
  );
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.ok(msgs[1].content.includes('6'));
  assert.ok(msgs[1].content.includes('策略A'));
  assert.ok(msgs[1].content.includes('分析B'));
  assert.ok(!msgs[1].content.includes('{{'));
});

test('renderTopicGenMessages: 空上下文兜底 + 默认模板', () => {
  const msgs = renderTopicGenMessages({});
  assert.ok(msgs[1].content.includes('（暂无策略）'));
  assert.ok(msgs[1].content.includes('（暂无对标分析）'));
});

// ---------------- parseTopics ----------------
test('parseTopics: 裸数组 → TopicDraft[]', () => {
  const r = parseTopics('[{"title":"选题1","tags":["t1"]},{"title":"选题2","angle":"角度"}]');
  assert.equal(r.topics.length, 2);
  assert.equal(r.topics[0].title, '选题1');
  assert.deepEqual(r.topics[0].tags, ['t1']);
  assert.equal(r.topics[1].angle, '角度');
});

test('parseTopics: 去 ```json 围栏 与前后散文', () => {
  const r = parseTopics('以下是选题：\n```json\n[{"title":"A","tags":"单标签"},{"title":"B"}]\n```\n完毕');
  assert.equal(r.topics.length, 2);
  assert.deepEqual(r.topics[0].tags, ['单标签']); // 字符串→数组
});

test('parseTopics: {topics:[...]} 包裹', () => {
  const r = parseTopics('{"topics":[{"title":"X"}]}');
  assert.equal(r.topics.length, 1);
  assert.equal(r.topics[0].title, 'X');
});

test('parseTopics: 缺标题的条目被丢弃', () => {
  const r = parseTopics('[{"title":""},{"title":"有效"}]');
  assert.equal(r.topics.length, 1);
  assert.equal(r.topics[0].title, '有效');
});

test('parseTopics: 无法解析 → 兜底 rawText', () => {
  const r = parseTopics('模型罢工');
  assert.equal(r.topics.length, 0);
  assert.equal(r.rawText, '模型罢工');
});

// ---------------- normalizeTopicDraft ----------------
test('normalizeTopicDraft: 空标题返回 null', () => {
  assert.equal(normalizeTopicDraft({ title: '   ' }), null);
  assert.equal(normalizeTopicDraft({}), null);
});

// ---------------- renderTitleGenMessages ----------------
test('renderTitleGenMessages: 替换全部占位符', () => {
  const msgs = renderTitleGenMessages(
    { topicTitle: '我的选题', topicAngle: '角度X', strategySummary: '策略Y', count: 10 },
    '{{count}}|{{topicTitle}}|{{topicAngle}}|{{strategySummary}}',
  );
  assert.ok(msgs[1].content.includes('10'));
  assert.ok(msgs[1].content.includes('我的选题'));
  assert.ok(msgs[1].content.includes('角度X'));
  assert.ok(msgs[1].content.includes('策略Y'));
  assert.ok(!msgs[1].content.includes('{{'));
});

// ---------------- parseTitleCandidates ----------------
test('parseTitleCandidates: 数组 → TitleDraft[]', () => {
  const r = parseTitleCandidates('[{"text":"标题1","score":9,"basis":"卖点"},{"text":"标题2"}]');
  assert.equal(r.titles.length, 2);
  assert.equal(r.titles[0].text, '标题1');
  assert.equal(r.titles[0].score, 9);
  assert.equal(r.titles[0].basis, '卖点');
});

test('parseTitleCandidates: {titles:[...]} 包裹 + 围栏', () => {
  const r = parseTitleCandidates('```json\n{"titles":[{"text":"A"},{"text":"B"}]}\n```');
  assert.equal(r.titles.length, 2);
});

test('parseTitleCandidates: 缺 text 丢弃 / 无法解析兜底', () => {
  assert.equal(parseTitleCandidates('[{"text":""}]').titles.length, 0);
  const r = parseTitleCandidates('gg');
  assert.equal(r.titles.length, 0);
  assert.equal(r.rawText, 'gg');
});

// ---------------- 全链路（mock fetch）----------------
test('全链路：mock provider 返回选题数组，解析出选题', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content:
              '```json\n[{"title":"选题A","audience":"人群","angle":"钩子","tags":["t1","t2"]},{"title":"选题B"}]\n```',
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 40 },
    }),
  });
  const p = new OpenAICompatibleProvider({ baseUrl: 'https://api.example.com/v1/', apiKey: 'sk', model: 'm' });
  const messages = renderTopicGenMessages({ strategySummary: 'S', analysisSummary: 'A', count: 2 });
  const res = await p.chat(messages, { model: 'm' });
  const parsed = parseTopics(res.text);
  assert.equal(parsed.topics.length, 2);
  assert.equal(parsed.topics[0].title, '选题A');
  assert.deepEqual(parsed.topics[0].tags, ['t1', 't2']);
});

test('全链路：mock provider 返回标题数组，解析出标题', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: '[{"text":"标题A","score":8},{"text":"标题B","tags":["x"]}]' } }],
      usage: { prompt_tokens: 5, completion_tokens: 18 },
    }),
  });
  const p = new OpenAICompatibleProvider({ baseUrl: 'https://api.example.com/v1/', apiKey: 'sk', model: 'm' });
  const messages = renderTitleGenMessages({ topicTitle: '选题', count: 2 });
  const res = await p.chat(messages, { model: 'm' });
  const parsed = parseTitleCandidates(res.text);
  assert.equal(parsed.titles.length, 2);
  assert.equal(parsed.titles[0].text, '标题A');
  assert.equal(parsed.titles[0].score, 8);
  assert.deepEqual(parsed.titles[1].tags, ['x']);
});
