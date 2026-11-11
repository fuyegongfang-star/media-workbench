# 生产部署指南（云服务器 / 宝塔面板）

> 适用：`docker-compose.prod.yml`（PG16 + Redis + API + nginx 前端）+ `deploy/bootstrap.sh` 一键部署。
> **诚实前置声明**：本项目此前从未在真实 PostgreSQL / Redis 上跑过一次（本机无 Docker / PG / Redis），
> 22 个迁移、登录 round-trip、BullMQ 消费、AI 调用**全部属于首次上线验证**；`Dockerfile` 镜像构建与
> compose 启动也**未在本机端到端执行过**。一键脚本本机已验证：shell 语法、`--env-only` 配置生成、
> 生成结果通过 `preflight`（PASS 25 / WARN 3 / FAIL 0）。真机首次上线请仍按第六节逐条核验。

---

## 〇、一键部署（推荐）

```bash
git clone https://github.com/fuyegongfang-star/media-workbench.git /opt/media-workbench
cd /opt/media-workbench
./deploy/bootstrap.sh          # 生成 .env → build → up -d → 等待健康检查 → 打印初始口令
```

常用变体：

```bash
./deploy/bootstrap.sh --domain https://wb.example.com --local  # 挂反代 + HTTPS
./deploy/bootstrap.sh --port 9000                               # 改对外端口
./deploy/bootstrap.sh --env-only                                # 只生成 .env 供自检
./deploy/bootstrap.sh --no-build                                # 已有镜像，快速重启
git pull && ./deploy/bootstrap.sh                               # 更新版本（自动增量迁移）
```

脚本自动完成：生成 64 位 `APP_MASTER_KEY`、96 位 `JWT_SECRET`、48 位数据库口令与 16 位初始口令
→ 清空所有可选 `<...>` 占位符 → `.env` 权限 600 → `up -d --build` → 轮询 `/api/health`
→ 打印访问地址与**一次性初始口令**。

**幂等**：已存在 `.env` 时绝不覆盖。`APP_MASTER_KEY` 一旦轮换，库里已加密的供应商密钥将无法解密；
只有显式 `--reset-env` 才会重新生成。

> 省略 `--domain` 时会取服务器首个 IP 生成 `http://<IP>:<端口>`，默认绑 `0.0.0.0`。
> 前面有宝塔 / nginx 反代时请加 `--local` 只绑回环。当前是 **HTTP 明文**，公网务必反代并启用 HTTPS。
> 依赖只有 Docker Engine 24+ / Compose v2 / openssl / GNU sed，**不需要宿主机 Node、psql 或 nginx**。

下面第一～七节是原理、宝塔逐步操作、核验清单与回滚，手动部署或排障时再看。

---

## 一、架构与端口

```
浏览器 ──HTTPS──> 宝塔站点 / 云 LB ──> web(nginx 容器:80) ──静态文件 / SPA
                                      └── /api/* 反代 ──> api(NestJS:3001)
                                                            ├── postgres:5432（仅内网）
                                                            ├── redis:6379（仅内网）
                                                            └── /app/storage（持久卷）
```

- `web` 一键部署默认绑 `0.0.0.0:8080`（`WEB_HOST`/`WEB_PORT`）；加 `--local` 则只绑 `127.0.0.1`，由宝塔站点反代并终止 HTTPS。
- PG / Redis **不暴露宿主端口**，只有 compose 内网可达。
- `api` 容器启动时自动执行 `prisma migrate deploy`（可用 `SKIP_MIGRATE=1` 关闭）。
- BullMQ Worker **内嵌在 API 进程**（`TaskWorkerService`），不需要、也不要单独起 `npm run worker`。
- `backup` 服务带 `profiles: ["backup"]`，**不会随 `up -d` 启动**，只在 `./deploy/backup.sh` 时按需运行。

---

## 二、服务器前置条件

| 项 | 要求 |
|---|---|
| 配置 | 建议 2 核 4G 起（Prisma + NestJS + nginx + PG + Redis） |
| 软件 | Docker Engine 24+ 与 Compose v2、openssl、GNU sed（一般 Linux 自带）；宝塔面板可选 |
| 域名 | 已解析到服务器，SSL 在宝塔站点申请（Let's Encrypt 即可）；无域名可先用 IP 跑通 |
| Node | **一键部署不需要宿主机 Node**：编译在镜像内、迁移在容器启动时；仅手动跑 `preflight` 才需要 |

---

## 三、宝塔面板路线（贴合现有运维习惯）

1. **放代码 + 启动**：仓库公开，服务器可匿名拉取（**无需 deploy key / PAT**）：
   `git clone https://github.com/fuyegongfang-star/media-workbench.git /opt/media-workbench`，
   然后 `./deploy/bootstrap.sh --local`。也可在宝塔「文件」上传项目 zip 解压到同一目录。
2. **（可选）上线前自检**：`node scripts/preflight.mjs`（需宿主机 Node），必须 `FAIL 0` 才继续。
   一键脚本生成的配置已验证 `PASS 25 / WARN 3 / FAIL 0`，WARN 均为未配置 AI 密钥。
3. **手工配置 `.env` 的要点**（仅当不用一键脚本）：`cp deploy/.env.prod.example .env` 后逐项替换：
   - `APP_MASTER_KEY`：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `JWT_SECRET`：`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `DATABASE_URL` 里的口令必须与 `POSTGRES_PASSWORD` **完全一致**，主机名必须是 `postgres`。
   - 所有可选 `<...>`（LLM / 检测 / 润色）要么填真值、要么**留空**；留着尖括号会被当成真实值。
   - `CORS_ORIGIN` 改成真实访问地址。
4. **导入编排**（宝塔 UI 等价路径）：宝塔 → Docker → 「编排 / Compose」→ 新建，选择或粘贴
   `docker-compose.prod.yml`，项目目录设为 `/opt/media-workbench`，环境变量文件选 `.env`，启动。
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
# 一条命令即可（等价于下面全部步骤）
./deploy/bootstrap.sh

# 手动等价流程（需要自定义时）
cp deploy/.env.prod.example .env
# 编辑 .env 填真实值（务必替换或清空全部 <...>）
node scripts/preflight.mjs          # 可选，需宿主机 Node
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f api
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

# 完整备份（数据库 + 附件；走 compose 内 postgres 容器，宿主机无需 psql / Node）
./deploy/backup.sh
```

更新版本：`git pull && ./deploy/bootstrap.sh`（沿用已有 `.env`，不轮换密钥；容器启动时自动跑增量迁移）。

---

## 五、第一次上线最容易踩的坑

| 现象 | 原因 / 处理 |
|---|---|
| 执行 `bootstrap.sh` 报缺少 openssl | 安装 `openssl`；Debian/Ubuntu `apt install -y openssl`，Alpine `apk add openssl` |
| 健康检查 4 分钟仍未就绪 | 首次要跑 22 个迁移，先看 `docker compose -f docker-compose.prod.yml logs --tail=100 api`；容器仍在后台启动，不代表失败 |
| nginx 502 / `connect() failed` | `HOST` 不是 `0.0.0.0`；或 `api` 还没 healthy（等迁移跑完，看日志） |
| API 启动即退出，提示 `[env] 缺失或仍是占位符` | `.env` 里 `DATABASE_URL` / `APP_MASTER_KEY` / `JWT_SECRET` 还有 `<...>` 没替换（用一键脚本可避免） |
| 起来了却登录不了 | `INITIAL_PASSWORD` 未配置时应用跳过初始用户播种；一键脚本会自动生成并打印 |
| 连不上数据库 | `DATABASE_URL` 主机名写成 `localhost`（应 `postgres`），或口令与 `POSTGRES_PASSWORD` 不一致 |
| 迁移报 `permission denied to create extension "pg_trgm"` | `0002_trgm_search` 需要建扩展权限。用官方 `postgres:16-alpine` 镜像时 `POSTGRES_USER` 即 superuser，正常可过；若改用云托管 PG，需先在控制台开通 `pg_trgm` |
| 迁移报「表/枚举已存在」 | 目标库不是空库。新部署请用全新 `pgdata` 卷；不要对已有旧库直接跑 |
| 看到 `0004_*` / `0005_*` 各有两个目录，担心重复执行 | 属历史命名，Prisma 按目录名字典序执行全部 22 个 SQL；其中 seed 迁移只依赖 `0001_init` 建的 `prompt_templates` 表，已核对无跨依赖 |
| `Worker 未启动（Redis 不可用，待环境）` | `REDIS_HOST` 不是 `redis`，或 `REDIS_PASSWORD` 填了带尖括号的占位符，或 Redis 未 healthy |
| 登录 401 / 前端一直跳登录 | `JWT_SECRET` 每次部署都变会让旧令牌失效；确认首次登录后立即改初始口令 |
| 任务状态 SSE 不刷新 | nginx 已配 `proxy_buffering off`；若前面还挂了宝塔反代，也要在该层关闭缓冲 |
| AI 功能报错但页面正常 | `LLM_API_KEY` 未填或供应商不可达；服务按设计不阻断启动，日志会如实标失败 |

---

## 六、首次上线核验清单（逐条打勾再正式用）

1. [ ] `api` 日志出现 `迁移完成`，且 `prisma migrate deploy` 无 SQL 报错（**22 个迁移第一次在真库执行**）。
2. [ ] `GET /api/health` 返回 200，且 `dependencies.postgres` / `redis` 从 `unavailable` 变为可用
       （此前所有「待环境」标记在这一步才真正翻绿）。
3. [ ] 登录 round-trip：`POST /api/auth/login` 用一键脚本打印的账号口令拿到令牌，
       `GET /api/auth/me` 带令牌返回 200；**随后立即修改初始口令**。
4. [ ] 队列：创建一个生成任务，日志出现 `BullMQ Worker 已启动` 且任务从 `queued` 流转，不是一直堆积。
5. [ ] AI 闭环：配好 `LLM_API_KEY` 后跑一次单篇拆解 / 标题生成，确认真实模型调用成功、失败有兜底。
6. [ ] 前端：打开 `https://域名`，导航各模块可点，「工作台」健康检查显示数据库/队列在线。
7. [ ] 持久化：上传一个附件 → `docker compose restart api` → 文件与数据仍在（卷生效）。
8. [ ] 备份：`./deploy/backup.sh` 产物落到 `BACKUP_ROOT`；按 `restore.md` 至少做一次恢复演练。
9. [ ] 定时备份：把 `deploy/backup.cron.example` 配到 crontab；确认无需宿主机 `pg_dump` 也能跑通。
10. [ ] 防火墙：宝塔「安全」+ 云安全组都只放 80/443，8080/5432/6379 未对公网开放。

---

## 七、回滚与数据安全

- 卷：`pgdata`（库）、`redisdata`（队列）、`storage`（附件），`docker compose down` **不会**删除。
- 备份：`./deploy/backup.sh` 在 compose 网络内用 `pg_dump` 导出数据库，并直接挂载 `storage` 卷复制附件；
  产物落 `.env` 的 `BACKUP_ROOT`，定时示例见 `deploy/backup.cron.example`。
- 恢复流程见仓库根 `restore.md`；数据库用 `pg_dump` 逻辑备份，附件用 `storage-latest` 镜像。
- 密钥：`.env` 与 `APP_MASTER_KEY` 一旦丢失，已加密入库的供应商密钥无法解密 —— 请离线妥善备份 `.env`，
  且 **绝不入库 / 不写日志 / 不贴到工单**。更换 `APP_MASTER_KEY` 前需重新录入所有供应商密钥。
