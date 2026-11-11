-- T3.11 合规预审（广告法极限词/敏感词检测）：送审前自动标红的硬卡点记录。
-- 增量 DDL，取自 Prisma 确定性输出（migrate diff --from-empty --to-schema-datamodel）。

-- CreateTable
CREATE TABLE "compliance_checks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version_id" TEXT,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "risk_count" INTEGER NOT NULL DEFAULT 0,
    "blocking_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "max_severity" TEXT,
    "service" TEXT NOT NULL DEFAULT 'local',
    "matches" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "dictionary_version" TEXT NOT NULL DEFAULT '1',
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_checks_project_id_checked_at_idx" ON "compliance_checks"("project_id", "checked_at");

-- CreateIndex
CREATE INDEX "compliance_checks_project_id_version_id_idx" ON "compliance_checks"("project_id", "version_id");

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
