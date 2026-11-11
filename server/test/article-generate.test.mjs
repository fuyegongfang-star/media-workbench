// T3.5 文章生成提示词与解析纯函数单测（不依赖数据库/Redis/LLM 密钥）。
// 运行：node --test server/test/article-generate.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import prompt from '../dist/modules/content/generation/article.prompt.js';
const {
  renderArticleDraftMessages,
  renderArticleEditMessages,
  parseArticleText,
  ARTICLE_EDIT_ACTIONS,
  DEFAULT_ARTICLE_DRAFT_USER_TEMPLATE,
  DEFAULT_ARTICLE_EDIT_USER_TEMPLATE,
} = prompt;

const ctx = {
  title: '如何做好内容运营',
  titleBasis: '基于用户调研',
  topicTitle: '内容运营方法论',
  topicAudience: '新媒体从业者',
  topicAngle: '实操导向',
  topicTags: '运营、增长',
  strategySummary: '定位：专业可信',
  analysisSummary: '{"theme":"增长"}',
  currentContent: '这是现有正文。',
  action: '在现有正文基础上自然续写。',
};

test('renderArticleDraftMessages: 返回 system+user 且替换占位符', () => {
  const msgs = renderArticleDraftMessages(ctx);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.ok(msgs[1].content.includes('如何做好内容运营'));
  assert.ok(msgs[1].content.includes('内容运营方法论'));
  assert.ok(msgs[1].content.includes('专业可信'));
  assert.ok(!msgs[1].content.includes('{{'));
});

test('renderArticleDraftMessages: 自定义模板替换占位符', () => {
  const msgs = renderArticleDraftMessages(ctx, '标题={{title}} 摘要={{analysisSummary}}');
  assert.ok(msgs[1].content.includes('标题=如何做好内容运营'));
  assert.ok(msgs[1].content.includes('摘要={"theme":"增长"}'));
  assert.ok(!msgs[1].content.includes('{{'));
});

test('renderArticleDraftMessages: 空模板回退内置兜底', () => {
  const msgs = renderArticleDraftMessages(ctx, '   ');
  assert.ok(msgs[1].content.includes(DEFAULT_ARTICLE_DRAFT_USER_TEMPLATE.slice(0, 10)));
});

test('renderArticleDraftMessages: 缺失字段降级为占位文案（不抛异常）', () => {
  const msgs = renderArticleDraftMessages({
    title: '',
    titleBasis: null,
    topicTitle: '',
    topicAudience: null,
    topicAngle: null,
    topicTags: '',
    strategySummary: '',
    analysisSummary: '',
    currentContent: '',
    action: '',
  });
  assert.ok(msgs[1].content.includes('（暂无策略）'));
  assert.ok(msgs[1].content.includes('（暂无对标分析）'));
});

test('renderArticleEditMessages: 替换 title/currentContent/action 且含动作指令', () => {
  const msgs = renderArticleEditMessages(ctx);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.ok(msgs[1].content.includes('如何做好内容运营'));
  assert.ok(msgs[1].content.includes('这是现有正文。'));
  assert.ok(msgs[1].content.includes('在现有正文基础上自然续写'));
  assert.ok(!msgs[1].content.includes('{{'));
});

test('renderArticleEditMessages: 自定义模板替换占位符', () => {
  const msgs = renderArticleEditMessages(ctx, '正文={{currentContent}} 动作={{action}}');
  assert.ok(msgs[1].content.includes('正文=这是现有正文。'));
  assert.ok(msgs[1].content.includes('动作=在现有正文基础上自然续写。'));
});

test('renderArticleEditMessages: 空模板回退内置兜底', () => {
  const msgs = renderArticleEditMessages(ctx, '   ');
  assert.ok(msgs[1].content.includes('请执行以下动作：'));
});

test('parseArticleText: 干净正文原样返回', () => {
  assert.equal(parseArticleText('# 标题\n正文内容'), '# 标题\n正文内容');
});

test('parseArticleText: 去除 ```markdown 围栏', () => {
  const raw = '```markdown\n# 标题\n正文\n```';
  assert.equal(parseArticleText(raw), '# 标题\n正文');
});

test('parseArticleText: 去除无语言标记的 ``` 围栏', () => {
  const raw = '```\n正文\n```';
  assert.equal(parseArticleText(raw), '正文');
});

test('parseArticleText: 空/纯空白返回空串', () => {
  assert.equal(parseArticleText(''), '');
  assert.equal(parseArticleText('   \n  '), '');
});

test('ARTICLE_EDIT_ACTIONS: 覆盖 continue/rewrite/compress/expand 四动作', () => {
  assert.deepEqual(Object.keys(ARTICLE_EDIT_ACTIONS).sort(), [
    'compress',
    'continue',
    'expand',
    'rewrite',
  ]);
  assert.ok(ARTICLE_EDIT_ACTIONS.continue.includes('续写'));
  assert.ok(ARTICLE_EDIT_ACTIONS.rewrite.includes('重写'));
  assert.ok(ARTICLE_EDIT_ACTIONS.compress.includes('压缩'));
  assert.ok(ARTICLE_EDIT_ACTIONS.expand.includes('扩写'));
});
