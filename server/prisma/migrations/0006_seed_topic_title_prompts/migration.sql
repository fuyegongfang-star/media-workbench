-- 0006 选题生成 + 标题生成 默认提示词模板（T3.1）
-- 供 TOPIC_GEN 处理器（策略/分析 → 选题 Topic[]）与 TITLE_GEN 处理器（选题+策略 → 标题候选 TitleCandidate[]）渲染。
-- 占位符：{{count}} {{strategySummary}} {{analysisSummary}}（topic_gen）/ {{count}} {{topicTitle}} {{topicAngle}} {{strategySummary}}（title_gen）。
-- 幂等：唯一约束 (task_type, platform, version) 命中则跳过。

INSERT INTO prompt_templates (id, task_type, platform, version, content, variables, enabled, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-00000000b001',
  'topic_gen',
  'wechat',
  1,
  $$基于以下账号策略与对标分析，产出 {{count}} 个候选选题，仅输出 JSON 数组（不要包含 markdown 代码块）：
[
  { "title": "选题标题", "audience": "目标受众", "angle": "切入角度/钩子", "tags": ["标签1","标签2"] }
]
账号策略摘要：
{{strategySummary}}
对标分析摘要：
{{analysisSummary}}$$,
  '{"count":"number","strategySummary":"string","analysisSummary":"string"}'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (task_type, platform, version) DO NOTHING;

INSERT INTO prompt_templates (id, task_type, platform, version, content, variables, enabled, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-00000000b002',
  'title_gen',
  'wechat',
  1,
  $$基于以下选题与账号策略，产出 {{count}} 个标题候选，仅输出 JSON 数组（不要包含 markdown 代码块）：
[
  { "text": "标题文案", "basis": "依据/卖点", "tags": ["标签"], "score": 8 }
]
选题：{{topicTitle}}
切入角度：{{topicAngle}}
账号策略摘要：{{strategySummary}}$$,
  '{"count":"number","topicTitle":"string","topicAngle":"string","strategySummary":"string"}'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (task_type, platform, version) DO NOTHING;
