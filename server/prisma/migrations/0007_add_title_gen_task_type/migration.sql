-- 0007 新增异步任务类型 TITLE_GEN（T3.1 标题生成，与 PromptTaskType.title_gen 对齐）
-- PG12+ 支持在事务内 ALTER TYPE ADD VALUE；PG16 目标环境可直接 migrate deploy。
ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'TITLE_GEN';
