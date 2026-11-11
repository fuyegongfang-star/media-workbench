#!/bin/sh
# API 容器入口：执行数据库迁移后启动服务。
# 依赖健康由 compose 的 condition: service_healthy 保证；迁移失败即退出，不带着旧 schema 启动。
# 日志只打印非敏感变量，绝不回显任何密钥/口令。
set -eu

echo "[entrypoint] NODE_ENV=${NODE_ENV:-unset} HOST=${HOST:-unset} PORT=${PORT:-unset}"

if [ "${SKIP_MIGRATE:-0}" = "1" ]; then
  echo "[entrypoint] SKIP_MIGRATE=1，跳过数据库迁移"
else
  echo "[entrypoint] 执行 prisma migrate deploy（首次上线会跑完全部迁移）..."
  ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
  echo "[entrypoint] 迁移完成"
fi

exec node dist/main.js
