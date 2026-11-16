-- T6.1 选题雷达：任务类型 + 每日运行/条目表 + 站点雷达配置字段。
-- 增量迁移，与 schema.prisma 对齐；不设 fingerprint 唯一约束（沿用 SourceMaterial 约定）。

-- AlterEnum
ALTER TYPE "TaskType" ADD VALUE 'RADAR_COLLECT';

-- CreateTable
CREATE TABLE "radar_runs" (
    "id" TEXT NOT NULL,
    "run_date" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'queued',
    "source_stats" JSONB NOT NULL DEFAULT '{}',
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "featured_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "task_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radar_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radar_items" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "angle" TEXT,
    "source_url" TEXT,
    "source_name" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "niche" TEXT,
    "heat" DOUBLE PRECISION,
    "relevance" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "tier" TEXT NOT NULL DEFAULT 'candidate',
    "titles" JSONB NOT NULL DEFAULT '[]',
    "rank" INTEGER NOT NULL DEFAULT 0,
    "converted_topic_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radar_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "radar_runs_run_date_key" ON "radar_runs"("run_date");
CREATE INDEX "radar_runs_status_run_date_idx" ON "radar_runs"("status", "run_date");
CREATE INDEX "radar_items_run_id_tier_rank_idx" ON "radar_items"("run_id", "tier", "rank");
CREATE INDEX "radar_items_fingerprint_idx" ON "radar_items"("fingerprint");

-- AddForeignKey
ALTER TABLE "radar_items" ADD CONSTRAINT "radar_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "radar_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "site_configs" ADD COLUMN "radar_config" JSONB NOT NULL DEFAULT '{}';
