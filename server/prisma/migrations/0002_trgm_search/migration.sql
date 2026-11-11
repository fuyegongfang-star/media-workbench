-- 全文检索扩展与 GIN 索引（深入设计 §2.3 / 技术方案 §4 备注）。
-- 说明：Prisma schema 无法表达 gin_trgm_ops，故以独立迁移落地。
-- 标签数组 GIN 索引（topics.tags / title_candidates.tags）待 T4.3 确定 Json 数组形态后追加。

-- 启用 trigram 扩展（全文模糊检索）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 对标素材：标题 + 正文 trigram 全文索引
CREATE INDEX IF NOT EXISTS "source_materials_title_body_trgm_idx"
  ON "source_materials" USING gin (title gin_trgm_ops, body gin_trgm_ops);

-- 内容版本正文 trigram 索引（素材库跨类型检索）
CREATE INDEX IF NOT EXISTS "content_versions_content_trgm_idx"
  ON "content_versions" USING gin (content gin_trgm_ops);

-- 标题候选 trigram 索引
CREATE INDEX IF NOT EXISTS "title_candidates_text_trgm_idx"
  ON "title_candidates" USING gin (text gin_trgm_ops);
