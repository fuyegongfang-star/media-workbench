// 提示词模板管理纯函数单测（不依赖数据库）：node --test server/test/prompt-template.test.mjs
// 覆盖：元数据解析、内置/自定义判定、账号专属优先选择、版本号、内容校验、占位符渲染。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/system/prompt-template.util.js';
const {
  PROMPT_TASK_META,
  PROMPT_TASK_TYPES,
  parseTemplateMeta,
  buildTemplateVariables,
  pickPromptTemplate,
  nextTemplateVersion,
  validateTemplateContent,
  isPromptTaskType,
  renderPromptPlaceholders,
} = util;
import dto from '../dist/modules/system/dto/prompt-template.dto.js';

const row = (over) => ({
  id: 'r1', taskType: 'article_draft', platform: 'wechat', version: 1,
  content: '模板', enabled: true, variables: {}, ...over,
});
const custom = (over, meta = {}) => row({
  builtin: undefined,
  variables: buildTemplateVariables({ label: '我的模板', scope: 'global', ...meta }),
  ...over,
});

test('PROMPT_TASK_META: 9 类环节齐备且分组正确', () => {
  assert.equal(PROMPT_TASK_TYPES.length, 9);
  assert.equal(PROMPT_TASK_META.article_draft.group, '正文创作');
  assert.equal(PROMPT_TASK_META.single_analysis.group, '对标拆解');
  assert.equal(PROMPT_TASK_META.polish.group, '润色检测');
  assert.ok(PROMPT_TASK_META.article_draft.variables.includes('strategySummary'));
});

test('isPromptTaskType: 白名单校验', () => {
  assert.equal(isPromptTaskType('article_draft'), true);
  assert.equal(isPromptTaskType('polish'), true);
  assert.equal(isPromptTaskType('not_exist'), false);
  assert.equal(isPromptTaskType(123), false);
});

test('parseTemplateMeta: 无 __meta → null（内置预设）', () => {
  assert.equal(parseTemplateMeta({ title: 'string' }), null);
  assert.equal(parseTemplateMeta(null), null);
  assert.equal(parseTemplateMeta('bad'), null);
});

test('buildTemplateVariables / parseTemplateMeta: 账号专属往返', () => {
  const vars = buildTemplateVariables({ label: '科技号风格', scope: 'account', ownedAccountId: 'acc1', placeholders: ['title'] });
  assert.equal(vars.title, 'string');
  const meta = parseTemplateMeta(vars);
  assert.equal(meta.label, '科技号风格');
  assert.equal(meta.scope, 'account');
  assert.equal(meta.ownedAccountId, 'acc1');
  assert.equal(meta.custom, true);
});

test('buildTemplateVariables: account 但无账号 ID → 退化为 global', () => {
  const meta = parseTemplateMeta(buildTemplateVariables({ label: 'x', scope: 'account' }));
  assert.equal(meta.scope, 'global');
  assert.equal(meta.ownedAccountId, null);
});

test('pickPromptTemplate: 账号专属优先于全局（即使全局版本更高）', () => {
  const rows = [
    custom({ id: 'g', version: 9, variables: buildTemplateVariables({ label: '全局', scope: 'global' }) }),
    custom({ id: 'a', version: 2, variables: buildTemplateVariables({ label: '专属', scope: 'account', ownedAccountId: 'acc1' }) }),
  ];
  assert.equal(pickPromptTemplate(rows, 'acc1').id, 'a');
});

test('pickPromptTemplate: 无匹配账号专属 → 回退全局最新', () => {
  const rows = [
    custom({ id: 'g1', version: 1, variables: buildTemplateVariables({ label: '全局1', scope: 'global' }) }),
    custom({ id: 'g2', version: 5, variables: buildTemplateVariables({ label: '全局2', scope: 'global' }) }),
    custom({ id: 'a', version: 9, variables: buildTemplateVariables({ label: '别家', scope: 'account', ownedAccountId: 'acc2' }) }),
  ];
  assert.equal(pickPromptTemplate(rows, 'acc1').id, 'g2');
  assert.equal(pickPromptTemplate(rows, null).id, 'g2'); // 其它账号专属被忽略
});

test('pickPromptTemplate: 内置预设（无 __meta）视为全局，可参与选择', () => {
  const rows = [row({ id: 'builtin', version: 1, variables: { title: 'string' } })];
  assert.equal(pickPromptTemplate(rows, 'acc1').id, 'builtin');
});

test('pickPromptTemplate: 停用的模板不参与；全停用返回 null', () => {
  const rows = [row({ id: 'off', enabled: false }), custom({ id: 'on', version: 2 })];
  assert.equal(pickPromptTemplate(rows).id, 'on');
  assert.equal(pickPromptTemplate([row({ enabled: false })]), null);
  assert.equal(pickPromptTemplate([]), null);
});

test('pickPromptTemplate: 同 rank 取最新 version', () => {
  const rows = [
    custom({ id: 'v1', version: 1 }),
    custom({ id: 'v3', version: 3 }),
    custom({ id: 'v2', version: 2 }),
  ];
  assert.equal(pickPromptTemplate(rows).id, 'v3');
});

test('nextTemplateVersion: 按 taskType+platform 取最大 +1', () => {
  const rows = [
    { taskType: 'article_draft', platform: 'wechat', version: 1 },
    { taskType: 'article_draft', platform: 'wechat', version: 3 },
    { taskType: 'title_gen', platform: 'wechat', version: 7 },
    { taskType: 'article_draft', platform: 'douyin', version: 5 },
  ];
  assert.equal(nextTemplateVersion(rows, 'article_draft', 'wechat'), 4);
  assert.equal(nextTemplateVersion(rows, 'polish', 'wechat'), 1);
});

test('validateTemplateContent: 空/超长拦截，正常放行', () => {
  assert.equal(validateTemplateContent('').ok, false);
  assert.equal(validateTemplateContent('   ').ok, false);
  assert.equal(validateTemplateContent('x'.repeat(20001)).ok, false);
  assert.equal(validateTemplateContent('请写 {{title}}').ok, true);
});

test('renderPromptPlaceholders: 替换已提供变量，未提供的保留原样', () => {
  const r = renderPromptPlaceholders('标题 {{title}}，缺失 {{unknown}}', { title: 'AI 趋势' });
  assert.equal(r, '标题 AI 趋势，缺失 {{unknown}}');
});

test('DTO 元数据守卫：CreatePromptTemplateDto 是真实类（design:paramtypes 依赖值导入）', () => {
  assert.equal(typeof dto.CreatePromptTemplateDto, 'function');
  assert.equal(typeof dto.UpdatePromptTemplateDto, 'function');
});
