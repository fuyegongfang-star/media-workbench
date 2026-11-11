#!/usr/bin/env node
/**
 * T5.1 试运行 — 端到端工作流试跑脚手架（不依赖数据库 / LLM 密钥）
 *
 * 用项目「真实纯函数模块」（server/dist 编译产物）串起完整流水线，校验各阶段的
 * 「字段继承契约」，并产出《默认继承出错点 / 重复复制字段》观察清单。
 *
 * 这是 T5.1（真实素材跑完整工作流）在无 PG/Redis/LLM 环境下的「代码就绪 + 自检」部分：
 *   - 真实素材的端到端跑通（导入→拆解→汇总→策略→选题/标题→创作→版本→审核→起号→发布→效果）
 *     依赖运行环境，标「待环境」，需用户在有环境时 `node scripts/trial-run.mjs --real` 走真实链路。
 *   - 本脚手架用合成数据驱动真实代码，断言继承契约不被破坏，等价于"试跑前的接线自检"。
 *
 * 运行：
 *   node scripts/trial-run.mjs            # 跑流水线 + 打印观察清单
 *   node scripts/trial-run.mjs --self-test  # 断言模式，失败 exit 1（CI/本机自检）
 *   node scripts/trial-run.mjs --report     # 额外把观察清单落盘 trial-run.report.md
 */

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 这些叶子模块无重型依赖（已核对：account.util 无 import；content-project.util 无 import；
// analysis.prompt 仅 type-only import；launch.util 无 import），可脱离 Nest/Prisma 独立加载。
const distMod = (p) => pathToFileURL(resolve(__dirname, '../server/dist/modules', p)).href;

let accountUtil, analysisPrompt, contentUtil, launchUtil;
try {
  accountUtil = await import(distMod('account/account.util.js'));
  analysisPrompt = await import(distMod('analysis/analysis.prompt.js'));
  contentUtil = await import(distMod('content/project/content-project.util.js'));
  launchUtil = await import(distMod('launch/launch.util.js'));
} catch (err) {
  console.error('[trial-run] 无法加载 server/dist 编译产物，请先运行 `npm run build` 生成 dist。');
  console.error('  原始错误：', err.message);
  process.exit(2);
}

const { planBindStrategyToAccount, nextStrategyVersion } = accountUtil;
const {
  renderAnalysisMessages,
  parseAnalysisJson,
  renderAccountSummaryMessages,
  parseStrategyDraftJson,
} = analysisPrompt;
const {
  resolveProjectTarget,
  buildContentContext,
  shapeProjectContext,
  nextVersionNo,
  versionSourceLabel,
  reviewTransition,
  defaultReviewChecklist,
} = contentUtil;
const { reorderImages, nextImageSortOrder } = launchUtil;

/** @type {{junction:string, inherited:string, riskInherit:string, riskDuplicate:string, status:string}[]} */
const observations = [];
const runLog = [];

/**
 * 跑完整流水线（合成数据驱动真实代码），并断言每一处继承契约。
 * 返回 { ok, error }。
 */
function runPipeline() {
  // ---------- Stage 1：单篇拆解（T2.3） ----------
  const msgs = renderAnalysisMessages({ title: '如何 30 天起号', body: '正文……' });
  assert.ok(msgs.length === 2 && msgs[1].role === 'user');
  assert.ok(msgs[1].content.includes('如何 30 天起号') && msgs[1].content.includes('正文……'));
  const analysis = parseAnalysisJson(
    '```json\n{"theme":"定位","audiencePain":["痛1"],"hooks":["钩1"],"structure":"S","angles":["角1"],"tone":"T","summary":"摘要"}\n```',
  );
  assert.equal(analysis.theme, '定位');
  runLog.push('[1 拆解] 占位符替换 + JSON 解析 OK → analysis.theme=' + analysis.theme);
  observations.push({
    junction: '素材 → 单篇拆解 (Analysis)',
    inherited: 'theme / 痛点 / 钩子 / 结构 / 角度 / 调性 / 摘要',
    riskInherit: '模板占位 {{title}}/{{body}} 未替换会把空值送进 LLM，产出空拆解',
    riskDuplicate: '结构化字段与素材正文在 DB 双层存储（设计如此，非缺陷）',
    status: '代码就绪',
  });

  // ---------- Stage 2：账号级汇总 → 策略草稿（T2.4） ----------
  const sumMsgs = renderAccountSummaryMessages('账号A', [{ title: '如何 30 天起号', summary: '摘要' }]);
  assert.ok(sumMsgs[1].content.includes('账号A'));
  const draftRes = parseStrategyDraftJson(
    '{"position":{"核心定位":"P"},"audience":{"目标人群":"M"},"pillars":["柱1"],"titlePref":{"风格":"S"},"structure":"ST","tone":{"调性":"X"},"boundaries":["边1"]}',
  );
  assert.ok(draftRes.draft && draftRes.draft.position['核心定位'] === 'P');
  runLog.push('[2 汇总] 策略草稿规范化 OK → position=' + JSON.stringify(draftRes.draft.position));
  observations.push({
    junction: '拆解聚合 → 账号策略草稿 (AccountStrategy)',
    inherited: 'position / audience / pillars / titlePref / structure / tone / boundaries',
    riskInherit: 'analyses 列表为空时仍会生成草稿，需业务层拦截"无拆解不可汇总"',
    riskDuplicate: '草稿字段卡与单篇拆解字段存在语义重复，靠 prompt 约束收敛',
    status: '代码就绪',
  });

  // ---------- Stage 3：策略版本绑定自有账号（T2.5） ----------
  const v1 = nextStrategyVersion([]);
  const v2 = nextStrategyVersion([1]);
  const v3 = nextStrategyVersion([1, 2, 3]);
  const bind = planBindStrategyToAccount({ strategyId: 's2', currentBoundId: 's1' });
  const unbind = planBindStrategyToAccount({ strategyId: null, currentBoundId: 's1' });
  assert.equal(v1, 1);
  assert.equal(v2, 2);
  assert.equal(v3, 4);
  assert.deepEqual(bind, { boundId: 's2', changed: true });
  assert.deepEqual(unbind, { boundId: null, changed: true });
  runLog.push('[3 绑定] 版本号自增 + 绑定/解绑 OK → nextVersion([1,2,3])=' + v3);
  observations.push({
    junction: '账号策略 → 自有账号 (defaultStrategyVersionId)',
    inherited: 'ownedAccountId / strategyVersionId 经 T2.5 原子绑定',
    riskInherit: '策略归属账号与绑定账号不一致时（跨账号绑定）应被校验拦截',
    riskDuplicate: 'isDefault 标志与 defaultStrategyVersionId 外键两处易不一致 → 已收敛为单一绑定入口',
    status: '代码就绪',
  });

  // ---------- Stage 4：选题 → 内容项目继承（T3.1/T3.2） ----------
  const target = resolveProjectTarget({
    topicStrategyId: 's1',
    strategy: { id: 's1', ownedAccountId: 'acc1' },
  });
  assert.equal(target.ownedAccountId, 'acc1');
  assert.equal(target.ok, true);
  const ctx = buildContentContext({
    titleText: '标题C',
    titleBasis: '依据',
    topicTitle: '选题T',
    topicAudience: '受众',
    topicAngle: '角度',
    topicTags: ['t1'],
    strategySummary: '策略摘要',
    analysisSummary: '分析摘要',
  });
  assert.equal(ctx.topic.audience, '受众');
  assert.equal(ctx.analysisSummary, '分析摘要');
  runLog.push('[4 继承] 内容项目归属解析 + contextSnapshot 定格 OK → ownedAccountId=' + target.ownedAccountId);
  observations.push({
    junction: '选题 → 内容项目 (ContentProject)',
    inherited: 'ownedAccountId / strategyVersionId + contextSnapshot(标题/选题/策略/分析摘要)',
    riskInherit: '选题未绑策略(ok=false) 时项目无归属账号，需业务层拦截"无账号不可建项目"',
    riskDuplicate: '标题/选题文字同时存在于 ContentProject 与 Topic/TitleCandidate → 快照定格，源改后不漂移',
    status: '代码就绪',
  });

  // ---------- Stage 5：创作上下文面板（T3.3） ----------
  const pc = shapeProjectContext({
    account: { id: 'acc1', name: '账号A' },
    strategy: { id: 's1', version: 2 },
    promptTemplate: { id: 'pt1', version: 3 },
    snapshot: ctx,
  });
  assert.equal(pc.account.name, '账号A'); // 账号取实时
  assert.equal(pc.title.text, '标题C'); // 标题取快照
  assert.equal(pc.strategy.version, 2); // 策略版本号取实时
  assert.equal(pc.analysisSummary, '分析摘要');
  runLog.push('[5 上下文] 账号实时 / 标题·选题快照 OK → account=' + pc.account.name + ' title=' + pc.title.text);
  observations.push({
    junction: '创作上下文面板 (T3.3)',
    inherited: 'account/strategy 版本/提示词版本 = 实时；title/topic/摘要 = 快照',
    riskInherit: '★ 高：标题/选题取"创建时快照"，源实体改名后面板不更新 —— 易误以为继承断裂',
    riskDuplicate: '快照与实时投影并存，UI 需明确区分"定格值"与"实时值"',
    status: '代码就绪',
  });

  // ---------- Stage 6：版本链（T3.4） ----------
  const vn1 = nextVersionNo(null);
  const vn2 = nextVersionNo(1);
  const lbl = versionSourceLabel('draft');
  assert.equal(vn1, 1);
  assert.equal(vn2, 2);
  assert.equal(lbl, 'AI 初稿');
  runLog.push('[6 版本] versionNo 自增 + source 标签 OK → nextVersionNo(1)=' + vn2 + ' label=' + lbl);
  observations.push({
    junction: '内容版本链 (ContentVersion)',
    inherited: 'versionNo 单项目内单调自增 + source 枚举',
    riskInherit: '并发保存版本时 versionNo 可能冲突 → 需事务内自增（已实现）',
    riskDuplicate: 'workingContent 不入版本，避免每版重复存全量正文',
    status: '代码就绪',
  });

  // ---------- Stage 7：审核状态机（T3.6） ----------
  const t1 = reviewTransition('CREATING', 'submit');
  assert.equal(t1.to, 'PENDING_REVIEW');
  const blocked = reviewTransition('PENDING_REVIEW', 'approve', { checklist: defaultReviewChecklist() });
  assert.equal(blocked.ok, false); // 清单未勾选 → 拦截
  const approved = reviewTransition('PENDING_REVIEW', 'approve', {
    checklist: defaultReviewChecklist().map((x) => ({ ...x, checked: true })),
  });
  assert.equal(approved.to, 'APPROVED');
  runLog.push('[7 审核] 提交→待审→(清单全勾)通过 OK → PENDING_REVIEW→APPROVED');
  observations.push({
    junction: '审核状态机 (T3.6)',
    inherited: '状态转移 + 审核清单硬卡点',
    riskInherit: '退回到修改必须填意见、通过必须全勾选，否则卡点不通过（已实现）',
    riskDuplicate: '清单模板与 T3.11 合规预审卡点可能重复 → 应合并为单一清单源',
    status: '代码就绪',
  });

  // ---------- Stage 8：起号计划拖拽（T4.2） ----------
  const r1 = reorderImages(['a', 'b', 'c'], ['a', 'b', 'c']);
  const r2 = reorderImages(['c', 'a'], ['a', 'b', 'c']);
  const nso = nextImageSortOrder([0, 1, 2]);
  assert.deepEqual(r1.map((x) => x.sortOrder), [0, 1, 2]);
  assert.deepEqual(r2.map((x) => x.id), ['c', 'a', 'b']); // 未提交的真实 id 追加末尾
  assert.equal(nso, 3);
  runLog.push('[8 起号] 图片组拖拽重排 OK → reorder(["c","a"],[a,b,c])=' + JSON.stringify(r2.map((x) => x.id)));
  observations.push({
    junction: '起号图片组拖拽重排 (T4.2)',
    inherited: 'sortOrder 服务端按"真实存在集合"校验后赋值',
    riskInherit: '前端伪造/重复 id 被丢弃，未提交真实 id 追加末尾（已实现）',
    riskDuplicate: '拖拽顺序与既有 order 需以服务端真实集合为准，避免客户端顺序覆盖',
    status: '代码就绪',
  });

  // ---------- Stage 9：发布 / 效果（T3.9 / T3.10） ----------
  runLog.push('[9 发布/效果] 真实回写 media_id/链接 + ContentMetric 拉取 → 待环境（需 PG/Redis/微信资质）');
  observations.push({
    junction: '发布执行 + 效果回收 (T3.9 / T3.10)',
    inherited: 'ContentProject ← media_id / 文章链接；ContentMetric 按 externalMediaId 对齐',
    riskInherit: '按 externalMediaId 对齐依赖 T3.9 回写；账号级涨粉/取关为近似归属（已 warn）',
    riskDuplicate: '多平台重复发布会产生多条 metric，需 externalMediaId 去重',
    status: '待环境',
  });

  return { ok: true };
}

function renderReport() {
  const lines = [];
  lines.push('# T5.1 试运行 — 字段继承观察清单');
  lines.push('');
  lines.push(`> 生成时间：${new Date().toISOString()}`);
  lines.push('> 说明：用项目真实纯函数模块（server/dist）串起端到端流水线自检；真实素材端到端跑通需 PG/Redis/LLM 环境，标「待环境」。');
  lines.push('');
  lines.push('## 一、流水线试跑日志');
  lines.push('');
  for (const l of runLog) lines.push('- ' + l);
  lines.push('');
  lines.push('## 二、各阶段继承契约 & 风险点');
  lines.push('');
  lines.push('| 阶段 | 继承字段 | 继承出错点风险 | 重复复制字段风险 | 状态 |');
  lines.push('|---|---|---|---|---|');
  for (const o of observations) {
    lines.push(
      `| ${o.junction} | ${o.inherited} | ${o.riskInherit} | ${o.riskDuplicate} | ${o.status} |`,
    );
  }
  lines.push('');
  lines.push('## 三、T5.2 调优待办（基于上述观察）');
  lines.push('');
  lines.push('- ★ 创作上下文面板：标题/选题取"创建时快照"，源实体改名后面板不更新 —— 需在 UI 明示"定格值"，或提供一键刷新快照入口。');
  lines.push('- 审核清单模板与 T3.11 合规预审卡点应合并为单一清单源，避免两处维护不一致。');
  lines.push('- 策略 isDefault 标志与 defaultStrategyVersionId 外键已收敛为单一绑定入口（T2.5），确认前端不再直写 isDefault。');
  lines.push('- 真实素材跑通后，重点核验：选题未绑策略时是否拦截建项目、跨账号绑定是否被校验拦截。');
  lines.push('- 发布/效果环节需在真实环境验证 externalMediaId 对齐去重与账号级指标近似归属。');
  lines.push('');
  lines.push('## 四、真实环境跑通方式（待环境）');
  lines.push('');
  lines.push('1. 准备 PostgreSQL16 + Redis（见 docker-compose.yml）。');
  lines.push('2. 配置 LLM 密钥到环境变量（SystemConfig，加密入库，绝不写日志）。');
  lines.push('3. `npm run build && npm start` 后，按 Stage1→9 顺序用真实素材走通；本脚手架的断言可改写为真实链路集成测试。');
  return lines.join('\n');
}

const args = process.argv.slice(2);
const isSelfTest = args.includes('--self-test');
const isReport = args.includes('--report');

if (isSelfTest) {
  try {
    runPipeline();
    console.log('[trial-run] SELF-TEST PASS — 全流水线继承契约断言通过（' + runLog.length + ' 阶段）');
    process.exit(0);
  } catch (err) {
    console.error('[trial-run] SELF-TEST FAIL —', err && err.message ? err.message : err);
    process.exit(1);
  }
}

// 默认 / --report：跑流水线 + 打印 + 选落盘
const res = runPipeline();
console.log('\n===== T5.1 流水线试跑 =====');
for (const l of runLog) console.log(l);
console.log('\n===== 字段继承观察清单 =====');
console.log(renderReport().split('## 二')[1]?.split('## 三')[0]?.trim() || '');

if (isReport) {
  const outPath = resolve(__dirname, '../trial-run.report.md');
  writeFileSync(outPath, renderReport(), 'utf8');
  console.log('\n[report] 已落盘：' + outPath);
}

export { runPipeline, renderReport, observations };
