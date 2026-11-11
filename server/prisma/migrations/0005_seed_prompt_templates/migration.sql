-- 0005 账号级汇总 + 策略草稿 默认提示词模板（T2.4）
-- 供 ANALYSIS_ACCOUNT_SUMMARY 处理器聚合选中拆解 → 产出策略草稿 JSON（占位符 {{accountName}} {{analyses}}）。
-- strategy_draft 为「策略精修（v2）」步骤预留（本任务直接使用 account_summary 产出草稿，未引用）。
-- 幂等：唯一约束 (task_type, platform, version) 命中则跳过。

INSERT INTO prompt_templates (id, task_type, platform, version, content, variables, enabled, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-00000000a002',
  'account_summary',
  'wechat',
  1,
  $$请基于以下对标素材的拆解结论，为账号「{{accountName}}」生成一份账号内容策略草稿，仅输出 JSON（不要包含 markdown 代码块）：
{
  "position": { "核心定位": "", "差异化": "" },
  "audience": { "目标人群": "", "核心痛点": "" },
  "pillars": ["内容栏目支柱1", "内容栏目支柱2"],
  "titlePref": { "风格": "", "公式": "" },
  "structure": "推荐内容结构范式（如：痛点引入 - 观点展开 - 案例佐证 - 行动号召）",
  "tone": { "调性": "", "语气词": "" },
  "boundaries": ["内容红线/不碰的选题1", "合规边界2"]
}
以下为各素材拆解结论：
{{analyses}}$$,
  '{"accountName":"string","analyses":"string"}'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (task_type, platform, version) DO NOTHING;

INSERT INTO prompt_templates (id, task_type, platform, version, content, variables, enabled, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-00000000a003',
  'strategy_draft',
  'wechat',
  1,
  $$你是一名资深内容策略顾问。下面是一份初版账号内容策略草稿，请在不改变字段结构的前提下，结合「{{summaryAnalysis}}」做精炼与补全，仅输出 JSON（不要包含 markdown 代码块）：
{
  "position": { "核心定位": "", "差异化": "" },
  "audience": { "目标人群": "", "核心痛点": "" },
  "pillars": ["栏目1", "栏目2"],
  "titlePref": { "风格": "", "公式": "" },
  "structure": "推荐结构范式",
  "tone": { "调性": "", "语气词": "" },
  "boundaries": ["红线1", "边界2"]
}$$,
  '{"summaryAnalysis":"string"}'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (task_type, platform, version) DO NOTHING;
