-- 0018 内容项目标签（T4.5 批量打标签）
-- 为 content_projects 增加 tags 数组列（与 T4.3 素材库 tags 同构），支撑草稿批量打标签。
-- 增量 DDL，无需数据库即可生成；与 schema.prisma 对齐（GIN 索引手工创建，Prisma schema 不声明数组索引）。
-- 注意：0002_trgm_search 已为 title/body 建立 pg_trgm GIN 索引，本迁移补 tags 数组 GIN。

ALTER TABLE "content_projects"
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';

-- 标签数组 GIN 索引（数组 GIN，深入设计 §2.3 / T4.5）
CREATE INDEX IF NOT EXISTS "content_projects_tags_idx"
  ON "content_projects" USING gin ("tags");
