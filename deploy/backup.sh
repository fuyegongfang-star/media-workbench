#!/bin/sh
# 一键备份：在 compose 网络内的 postgres 容器执行 pg_dump，并把 storage 卷镜像到宿主机。
# 宿主机不需要 psql / Node，也不需要把 5432 暴露到公网。
# 用法：./deploy/backup.sh   （可直接放进 crontab，见 deploy/backup.cron.example）
set -eu

SCRIPT_DIR=${0%/*}
[ "$SCRIPT_DIR" = "$0" ] && SCRIPT_DIR=.
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$ROOT"
COMPOSE="docker-compose.prod.yml"

[ -f "$ROOT/.env" ] || { echo "[backup] 缺少 .env，请先运行 ./deploy/bootstrap.sh" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "[backup] 缺少 docker" >&2; exit 1; }

mkdir -p "$ROOT/backups"
echo "[backup] 开始备份（数据库逻辑导出 + 附件镜像）..."
docker compose -f "$COMPOSE" --profile backup run --rm backup
echo "[backup] 产物目录：$ROOT/backups"
