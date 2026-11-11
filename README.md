# 自媒体工作台 · media-workbench

面向个人 / 小团队的自媒体内容生产工作台。把「对标拆解 → 账号策略 → 选题标题 → 内容创作 → 审核发布 → 效果回收 → 成本核算」串成一条可追溯的流水线。

**当前状态**：v0.1.0 基线，排期 34/34 功能已实现（进度真相源见 [`进度.md`](进度.md)）。架构为**模块化单体**，不是微服务。

> ⚠️ **诚实声明**：项目在开发环境通过了构建、类型检查与 332 个单元测试，但**从未在真实 PostgreSQL / Redis / LLM 上跑通完整链路**。22 个数据库迁移、登录 round-trip、BullMQ 消费、真实模型调用、Docker 镜像构建，全部属于首次上线验证项。健康检查在依赖不可用时如实返回 `unavailable`，不伪造通过。上线前请按 [部署指南第六节](deploy/README.md) 逐条验收。

---

## 功能模块

| 模块 | 主要能力 |
| --- | --- |
| 工作台 / 可观测性 | 服务健康、依赖状态、任务概览、运行日志 |
| 对标分析 / 账号与策略 | 单篇拆解、策略草稿、策略版本绑定、对标账号库 |
| 内容项目 | 选题标题 → 创作上下文 → 版本链 → 审核状态机 → 合规预审 |
| 起号计划 / 内容日历 / 素材库 / 批量操作 | 图片组拖拽、排期、素材沉淀、批量导入导出 |
| 效果看板 / 成本看板 | 发布回写、指标回收、模型调用成本核算 |
| 系统设置 | 站点设置、运营配置、供应商密钥（加密入库）、通知、备份 |

前端 12 个导航入口 + 1 个内容项目详情页，路由见 [`web/src/router/index.ts`](web/src/router/index.ts)。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | NestJS 11 + TypeScript，模块化单体 |
| 数据 | PostgreSQL 16 + Prisma 6（22 个迁移），`pg_trgm` 检索 |
| 队列 | BullMQ + Redis 7（Worker **内嵌在 API 进程**，无需独立进程） |
| 前端 | Vue 3 + Vite 6 + vue-router + Pinia + Naive UI |
| AI | OpenAI 兼容供应商 / 检测 / 润色三个可替换 Provider |
| 部署 | Docker 多阶段构建 + nginx（SPA + `/api` 反代，SSE 关闭缓冲） |

---

## 本地开发

前置：Node.js >= 22、npm、PostgreSQL 16、Redis 7。没有本机数据库时可用仓库根的 `docker-compose.yml` 起依赖。

```bash
git clone https://github.com/fuyegongfang-star/media-workbench.git
cd media-workbench

cp .env.example .env          # 必填：把所有 <...> 换成真实值
npm run install:all           # 分别安装 server/ 与 web/ 依赖（未用 workspaces）

docker compose up -d          # 起 PG16 + Redis；已装本机数据库可跳过

npm run prisma:generate
npm run migrate:deploy        # 22 个迁移
npm run build                 # 构建 server + web
npm start                     # API: http://127.0.0.1:3001/api
npm --prefix web run dev      # 前端: http://127.0.0.1:5173（/api 已配代理）
```

Prisma CLI 从 `server/` 目录运行，若报读不到 `DATABASE_URL`，把 `.env` 再复制一份到 `server/.env`（该文件同样已被 `.gitignore` 忽略，不会入库）。

常用校验：

```bash
npm run typecheck                    # 前后端类型检查
npm run validate                     # prisma validate（同样需 DATABASE_URL）
npm run trial                        # 纯函数端到端流水线自检
npm run health                       # 需 API 已启动
node --test server/test/*.test.mjs   # 单元测试
```

> `.env` 绝不入库。`APP_MASTER_KEY` 用于加密供应商密钥，**丢失后已加密数据无法解密**，请离线备份。

---

## 生产部署

完整指南见 **[`deploy/README.md`](deploy/README.md)**：宝塔面板逐步操作、命令行等价流程、首次上线 10 项核验清单、常见故障对照表、回滚与备份。

最短路径：

```bash
git clone https://github.com/fuyegongfang-star/media-workbench.git /opt/media-workbench
cd /opt/media-workbench
cp deploy/.env.prod.example .env     # 逐项替换 <...>；数据库主机名必须是 postgres
npm run preflight                    # 必须 FAIL 0 才继续
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
curl --noproxy '*' http://127.0.0.1:8080/api/health
```

关键约束：

- `web` 只绑 `127.0.0.1:8080`，由宝塔站点 / 云 LB 反代并终止 HTTPS；PG / Redis **不暴露宿主端口**。
- 容器启动时自动执行 `prisma migrate deploy`（可设 `SKIP_MIGRATE=1` 关闭）。
- 端口放行要做**两处**：宝塔「安全」防火墙 + 云厂商安全组，只开 80 / 443。
- **首次登录后立即修改 `INITIAL_PASSWORD`**。
- 备份与恢复流程见 [`restore.md`](restore.md)，定时示例见 `deploy/backup.cron.example`。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`PRD评审报告.md`](PRD评审报告.md) | 需求缺口与风险评审 |
| [`技术方案与任务拆分.md`](技术方案与任务拆分.md) | 架构决策与任务拆分 |
| [`深入设计.md`](深入设计.md) | 四大高风险模块详细设计 |
| [`功能遗漏盘点.md`](功能遗漏盘点.md) | 基于真实运营场景的补漏清单 |
| [`开发排期.md`](开发排期.md) | 72 人天 / 15 周排期与任务编号 |
| [`进度.md`](进度.md) | 开发进度真相源（含每晚自验证据） |
| [`deploy/README.md`](deploy/README.md) | 生产部署指南 |
| [`restore.md`](restore.md) | 备份与恢复手册 |
| [`trial-run.report.md`](trial-run.report.md) | 字段继承观察清单 |
| [`preview.html`](preview.html) | 离线界面快照：零依赖单文件，双击即看；非实时、按钮不可提交 |

---

## 目录结构

```
server/                  NestJS 模块、Prisma schema 与 22 个迁移、单元测试
web/                     Vue3 SPA（views / router / api / stores）
scripts/                 健康检查、preflight、备份、试运行、诊断脚本
deploy/                  nginx 配置、entrypoint、生产环境变量模板、定时备份示例
Dockerfile               三阶段多阶段构建
docker-compose.prod.yml  生产编排（postgres / redis / api / web）
docker-compose.yml       本地开发依赖（PG16 + Redis）
```

---

## 安全约定

- 密钥与口令只走环境变量 + `*.example` 占位模板，禁止硬编码、禁止写入日志。
- 供应商 API Key 经 `SystemConfig.apiKeyEncrypted` 加密入库，前端只拿到脱敏视图。
- 数据库查询参数绑定、用户输入转义；上传 50MB 上限；附件按 sha256 内容寻址去重。
- 仓库不含 `.env`、`node_modules/`、`dist/`、`storage/`、`backups/` 及任何密钥材料；`.gitattributes` 锁定全仓 LF，避免 Linux 容器脚本因 CRLF 启动失败。

## 许可证

尚未指定开源许可证。公开可读不等于授予使用 / 修改 / 分发许可，当前默认保留所有权利。
