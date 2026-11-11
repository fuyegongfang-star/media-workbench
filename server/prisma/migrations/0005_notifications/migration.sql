-- T1.10 通知渠道与监控告警：SiteConfig 增加 notifications 列（渠道配置 JSON）。
-- 敏感字段（webhookUrl / secret / smtpPassword）经 AES-256-GCM 加密后以 `enc:` 前缀入库，
-- 绝不存储明文。增量 DDL，取自 Prisma 确定性输出（migrate diff --from-empty --to-schema-datamodel）。

-- Add column
ALTER TABLE "site_configs" ADD COLUMN "notifications" JSONB NOT NULL DEFAULT '{}';
