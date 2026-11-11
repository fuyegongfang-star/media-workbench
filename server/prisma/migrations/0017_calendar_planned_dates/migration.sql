-- 0017 内容日历（T4.4）
-- 为 topics 增加「计划推进日期 planned_at」，为 content_projects 增加「计划发布日 planned_publish_at」，
-- 二者作为内容日历的日期锚点（选题/内容项目在日历上排期，支持拖拽改期）。
-- 增量 DDL，无需数据库即可生成；与 schema.prisma 对齐。

ALTER TABLE "topics"
  ADD COLUMN IF NOT EXISTS "planned_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "topics_planned_at_idx"
  ON "topics" ("planned_at");

ALTER TABLE "content_projects"
  ADD COLUMN IF NOT EXISTS "planned_publish_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "content_projects_planned_publish_at_idx"
  ON "content_projects" ("planned_publish_at");
