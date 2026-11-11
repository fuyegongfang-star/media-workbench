# T5.1 试运行 — 字段继承观察清单

> 生成时间：2026-11-08T17:04:22.021Z
> 说明：用项目真实纯函数模块（server/dist）串起端到端流水线自检；真实素材端到端跑通需 PG/Redis/LLM 环境，标「待环境」。

## 一、流水线试跑日志

- [1 拆解] 占位符替换 + JSON 解析 OK → analysis.theme=定位
- [2 汇总] 策略草稿规范化 OK → position={"核心定位":"P"}
- [3 绑定] 版本号自增 + 绑定/解绑 OK → nextVersion([1,2,3])=4
- [4 继承] 内容项目归属解析 + contextSnapshot 定格 OK → ownedAccountId=acc1
- [5 上下文] 账号实时 / 标题·选题快照 OK → account=账号A title=标题C
- [6 版本] versionNo 自增 + source 标签 OK → nextVersionNo(1)=2 label=AI 初稿
- [7 审核] 提交→待审→(清单全勾)通过 OK → PENDING_REVIEW→APPROVED
- [8 起号] 图片组拖拽重排 OK → reorder(["c","a"],[a,b,c])=["c","a","b"]
- [9 发布/效果] 真实回写 media_id/链接 + ContentMetric 拉取 → 待环境（需 PG/Redis/微信资质）

## 二、各阶段继承契约 & 风险点

| 阶段 | 继承字段 | 继承出错点风险 | 重复复制字段风险 | 状态 |
|---|---|---|---|---|
| 素材 → 单篇拆解 (Analysis) | theme / 痛点 / 钩子 / 结构 / 角度 / 调性 / 摘要 | 模板占位 {{title}}/{{body}} 未替换会把空值送进 LLM，产出空拆解 | 结构化字段与素材正文在 DB 双层存储（设计如此，非缺陷） | 代码就绪 |
| 拆解聚合 → 账号策略草稿 (AccountStrategy) | position / audience / pillars / titlePref / structure / tone / boundaries | analyses 列表为空时仍会生成草稿，需业务层拦截"无拆解不可汇总" | 草稿字段卡与单篇拆解字段存在语义重复，靠 prompt 约束收敛 | 代码就绪 |
| 账号策略 → 自有账号 (defaultStrategyVersionId) | ownedAccountId / strategyVersionId 经 T2.5 原子绑定 | 策略归属账号与绑定账号不一致时（跨账号绑定）应被校验拦截 | isDefault 标志与 defaultStrategyVersionId 外键两处易不一致 → 已收敛为单一绑定入口 | 代码就绪 |
| 选题 → 内容项目 (ContentProject) | ownedAccountId / strategyVersionId + contextSnapshot(标题/选题/策略/分析摘要) | 选题未绑策略(ok=false) 时项目无归属账号，需业务层拦截"无账号不可建项目" | 标题/选题文字同时存在于 ContentProject 与 Topic/TitleCandidate → 快照定格，源改后不漂移 | 代码就绪 |
| 创作上下文面板 (T3.3) | account/strategy 版本/提示词版本 = 实时；title/topic/摘要 = 快照 | ★ 高：标题/选题取"创建时快照"，源实体改名后面板不更新 —— 易误以为继承断裂 | 快照与实时投影并存，UI 需明确区分"定格值"与"实时值" | 代码就绪 |
| 内容版本链 (ContentVersion) | versionNo 单项目内单调自增 + source 枚举 | 并发保存版本时 versionNo 可能冲突 → 需事务内自增（已实现） | workingContent 不入版本，避免每版重复存全量正文 | 代码就绪 |
| 审核状态机 (T3.6) | 状态转移 + 审核清单硬卡点 | 退回到修改必须填意见、通过必须全勾选，否则卡点不通过（已实现） | 清单模板与 T3.11 合规预审卡点可能重复 → 应合并为单一清单源 | 代码就绪 |
| 起号图片组拖拽重排 (T4.2) | sortOrder 服务端按"真实存在集合"校验后赋值 | 前端伪造/重复 id 被丢弃，未提交真实 id 追加末尾（已实现） | 拖拽顺序与既有 order 需以服务端真实集合为准，避免客户端顺序覆盖 | 代码就绪 |
| 发布执行 + 效果回收 (T3.9 / T3.10) | ContentProject ← media_id / 文章链接；ContentMetric 按 externalMediaId 对齐 | 按 externalMediaId 对齐依赖 T3.9 回写；账号级涨粉/取关为近似归属（已 warn） | 多平台重复发布会产生多条 metric，需 externalMediaId 去重 | 待环境 |

## 三、T5.2 调优待办（基于上述观察）

- ★ 创作上下文面板：标题/选题取"创建时快照"，源实体改名后面板不更新 —— 需在 UI 明示"定格值"，或提供一键刷新快照入口。
- 审核清单模板与 T3.11 合规预审卡点应合并为单一清单源，避免两处维护不一致。
- 策略 isDefault 标志与 defaultStrategyVersionId 外键已收敛为单一绑定入口（T2.5），确认前端不再直写 isDefault。
- 真实素材跑通后，重点核验：选题未绑策略时是否拦截建项目、跨账号绑定是否被校验拦截。
- 发布/效果环节需在真实环境验证 externalMediaId 对齐去重与账号级指标近似归属。

## 四、真实环境跑通方式（待环境）

1. 准备 PostgreSQL16 + Redis（见 docker-compose.yml）。
2. 配置 LLM 密钥到环境变量（SystemConfig，加密入库，绝不写日志）。
3. `npm run build && npm start` 后，按 Stage1→9 顺序用真实素材走通；本脚手架的断言可改写为真实链路集成测试。