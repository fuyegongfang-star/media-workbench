# 生产部署指南（云服务器 / 宝塔面板）

> 适用：`docker-compose.prod.yml`（PG16 + Redis + API + nginx 前端）。
> **诚实前置声明**：本项目此前从未在真实 PostgreSQL / Redis 上跑过一次（本机无 Docker / PG / Redis），
> 22 个迁移、登录 round-trip、BullMQ 消费、AI 调用**全部属于首次上线验证**；本机的 `Dockerfile` 镜像构建与
> compose 启动也**未在本机验证过**。所以下面每一步都带核验动作，请勿当成「已验证可一键上线」。

---

## 一、架构与端口

```
浏览器 ──HTTPS──> 宝塔站点 / 云 LB ──> web(nginx 容器:80) ──静态文件 / SPA
                                      └── /api/* 反代 ──> api(NestJS:3001)
                                                            ├── postgres:5432（仅内网）
                                                            ├── redis:6379（仅内网）
                                                            └── /app/storage（持久卷）
```

- `web` 默认只绑 `127.0.0.1:8080`（`WEB_HOST`/`WEB_PORT`），**不直接对公网**，由宝塔站点反代并终止 HTTPS。
- PG / Redis **不暴露宿主端口**，只有 compose 内网可达。
- `api` 容器启动时自动执行 `prisma migrate deploy`（可用 `SKIP_MIGRATE=1` 关闭）。
- BullMQ Worker **内嵌在 API 进程**（`TaskWorkerService`），不需要、也不要单独起 `npm run worker`。

---

## 二、服务器前置条件

| 项 | 要求 |
|---|---|
| 配置 | 建议 2 核 4G 起（Prisma + NestJS + nginx + PG + Redis） |
| 软件 | Docker Engine 24+ 与 Compose v2；宝塔面板可选（用于反代/SSL/防火墙） |
| 域名 | 已解析到服务器；SSL 证书在宝塔站点申请（Let's Encrypt 即可） |
| 工具 | `node` 仅在跑 preflight / 备份脚本时需要；容器内已自带 Node 22 |

---

## 三、宝塔面板路线（推荐，贴合现有运维习惯）

1. **放代码**：仓库已公开，服务器可直接匿名拉取（**无需 deploy key / PAT**）：
   `git clone https://github.com/fuyegongfang-star/media-workbench.git /opt/media-workbench`。
   也可在宝塔「文件」上传项目 zip 解压到同一目录。
2. **建环境文件**：在 `/opt/media-workbench` 下执行
   `cp deploy/.env.prod.example .env`，然后编辑 `.env` 把所有 `<...>` 换成真实值。
   - `APP_MASTER_KEY`：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `JWT_SECRET`：`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `DATABASE_URL` 里的口令必须与 `POSTGRES_PASSWORD` **完全一致**，主机名必须是 `postgres`。
   - `CORS_ORIGIN` 改成 `https://你的域名`。
3. **上线前自检**：`node scripts/preflight.mjs`，必须 `FAIL 0` 才继续。
4. **导入编排**：宝塔 → Docker → 「编排 / Compose」→ 新建，选择或粘贴 `docker-compose.prod.yml`，
   项目目录设为 `/opt/media-workbench`，环境变量文件选 `.env`，启动。
   > 若宝塔版本只支持直接上传 compose 文件，上传 `docker-compose.prod.yml` 后在「容器编排」里创建即可。
5. **看迁移日志**：Docker → 容器 → `api` → 日志，应看到
   `[entrypoint] 执行 prisma migrate deploy` → `迁移完成` → `Nest application successfully started`。
6. **建站点反代**：宝塔 → 网站 → 添加站点（域名）→ 反向代理 → 目标 URL `http://127.0.0.1:8080` → 提交；
   再到「SSL」申请证书并开启强制 HTTPS。
7. **端口放行两道，缺一不可**：
   - 宝塔「安全」→ 防火墙：放行 **80 / 443**（不要放行 8080、5432、6379）。
   - 云厂商控制台 → 安全组：同样放行 **80 / 443**。
8. **按第六节核验清单逐条验收**。

---

## 四、命令行路线（等价）

```bash
git clone https://github.com/fuyegongfang-star/media-workbench.git /opt/media-workbench
cd /opt/media-workbench
cp deploy/.env.prod.example .env
# 编辑 .env 填真实值（务必替换全部 <...>）
node scripts/preflight.mjs

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api     # 看迁移与启动日志
curl --noproxy '*' http://127.0.0.1:8080/api/health
```

常用运维：

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml down            # 停服（卷数据保留）
docker compose -f docker-compose.prod.yml logs --tail=200 api

# 手动迁移（SKIP_MIGRATE=1 时）
npm run migrate:deploy

# 备份（宿主机执行，产物落 BACKUP_ROOT）
npm run backup
```

更新版本：`git pull` → `npm run preflight` → `docker compose -f docker-compose.prod.yml build` → `up -d`
（容器启动时会自动跑增量迁移）。

---

## 五、第一次上线最容易踩的坑

| 现象 | 原因 / 处理 |
|---|---|
| nginx 502 / `connect() failed` | `HOST` 不是 `0.0.0.0`；或 `api` 还没 healthy（等迁移跑完，看日志） |
| API 启动即退出，提示 `[env] 缺失或仍是占位符` | `.env` 里 `DATABASE_URL` / `APP_MASTER_KEY` / `JWT_SECRET` 还有 `<...>` 没替换 |
| 连不上数据库 | `DATABASE_URL` 主机名写成 `localhost`（应 `postgres`），或口令与 `POSTGRES_PASSWORD` 不一致 |
| 迁移报 `permission denied to create extension "pg_trgm"` | `0002_trgm_search` 需要建扩展权限。用官方 `postgres:16-alpine` 镜像时 `POSTGRES_USER` 即 superuser，正常可过；若改用云托管 PG，需先在控制台开通 `pg_trgm` 扩展 |
| 迁移报「表/枚举已存在」 | 目标库不是空库。新部署请用全新 `pgdata` 卷；不要对已有旧库直接跑 |
| 看到 `0004_*` / `0005_*` 各有两个目录，担心重复执行 | 属历史命名，Prisma 按目录名字典序执行全部 22 个 SQL；其中 seed 迁移只依赖 `0001_init` 建的 `prompt_templates` 表，已核对无跨依赖 |
| `Worker 未启动（Redis 不可用，待环境）` | `REDIS_HOST` 不是 `redis`，或 `REDIS_PASSWORD` 填了带尖括号的占位符（服务端设了密码、客户端却跳过），或 Redis 未 healthy |
| 登录 401 / 前端一直跳登录 | `JWT_SECRET` 每次部署都变会让旧令牌失效；确认首次登录后立即改初始口令 |
| 任务状态 SSE 不刷新 | nginx 已配 `proxy_buffering off`；若前面还挂了宝塔反代，也要在该层关闭缓冲 |
| AI 功能报错但页面正常 | `LLM_API_KEY` 未填或供应商不可达；服务按设计不阻断启动，日志会如实标失败 |

---

## 六、首次上线核验清单（逐条打勾再正式用）

1. [ ] `api` 日志出现 `迁移完成`，且 `prisma migrate deploy` 无 SQL 报错（**22 个迁移第一次在真库执行**）。
2. [ ] `GET /api/health` 返回 200，且 `dependencies.postgres` / `redis` 从 `unavailable` 变为可用
       （此前所有「待环境」标记在这一步才真正翻绿）。
3. [ ] 登录 round-trip：`POST /api/auth/login` 用 `INITIAL_USERNAME` / `INITIAL_PASSWORD` 拿到令牌，
       `GET /api/auth/me` 带令牌返回 200；**随后立即修改初始口令**。
4. [ ] 队列：创建一个生成任务，日志出现 `BullMQ Worker 已启动` 且任务从 `queued` 流转，不是一直堆积。
5. [ ] AI 闭环：配好 `LLM_API_KEY` 后跑一次单篇拆解 / 标题生成，确认真实模型调用成功、失败有兜底。
6. [ ] 前端：打开 `https://域名`，导航各模块可点，「工作台」健康检查显示数据库/队列在线。
7. [ ] 持久化：上传一个附件 → `docker compose restart api` → 文件与数据仍在（卷生效）。
8. [ ] 备份：`npm run backup` 产物落到 `BACKUP_ROOT`；按 `restore.md` 至少做一次恢复演练。
9. [ ] 定时备份：`deploy/backup.cron.example` 配到 crontab；确认 `pg_dump` 可用（容器内可用
       `docker compose exec postgres pg_dump`）。
10. [ ] 防火墙：宝塔「安全」+ 云安全组都只放 80/443，8080/5432/6379 未对公网开放。

---

## 七、回滚与数据安全

- 卷：`pgdata`（库）、`redisdata`（队列）、`storage`（附件），`docker compose down` **不会**删除。
- 恢复流程见仓库根 `restore.md`；数据库用 `pg_dump` 逻辑备份，附件用 `storage-latest` 镜像。
- 密钥：`.env` 与 `APP_MASTER_KEY` 一旦丢失，已加密入库的供应商密钥无法解密 —— 请离线妥善备份 `.env`，
  且 **绝不入库 / 不写日志 / 不贴到工单**。更换 `APP_MASTER_KEY` 前需重新录入所有供应商密钥。
