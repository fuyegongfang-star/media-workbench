-- T4.6 成本/配额看板：为 SystemConfig 增加月度预算字段（配额预警的数据源）
-- 增量迁移，由 `prisma migrate diff --from-schema-datamodel` 确定性产出，无需数据库即可生成。

-- AlterTable
ALTER TABLE "system_configs" ADD COLUMN     "monthly_budget" DOUBLE PRECISION;
