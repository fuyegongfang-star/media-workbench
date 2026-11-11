-- 0015 素材库（T4.3）
-- 为 source_materials 增加「标签 / 收藏 / 归档」三个维度字段，支撑跨类型搜索与筛选
-- （深入设计 §2.3：类型/平台/账号/标签/来源/日期/状态筛选、收藏/标签/归档/软删恢复）。
-- 增量 DDL，无需数据库即可生成；与 schema.prisma 对齐。
-- 注意：0002_trgm_search 已为 title/body 建立 pg_trgm GIN 索引，本迁移补 tags 数组 GIN。

ALTER TABLE "source_materials"
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "source_materials"
  ADD COLUMN IF NOT EXISTS "favorite" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "source_materials"
  ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;

-- 标签数组 GIN 索引（数组 GIN，深入设计 §2.3）
CREATE INDEX IF NOT EXISTS "source_materials_tags_idx"
  ON "source_materials" USING gin ("tags");

-- 账号 + 收藏 + 归档 组合索引，加速筛选
CREATE INDEX IF NOT EXISTS "source_materials_account_fav_arch_idx"
  ON "source_materials" ("reference_account_id", "favorite", "archived");
