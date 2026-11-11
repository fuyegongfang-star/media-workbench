-- T3.8 内容项目导出/发布信息/AI 生成标识声明：在 content_projects 上增量加三列。
-- 增量 DDL（取自 Prisma 确定性输出 migrate diff --from-empty --to-schema-datamodel 的 ADD COLUMN 部分）。
-- 全部为可空/带默认值的 ADD COLUMN，不锁表、不丢数据。

-- Add ai_generated 列（默认 true：本工作台为 AI 辅助创作工具）
ALTER TABLE "content_projects" ADD COLUMN "ai_generated" BOOLEAN NOT NULL DEFAULT true;

-- Add ai_declaration 列（自定义声明文本，可空）
ALTER TABLE "content_projects" ADD COLUMN "ai_declaration" TEXT;

-- Add publish_note 列（手动记录发布补充说明，可空）
ALTER TABLE "content_projects" ADD COLUMN "publish_note" TEXT;
