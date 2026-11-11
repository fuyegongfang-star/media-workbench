# 备份与恢复手册（T1.6 备份/恢复骨架）

> 配套脚本：`scripts/backup-db.mjs`（数据库逻辑备份）、`scripts/backup-files.mjs`（存储文件镜像 + 快照）。
> 定时示例：`deploy/backup.cron.example`。
> 本手册仅描述「骨架级」恢复流程；真实恢复请在具备 PostgreSQL 客户端（`psql`/`pg_dump`）与 `rsync` 的目标服务器执行。

---

## 一、备份产物结构

```
<BACKUP_ROOT>/
├── db/
│   └── pgdump-<db>-<时间戳>.sql.gz      # 每日数据库逻辑备份（明文 SQL，gzip）
└── storage-<时间戳>/ 或 storage-latest/ # 见下
    ├── storage-latest/                  # 与 STORAGE_ROOT 实时同步的最新镜像（rsync -a --delete）
    └── storage-snapshots/
        └── storage-<时间戳>/            # 每次备份的时间点快照（cp -al 硬链接 / Node 深拷贝）
```

- 保留份数：`BACKUP_KEEP`（默认 14，按时间升序保留最近 N 份，旧份自动清理）。
- 备份口令：仅来自 `.env` 的 `DATABASE_URL`，**绝不以明文出现在命令参数或日志**。

---

## 二、前置条件

- 已安装 PostgreSQL 客户端（`pg_dump` / `psql`），版本建议与服务器 PG 16 兼容。
- 已安装 `rsync`（可选；缺省时文件备份自动回退 Node 原生拷贝，功能等价、仅效率略低）。
- 目标服务器存在仓库根 `.env`（含 `DATABASE_URL` / `STORAGE_ROOT` / `BACKUP_ROOT`）。

---

## 三、数据库恢复

### 1) 从最近的每日备份恢复

```bash
# 1. 选一份备份（最新的在 db/ 目录按文件名升序的最后一条）
ls -1 <BACKUP_ROOT>/db/ | sort | tail -1
# 例：pgdump-media_workbench-20261103T031000.sql.gz

# 2. 解压并还原到已存在的库（备份含 --clean --if-exists，可安全重放；不会 DROP DATABASE）
gunzip -c <BACKUP_ROOT>/db/pgdump-media_workbench-20261103T031000.sql.gz \
  | psql "$DATABASE_URL"

# 3. 确保迁移状态一致（备份是逻辑快照，建议再跑一次 migrate deploy 对齐迁移历史）
npx prisma migrate deploy --schema server/prisma/schema.prisma
```

### 2) 恢复到新建的空库

若目标库不存在，先建库再还原（备份不含 `CREATE DATABASE`）：

```bash
psql "$DATABASE_URL_ADMIN" -c "CREATE DATABASE media_workbench;"
gunzip -c <BACKUP_ROOT>/db/<file>.sql.gz | psql "$DATABASE_URL"
npx prisma migrate deploy --schema server/prisma/schema.prisma
```

---

## 四、存储文件恢复

存储文件采用「最新镜像 + 时间点快照」双轨：

```bash
# 恢复到最新镜像（覆盖式，先清空目标再同步删除项）
rsync -a --delete <BACKUP_ROOT>/storage-latest/ <STORAGE_ROOT>/

# 或恢复到某个时间点快照（例如误删前那一刻）
rsync -a --delete <BACKUP_ROOT>/storage-snapshots/storage-<时间戳>/ <STORAGE_ROOT>/
```

- 缺 `rsync` 时，可用 `cp -a` 代替；Windows 下用 `robocopy /MIR`（谨慎，`/MIR` 会镜像删除）。
- 恢复后建议运行健康检查 `npm run health` 确认 `/api/health` 中 `postgres` 与 `redis` 状态正常。

---

## 五、完整灾难恢复顺序（推荐）

1. **先恢复数据库**（第三节），再 `prisma migrate deploy` 对齐迁移。
2. **再恢复存储文件**（第四节），优先 `storage-latest`；如需回溯误删用对应快照。
3. 启动服务：`npm run start`；Worker（如有）：`npm run worker`。
4. 验证：`npm run health` 应通过，且抽样核对关键素材 `GET /api/media/:id/file` 可返回。

---

## 六、定时备份（部署侧）

参考 `deploy/backup.cron.example`：

```cron
10 3 * * * cd /opt/media-workbench && /usr/bin/node scripts/backup-db.mjs >> /var/log/mw-backup.log 2>&1
30 3 * * * cd /opt/media-workbench && /usr/bin/node scripts/backup-files.mjs >> /var/log/mw-backup.log 2>&1
```

- 备份前确认：`.env` 存在、`DATABASE_URL` 有效、`<BACKUP_ROOT>` 所在磁盘有足够空间。
- 异地/离线：建议把 `<BACKUP_ROOT>` 再同步到对象存储或另一台机器（超出本骨架范围）。

---

## 七、安全与合规

- 备份文件包含业务数据（含 `media_assets` 之外的导出内容），应存放在受限目录（如 `chmod 700`），避免与 Web 可访问目录同源。
- 数据库备份为**明文 SQL**，口令不落盘，但业务数据本身在备份中可见；建议备份卷启用加密（LUKS / 云盘加密）。
- 绝不把 `.env`（含 `DATABASE_URL`）或备份目录纳入 Git；`.gitignore` 已覆盖 `.env`。
- 恢复目标应重新生成/校验 `JWT_SECRET`、`APP_MASTER_KEY` 等密钥，避免沿用泄露副本。
