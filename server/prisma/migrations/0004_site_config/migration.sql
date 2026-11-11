-- T1.8 站点设置单例：新增 site_configs 表（基础信息 / 默认公众号 AppID 加密 / 合规开关）。
-- 单行约束由服务层固定 id（SITE_CONFIG_ID）保证；AppID 明文绝不入库（AES-256-GCM 加密后存 default_wechat_app_id_encrypted）。
-- 增量 DDL，取自 Prisma 确定性输出（migrate diff --from-empty --to-schema-datamodel）。

-- CreateTable
CREATE TABLE "site_configs" (
    "id" TEXT NOT NULL,
    "site_name" TEXT NOT NULL DEFAULT '自媒体工作台',
    "site_desc" TEXT,
    "default_wechat_app_id_encrypted" TEXT,
    "compliance" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_configs_pkey" PRIMARY KEY ("id")
);
