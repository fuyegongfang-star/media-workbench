-- 0008 内容项目继承上下文快照 + 提示词模板版本快照（T3.2）
-- 深入设计 §3.2 可复现：创建内容项目时把策略/分析摘要与当前启用 article_draft 模板版本快照落库，
--   以便后续 T3.5 生成使用稳定上下文（防选题/策略后续被改导致不可复现）。
-- 字段均为可空，兼容历史数据；PG16 下 JSONB 与 TEXT 直接可用。

ALTER TABLE "content_projects" ADD COLUMN IF NOT EXISTS "context_snapshot" JSONB;
ALTER TABLE "content_projects" ADD COLUMN IF NOT EXISTS "prompt_template_version_id" TEXT;
CREATE INDEX IF NOT EXISTS "content_projects_prompt_template_version_id_idx" ON "content_projects" ("prompt_template_version_id");
