-- T5.2 平台模板预留位：扩展 Platform 枚举，新增 xiaohongshu / douyin / toutiao 三个平台占位。
-- 注：PostgreSQL 的 ALTER TYPE ... ADD VALUE 不能在事务块内执行，故本迁移仅含三条独立语句，
-- Prisma migrate deploy 会对枚举值追加自动跳过事务包裹。新增平台后 ContentProject / PromptTemplate
-- 等 platform 字段即可落这些取值，无需改表结构。

ALTER TYPE "Platform" ADD VALUE 'xiaohongshu';
ALTER TYPE "Platform" ADD VALUE 'douyin';
ALTER TYPE "Platform" ADD VALUE 'toutiao';
