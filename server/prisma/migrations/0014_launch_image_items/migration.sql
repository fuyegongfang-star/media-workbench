-- 0014 贴图起号计划图片组（T4.2）
-- 为 type=image 的起号任务（图片组）增加有序图片项（每图配文、顺序、稳定 id 支持拖拽预览）。
-- 增量 DDL，无需数据库即可生成；与 schema.prisma 对齐。任务删除时级联清理图片项。

CREATE TABLE "launch_image_items" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "caption" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "launch_image_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "launch_image_items_task_id_sort_order_idx"
  ON "launch_image_items" ("task_id", "sort_order");

ALTER TABLE "launch_image_items"
  ADD CONSTRAINT "launch_image_items_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "launch_tasks" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
