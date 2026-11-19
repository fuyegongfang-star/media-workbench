// T3.2 内容项目继承上下文纯函数单测（不依赖数据库/LLM 密钥）。
// 运行：node --test server/test/content-project.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/content/project/content-project.util.js';
const { buildContentContext, resolveProjectTarget, shapeProjectContext, nextVersionNo, versionSourceLabel, buildProjectListQuery } = util;

test('resolveProjectTarget: 选题策略可解析到账号 → ok 且返回归属', () => {
  const r = resolveProjectTarget({
    topicStrategyId: 's1',
    strategy: { id: 's1', ownedAccountId: 'acc1' },
  });
  assert.equal(r.ok, true);
  assert.equal(r.ownedAccountId, 'acc1');
  assert.equal(r.strategyVersionId, 's1');
});

test('resolveProjectTarget: 选题无策略 → ok=false', () => {
  const r = resolveProjectTarget({ topicStrategyId: null, strategy: null });
  assert.equal(r.ok, false);
  assert.equal(r.ownedAccountId, null);
});

test('resolveProjectTarget: 策略 id 不匹配选题 → ok=false（防张冠李戴）', () => {
  const r = resolveProjectTarget({
    topicStrategyId: 's1',
    strategy: { id: 's2', ownedAccountId: 'acc1' },
  });
  assert.equal(r.ok, false);
});

test('resolveProjectTarget: 策略存在但无归属账号 → ok=false', () => {
  const r = resolveProjectTarget({
    topicStrategyId: 's1',
    strategy: { id: 's1', ownedAccountId: '' },
  });
  assert.equal(r.ok, false);
});

test('resolveProjectTarget: 无策略选题 + 兜底账号 → ok，归到指定账号并继承默认策略', () => {
  const r = resolveProjectTarget({
    topicStrategyId: null,
    strategy: null,
    accountId: 'acc-radar',
    accountDefaultStrategyId: 's-default',
  });
  assert.equal(r.ok, true);
  assert.equal(r.ownedAccountId, 'acc-radar');
  assert.equal(r.strategyVersionId, 's-default');
  assert.equal(r.source, 'account');
});

test('resolveProjectTarget: 无策略 + 账号无默认策略 → ok，strategyVersionId 为 null', () => {
  const r = resolveProjectTarget({ topicStrategyId: null, accountId: 'acc-2' });
  assert.equal(r.ok, true);
  assert.equal(r.ownedAccountId, 'acc-2');
  assert.equal(r.strategyVersionId, null);
});

test('resolveProjectTarget: 无策略也无兜底账号 → ok=false（后端再给可操作提示）', () => {
  const r = resolveProjectTarget({ topicStrategyId: null, accountId: null });
  assert.equal(r.ok, false);
});

test('resolveProjectTarget: 已绑定策略优先于兜底账号（风格基线不丢）', () => {
  const r = resolveProjectTarget({
    topicStrategyId: 's1',
    strategy: { id: 's1', ownedAccountId: 'acc1' },
    accountId: 'acc-other',
    accountDefaultStrategyId: 's-other',
  });
  assert.equal(r.ok, true);
  assert.equal(r.ownedAccountId, 'acc1');
  assert.equal(r.strategyVersionId, 's1');
  assert.equal(r.source, 'strategy');
});

test('buildContentContext: 含标题/选题/摘要且为空时兜底空串', () => {
  const ctx = buildContentContext({
    titleText: '标题A',
    topicTitle: '选题B',
    topicAudience: '受众C',
    topicAngle: '角度D',
    topicTags: ['x', 'y'],
    strategySummary: '策略摘要',
    analysisSummary: '分析摘要',
  });
  assert.equal(ctx.title, '标题A');
  assert.deepEqual(ctx.topic, { title: '选题B', audience: '受众C', angle: '角度D', tags: ['x', 'y'] });
  assert.equal(ctx.strategySummary, '策略摘要');
  assert.equal(ctx.analysisSummary, '分析摘要');
});

test('buildContentContext: 缺省字段兜底为 null/空串/空数组', () => {
  const ctx = buildContentContext({ titleText: 'T', topicTitle: 'TP' });
  assert.equal(ctx.titleBasis, null);
  assert.equal(ctx.strategySummary, '');
  assert.equal(ctx.analysisSummary, '');
  assert.deepEqual(ctx.topic.tags, []);
});

// ---------- T3.3 shapeProjectContext（创作上下文面板形状）----------

test('shapeProjectContext: 由快照+实时关系投影整形成面板数据', () => {
  const ctx = shapeProjectContext({
    account: { id: 'acc1', name: '我的公众号' },
    strategy: { id: 's1', version: 3 },
    promptTemplate: { id: 'pt1', version: 2 },
    snapshot: {
      title: '标题A',
      titleBasis: '依据B',
      topic: { title: '选题B', audience: '受众C', angle: '角度D', tags: ['x', 'y'] },
      strategySummary: '策略摘要',
      analysisSummary: '分析摘要',
    },
  });
  assert.equal(ctx.account?.name, '我的公众号');
  assert.equal(ctx.title?.text, '标题A');
  assert.equal(ctx.title?.basis, '依据B');
  assert.equal(ctx.topic?.title, '选题B');
  assert.equal(ctx.topic?.audience, '受众C');
  assert.deepEqual(ctx.topic?.tags, ['x', 'y']);
  assert.equal(ctx.strategy?.version, 3);
  assert.equal(ctx.strategy?.summary, '策略摘要');
  assert.equal(ctx.promptTemplate?.version, 2);
  assert.equal(ctx.analysisSummary, '分析摘要');
});

test('shapeProjectContext: 缺失账号/策略/模板与空快照 → 降级为 null/空串', () => {
  const ctx = shapeProjectContext({ account: null, strategy: null, promptTemplate: null, snapshot: null });
  assert.equal(ctx.account, null);
  assert.equal(ctx.title, null);
  assert.equal(ctx.topic, null);
  assert.equal(ctx.strategy, null);
  assert.equal(ctx.promptTemplate, null);
  assert.equal(ctx.analysisSummary, '');
});

test('shapeProjectContext: 快照仅标题、无摘要 → title 有值、summary 为空', () => {
  const ctx = shapeProjectContext({
    account: null,
    strategy: null,
    promptTemplate: null,
    snapshot: { title: '仅标题' },
  });
  assert.equal(ctx.title?.text, '仅标题');
  assert.equal(ctx.title?.basis, null);
  assert.equal(ctx.analysisSummary, '');
  assert.equal(ctx.strategy, null);
});

// ---------- T3.4 版本链纯函数（nextVersionNo / versionSourceLabel）----------

test('nextVersionNo: 当前最大为 null → 从 1 开始', () => {
  assert.equal(nextVersionNo(null), 1);
  assert.equal(nextVersionNo(undefined), 1);
});

test('nextVersionNo: 当前最大为 3 → 返回 4', () => {
  assert.equal(nextVersionNo(3), 4);
  assert.equal(nextVersionNo(0), 1);
});

test('versionSourceLabel: manual/draft 等枚举映射为中文', () => {
  assert.equal(versionSourceLabel('manual'), '人工保存');
  assert.equal(versionSourceLabel('continue'), '续写');
  assert.equal(versionSourceLabel('polish'), '润色');
  assert.equal(versionSourceLabel('detect'), '检测');
});

test('versionSourceLabel: 未知/空值 → 原样或「未知」降级', () => {
  assert.equal(versionSourceLabel('weird'), 'weird');
  assert.equal(versionSourceLabel(null), '未知');
  assert.equal(versionSourceLabel(undefined), '未知');
});

// ---------- 草稿箱筛选条件（buildProjectListQuery）----------

test('buildProjectListQuery: 默认按最近编辑排序，无过滤', () => {
  const r = buildProjectListQuery({});
  assert.deepEqual(r.where, {});
  assert.deepEqual(r.orderBy, { updatedAt: 'desc' });
});

test('buildProjectListQuery: status=draft → 6 个未发布态 in 过滤', () => {
  const r = buildProjectListQuery({ status: 'draft' });
  assert.ok(Array.isArray(r.where.status.in));
  assert.equal(r.where.status.in.length, 6);
  assert.ok(!r.where.status.in.includes('PUBLISHED'));
  assert.ok(!r.where.status.in.includes('ARCHIVED'));
});

test('buildProjectListQuery: status=published → 仅 PUBLISHED/ARCHIVED', () => {
  const r = buildProjectListQuery({ status: 'published' });
  assert.deepEqual(r.where.status.in, ['PUBLISHED', 'ARCHIVED']);
});

test('buildProjectListQuery: 精确状态值原样透传', () => {
  const r = buildProjectListQuery({ status: 'CREATING' });
  assert.equal(r.where.status, 'CREATING');
});

test('buildProjectListQuery: q 搜索标题/选题/正文三路 OR', () => {
  const r = buildProjectListQuery({ q: '  职场  ' });
  assert.equal(r.where.OR.length, 3);
  assert.equal(r.where.OR[0].selectedTitle.text.contains, '职场');
  assert.equal(r.where.OR[2].workingContent.contains, '职场');
});

test('buildProjectListQuery: 空 q / 空白 q 不产生 OR', () => {
  assert.equal(buildProjectListQuery({ q: '   ' }).where.OR, undefined);
  assert.equal(buildProjectListQuery({ q: '' }).where.OR, undefined);
});

test('buildProjectListQuery: sort=created 按创建时间，账号过滤透传', () => {
  const r = buildProjectListQuery({ sort: 'created', ownedAccountId: 'acc1' });
  assert.deepEqual(r.orderBy, { createdAt: 'desc' });
  assert.equal(r.where.ownedAccountId, 'acc1');
});

