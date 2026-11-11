-- 0013 公众号发布执行（T3.9）
-- 为内容项目增加发布回写字段（草稿 media_id / 发布状态 / 错误 / 定时时间 / 内部任务 id），
-- 并为站点设置补充公众号 AppSecret 加密列（与既有 AppID 配套，用于换取 access_token）。
-- 增量 DDL，无需数据库即可生成；与 schema.prisma 对齐。

-- 发布状态枚举
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT_SYNCED', 'PUBLISHED', 'SCHEDULED', 'FAILED');

-- content_projects：发布回写字段
ALTER TABLE "content_projects"
  ADD COLUMN "external_media_id" TEXT,
  ADD COLUMN "publish_status" "PublishStatus",
  ADD COLUMN "publish_error" TEXT,
  ADD COLUMN "scheduled_at" TIMESTAMP(3),
  ADD COLUMN "publish_task_id" TEXT;

-- site_configs：公众号 AppSecret 加密列（AES-256-GCM，base64）
ALTER TABLE "site_configs"
  ADD COLUMN "default_wechat_app_secret_encrypted" TEXT;
