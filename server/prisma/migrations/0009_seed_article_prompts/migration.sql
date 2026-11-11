-- 0009 文章生成默认提示词模板（T3.5）
-- 供 ARTICLE_GEN 处理器渲染：stage=draft → article_draft（基于策略/分析/选题写初稿）；
-- 其余 stage（continue/rewrite/compress/expand）→ article_edit（在现有正文上执行编辑动作）。
-- 占位符（article_draft）：{{title}} {{titleBasis}} {{topicTitle}} {{topicAudience}} {{topicAngle}} {{topicTags}} {{strategySummary}} {{analysisSummary}}
-- 占位符（article_edit）：{{title}} {{currentContent}} {{action}}
-- 幂等：唯一约束 (task_type, platform, version) 命中则跳过。

INSERT INTO prompt_templates (id, task_type, platform, version, content, variables, enabled, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-00000000c001',
  'article_draft',
  'wechat',
  1,
  $$请根据以下信息撰写一篇公众号长文（Markdown 格式，含小标题与分段）：

# 选题与标题
标题：{{title}}
标题依据：{{titleBasis}}

# 选题信息
选题：{{topicTitle}}
受众：{{topicAudience}}
切入角度：{{topicAngle}}
标签：{{topicTags}}

# 账号策略摘要
{{strategySummary}}

# 对标分析摘要
{{analysisSummary}}

要求：
- 开篇有钩子，结构清晰（痛点引入-观点展开-案例佐证-行动号召），结尾有落点；
- 语言符合账号调性，避免极限词与夸大诱导表述（合规）；
- 直接输出 Markdown 正文，不要包含 ``` 代码块与额外解释。$$,
  '{"title":"string","titleBasis":"string","topicTitle":"string","topicAudience":"string","topicAngle":"string","topicTags":"string","strategySummary":"string","analysisSummary":"string"}'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (task_type, platform, version) DO NOTHING;

INSERT INTO prompt_templates (id, task_type, platform, version, content, variables, enabled, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-00000000c002',
  'article_edit',
  'wechat',
  1,
  $$当前文章标题：{{title}}

# 现有正文
{{currentContent}}

# 编辑指令
请执行以下动作：{{action}}

要求：
- 保持 Markdown 结构；
- 直接输出修改后的完整正文，不要包含 ``` 代码块与额外解释；
- 不改变文章的核心主题与合规底线。$$,
  '{"title":"string","currentContent":"string","action":"string"}'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (task_type, platform, version) DO NOTHING;
