-- 0003_tasks: 新增异步任务中心表与 TaskType 枚举（T1.5 任务中心基础）
-- 增量 DDL 取自 `prisma migrate diff --from-empty --to-schema-datamodel`（Prisma 确定性输出），
-- 本机无 PostgreSQL（护栏：环境降级），未执行 `migrate deploy`，待有环境后自动对齐。

CREATE TYPE "TaskType" AS ENUM ('ANALYSIS_SINGLE', 'ANALYSIS_ACCOUNT_SUMMARY', 'TOPIC_GEN', 'ARTICLE_GEN', 'TEXT_DETECT', 'TEXT_POLISH');

CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'queued',
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "job_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tasks_job_id_key" ON "tasks"("job_id");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
CREATE INDEX "tasks_taskType_status_idx" ON "tasks"("taskType", "status");
CREATE INDEX "tasks_object_type_object_id_idx" ON "tasks"("object_type", "object_id");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
