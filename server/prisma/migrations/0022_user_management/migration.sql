-- T6.4 用户注册与管理：用户状态/软删/最近登录 + 站点自助注册开关。
-- 幂等说明：仅新增列与枚举，不改动已存在的 owner 用户数据。

-- 1) 新增用户状态枚举
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- 2) users 增加管理字段
ALTER TABLE "users"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "last_login_at" TIMESTAMP(3);

-- 3) role 默认值从 owner 改为 editor（自助注册最小权限）；仅影响后续新增 user，不动存量行
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'editor';

-- 4) 站点配置增加自助注册开关（默认关闭）
ALTER TABLE "site_configs"
  ADD COLUMN "allow_registration" BOOLEAN NOT NULL DEFAULT false;

-- 索引：加速用户列表按状态/软删过滤
CREATE INDEX "users_status_deleted_at_idx" ON "users"("status", "deleted_at");
