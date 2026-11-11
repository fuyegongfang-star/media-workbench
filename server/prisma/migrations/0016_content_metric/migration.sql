-- 0016 发布后效果数据回收（T3.10）
-- 新增 content_metrics 表：按已发布文章回收阅读/分享/收藏/在看/涨粉/取关等指标。
-- 数据来源：公众号统计接口（getuserread/getarticleread/getusersummary）定时拉取，或人工录入。
-- 增量 DDL，无需数据库即可生成；与 schema.prisma 对齐。内容项目删除时级联清理指标。

CREATE TABLE "content_metrics" (
  "id" TEXT NOT NULL,
  "content_project_id" TEXT NOT NULL,
  "external_article_id" TEXT,
  "metric_date" TIMESTAMP(3) NOT NULL,
  "read_count" INTEGER NOT NULL DEFAULT 0,
  "share_count" INTEGER NOT NULL DEFAULT 0,
  "favorite_count" INTEGER NOT NULL DEFAULT 0,
  "like_count" INTEGER NOT NULL DEFAULT 0,
  "follower_increase" INTEGER NOT NULL DEFAULT 0,
  "unfollow_count" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_metrics_pkey" PRIMARY KEY ("id")
);

-- 唯一：同一文章 + 同一天 + 同一来源 视为一份快照，便于 upsert（拉取时去重覆盖）。
CREATE UNIQUE INDEX "content_metrics_project_date_source_idx"
  ON "content_metrics" ("content_project_id", "metric_date", "source");

CREATE INDEX "content_metrics_project_date_idx"
  ON "content_metrics" ("content_project_id", "metric_date");

CREATE INDEX "content_metrics_metric_date_idx"
  ON "content_metrics" ("metric_date");

ALTER TABLE "content_metrics"
  ADD CONSTRAINT "content_metrics_content_project_id_fkey"
  FOREIGN KEY ("content_project_id") REFERENCES "content_projects" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
