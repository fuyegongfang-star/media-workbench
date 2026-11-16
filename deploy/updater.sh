#!/bin/sh
# 自媒体工作台 — 在线更新守护进程（T6.5）
#
# 设计要点（为什么这样写，改动前务必先读）：
#  1) api 容器内既没有 docker CLI 也没有 git，且不给它挂 docker.sock（安全）。
#     因此 api 只往共享 storage 卷写 request.json；本脚本在**独立的 updater 容器**内轮询执行。
#  2) 重建时只 `up -d --build api web`，**绝不重建 updater 自身**，
#     否则更新进程会在重建自己时被打断（这是自更新最容易踩的坑）。
#  3) COMPOSE_PROJECT_NAME 必须与宿主机一致，否则会在容器里创建第二套容器/卷。
#     由 compose 的 environment 注入，值来自 .env（bootstrap.sh 自动写入目录名）。
#  4) git 只做 --ff-only 快进；服务器代码有本地改动时直接中止，绝不覆盖。
#     容器以 root 运行、宿主机仓库属主可能是别的用户，因此设 safe.directory + core.filemode=false
#     （忽略 chmod 造成的 mode 变更），避免误判 dirty。
#  5) 更新前自动备份（失败只告警、不阻断）；更新后轮询 /api/health 才算成功。
#
# 文件协议（STATE 目录 = 共享 storage 卷的 update/ 子目录）：
#   request.json   api 写：{"id","type":"check|apply","requestedAt","requestedBy"}
#   heartbeat.json 本脚本每轮写：{"ts": epoch}，api 据此判断更新服务是否存活
#   check.json     本脚本写：最近一次"检查更新"结果
#   status.json    本脚本写：当前/最近一次执行状态（含阶段、时间、commit、消息）
#   log.txt        本脚本追加：执行日志（滚动保留最近 N 行）
#   last-id        本脚本写：已处理的 requestId，防止重启后重复执行
#
# 纯 POSIX sh；依赖 docker CLI + compose 插件 + git + curl（由 updater 镜像提供）。
# 日志绝不回显任何密钥/口令。

set -u

REPO=${UPDATER_REPO_DIR:-/repo}
STATE=${UPDATER_STATE_DIR:-/app/storage/update}
COMPOSE_FILE=${UPDATER_COMPOSE_FILE:-docker-compose.prod.yml}
BRANCH=${UPDATER_BRANCH:-main}
POLL=${UPDATER_POLL_SECONDS:-2}
HEALTH_URL=${UPDATER_HEALTH_URL:-http://web/api/health}
HEALTH_TIMEOUT=${UPDATER_HEALTH_TIMEOUT:-240}
LOG_MAX_LINES=${UPDATER_LOG_MAX_LINES:-300}
BACKUP_BEFORE_APPLY=${UPDATER_BACKUP_BEFORE_APPLY:-1}

mkdir -p "$STATE" 2>/dev/null || { echo "[updater] 无法创建状态目录 $STATE" >&2; exit 1; }

# ---------- 工具 ----------
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

json_escape() {
  # 转义反斜杠、双引号，并把换行/回车压成空格（shell 无 jq，手工保证 JSON 合法）
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n\r' '  '
}

log() {
  printf '[%s] %s\n' "$(now)" "$*" >> "$STATE/log.txt"
  if [ -f "$STATE/log.txt" ]; then
    tail -n "$LOG_MAX_LINES" "$STATE/log.txt" > "$STATE/log.tmp" 2>/dev/null \
      && mv "$STATE/log.tmp" "$STATE/log.txt"
  fi
}

heartbeat() {
  printf '{"ts":%s}\n' "$(date +%s)" > "$STATE/heartbeat.tmp" 2>/dev/null \
    && mv "$STATE/heartbeat.tmp" "$STATE/heartbeat.json"
}

# 全局状态（由 flush_status 序列化，避免写半个 JSON）
PHASE=idle
TYPE=bootstrap
REQID=""
MSG="更新服务已就绪"
CUR=""
REMOTE=""
STARTED=""
FINISHED=""

flush_status() {
  local_phase=$(json_escape "$PHASE")
  local_type=$(json_escape "$TYPE")
  local_req=$(json_escape "$REQID")
  local_msg=$(json_escape "$MSG")
  local_cur=$(json_escape "$CUR")
  local_remote=$(json_escape "$REMOTE")
  cat > "$STATE/status.tmp" <<EOF
{"phase":"$local_phase","type":"$local_type","requestId":"$local_req","message":"$local_msg","currentCommit":"$local_cur","remoteCommit":"$local_remote","startedAt":"$STARTED","finishedAt":"$FINISHED","updatedAt":"$(now)"}
EOF
  mv "$STATE/status.tmp" "$STATE/status.json"
}

fail() {
  MSG="$1"
  PHASE=failed
  FINISHED=$(now)
  flush_status
  log "[ERROR] $MSG"
}

json_field() {
  # 从 api 生成的固定格式 JSON 中取字符串字段（无需 jq）
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$2" 2>/dev/null | head -n 1
}

# ---------- 检查更新 ----------
do_check() {
  REQID="$1"
  TYPE=check
  PHASE=running
  STARTED=$(now)
  FINISHED=""
  MSG="正在连接 GitHub 检查更新"
  flush_status
  log "[check] 开始（requestId=$REQID）"

  if ! git -C "$REPO" fetch --quiet origin "$BRANCH" >> "$STATE/log.txt" 2>&1; then
    fail "无法连接 GitHub（git fetch 失败），请检查服务器网络"
    return
  fi

  LOCAL_SHA=$(git -C "$REPO" rev-parse HEAD 2>/dev/null)
  REMOTE_SHA=$(git -C "$REPO" rev-parse "origin/$BRANCH" 2>/dev/null)
  BEHIND=$(git -C "$REPO" rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)
  AHEAD=$(git -C "$REPO" rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)
  [ -n "$BEHIND" ] || BEHIND=0
  [ -n "$AHEAD" ] || AHEAD=0

  REMOTE=$(printf '%s' "$REMOTE_SHA" | cut -c1-12)
  if [ "$BEHIND" = "0" ]; then UPTODATE=true; else UPTODATE=false; fi

  cat > "$STATE/check.tmp" <<EOF
{"checkedAt":"$(now)","localCommit":"${LOCAL_SHA:-}","remoteCommit":"${REMOTE_SHA:-}","behindBy":$BEHIND,"aheadBy":$AHEAD,"upToDate":$UPTODATE,"branch":"$BRANCH","error":""}
EOF
  mv "$STATE/check.tmp" "$STATE/check.json"

  PHASE=success
  FINISHED=$(now)
  if [ "$BEHIND" = "0" ]; then
    MSG="已是最新版本（${REMOTE}）"
  else
    MSG="发现 $BEHIND 个新提交（${REMOTE}）"
  fi
  flush_status
  log "[check] $MSG"
}

# ---------- 执行更新 ----------
do_apply() {
  REQID="$1"
  TYPE=apply
  PHASE=running
  STARTED=$(now)
  FINISHED=""
  MSG="正在拉取代码"
  flush_status
  log "[apply] ===== 开始一键更新（requestId=$REQID）====="

  # 护栏：有本地改动就停，绝不覆盖服务器上的手工修改
  DIRTY=$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null | head -n 5)
  if [ -n "$DIRTY" ]; then
    fail "服务器代码存在本地修改，已中止更新（避免覆盖）：$(printf '%s' "$DIRTY" | tr '\n' ' ')"
    return
  fi

  log "[apply] git fetch origin $BRANCH"
  if ! git -C "$REPO" fetch --quiet origin "$BRANCH" >> "$STATE/log.txt" 2>&1; then
    fail "无法连接 GitHub（git fetch 失败），更新中止，当前服务未受影响"
    return
  fi

  LOCAL_SHA=$(git -C "$REPO" rev-parse HEAD 2>/dev/null)
  REMOTE_SHA=$(git -C "$REPO" rev-parse "origin/$BRANCH" 2>/dev/null)
  REMOTE=$(printf '%s' "$REMOTE_SHA" | cut -c1-12)

  # 更新前备份（失败不阻断，只告警）
  if [ "$BACKUP_BEFORE_APPLY" = "1" ]; then
    log "[apply] 更新前自动备份数据库与附件"
    MSG="正在备份数据库与附件"
    flush_status
    if (cd "$REPO" && docker compose -f "$COMPOSE_FILE" --profile backup run --rm backup) >> "$STATE/log.txt" 2>&1; then
      log "[apply] 备份完成"
    else
      log "[WARN] 备份失败（不阻断更新，请事后检查 deploy/backup.sh）"
    fi
  fi

  log "[apply] git pull --ff-only origin $BRANCH（$LOCAL_SHA -> $REMOTE_SHA）"
  if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
    if ! git -C "$REPO" pull --ff-only --quiet origin "$BRANCH" >> "$STATE/log.txt" 2>&1; then
      fail "代码拉取失败（非快进或有冲突），更新中止；当前服务未受影响"
      return
    fi
  else
    log "[apply] 本地已是最新，跳过 pull（仍按请求重新构建）"
  fi

  MSG="正在构建并重启 api / web（约 1-3 分钟）"
  flush_status
  log "[apply] docker compose up -d --build api web"
  if ! (cd "$REPO" && docker compose -f "$COMPOSE_FILE" up -d --build api web) >> "$STATE/log.txt" 2>&1; then
    fail "镜像构建 / 容器重启失败，请查看日志并用 bootstrap.sh 恢复"
    return
  fi

  MSG="服务重建完成，正在等待健康检查"
  flush_status
  log "[apply] 等待 $HEALTH_URL 就绪（最长 ${HEALTH_TIMEOUT}s）"
  READY=0
  i=0
  while [ "$i" -lt "$HEALTH_TIMEOUT" ]; do
    if curl -fsS --max-time 3 "$HEALTH_URL" > /dev/null 2>&1; then READY=1; break; fi
    i=$((i + 3))
    sleep 3
  done

  if [ "$READY" -ne 1 ]; then
    fail "重建后健康检查未通过（${HEALTH_TIMEOUT}s 超时），请查看 api 容器日志"
    return
  fi

  CUR=$(git -C "$REPO" rev-parse --short=12 HEAD 2>/dev/null || echo "$REMOTE")
  PHASE=success
  FINISHED=$(now)
  MSG="更新完成，已部署 $CUR"
  flush_status
  log "[apply] ===== 更新成功：$CUR ====="
}

# ---------- 启动 ----------
git config --global --add safe.directory "$REPO" 2>/dev/null || true
git -C "$REPO" config core.filemode false 2>/dev/null || true

CUR=$(git -C "$REPO" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)
LAST_ID=$(cat "$STATE/last-id" 2>/dev/null || echo "")

log "[updater] 启动：repo=$REPO branch=$BRANCH current=$CUR project=${COMPOSE_PROJECT_NAME:-<默认>}"
heartbeat
flush_status

while true; do
  heartbeat
  if [ -f "$STATE/request.json" ]; then
    ID=$(json_field id "$STATE/request.json")
    REQ_TYPE=$(json_field type "$STATE/request.json")
    if [ -n "$ID" ] && [ "$ID" != "$LAST_ID" ]; then
      LAST_ID="$ID"
      printf '%s' "$ID" > "$STATE/last-id"
      case "$REQ_TYPE" in
        check) do_check "$ID" ;;
        apply) do_apply "$ID" ;;
        *) log "[updater] 忽略未知请求类型：$REQ_TYPE" ;;
      esac
    fi
  fi
  sleep "$POLL"
done
