-- T6.9 选题雷达：地区分栏 + 发布时间时效过滤。
-- region 按数据源自动归类（domestic 国内 / overseas 海外），publishedAt 为来源发布时间（热榜类可为空）。
-- 均为可空/带默认值的新列，兼容已有 radar_items 数据（旧行按国内、无发布时间处理）。

ALTER TABLE "radar_items" ADD COLUMN "region" TEXT NOT NULL DEFAULT 'domestic';
ALTER TABLE "radar_items" ADD COLUMN "published_at" TIMESTAMP(3);

-- 简报按地区分栏查询的索引
CREATE INDEX "radar_items_run_id_region_idx" ON "radar_items"("run_id", "region");
