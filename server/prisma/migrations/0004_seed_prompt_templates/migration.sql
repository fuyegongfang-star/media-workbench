-- 0004 单篇拆解默认提示词模板（T2.3）
-- 供 ANALYSIS_SINGLE 处理器渲染 system+user 消息；占位符 {{title}} {{body}}。
-- 幂等：唯一约束 (task_type, platform, version) 命中则跳过。
-- 说明：即使本迁移未执行，代码亦会以 analysis.prompt.ts 内置 DEFAULT_SINGLE_ANALYSIS_USER_TEMPLATE 兜底。

INSERT INTO prompt_templates (id, task_type, platform, version, content, variables, enabled, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-00000000a001',
  'single_analysis',
  'wechat',
  1,
  $$请对以下单篇素材做结构化拆解，仅输出 JSON（不要包含 markdown 代码块）：
{
  "theme": "核心主题/定位（一句话）",
  "audiencePain": ["目标受众痛点1", "目标受众痛点2"],
  "hooks": ["开头钩子/金句1", "开头钩子/金句2"],
  "structure": "推荐内容结构（如：痛点引入 - 观点展开 - 案例佐证 - 行动号召）",
  "angles": ["可延伸的选题角度1", "可延伸的选题角度2"],
  "tone": "风格调性（如：专业可信 / 轻松幽默 / 犀利直给）",
  "summary": "200 字以内内容摘要"
}
素材标题：{{title}}
素材正文：{{body}}$$,
  '{"title":"string","body":"string"}'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (task_type, platform, version) DO NOTHING;
