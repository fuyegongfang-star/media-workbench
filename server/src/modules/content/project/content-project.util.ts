// ============ 内容项目继承上下文（T3.2）============
// 纯函数：解析归属账号/策略版本 + 构造继承上下文快照。不依赖数据库/LLM 密钥，可单测。

import { DICTIONARY_VERSION } from '../compliance/compliance-dictionary';
import { buildReviewChecklist } from './review-checklist.source';

export interface ContentContextInput {
  titleText: string;
  titleBasis?: string | null;
  topicTitle: string;
  topicAudience?: string | null;
  topicAngle?: string | null;
  topicTags?: unknown;
  strategySummary?: string;
  analysisSummary?: string;
}

export interface ContentProjectTarget {
  ownedAccountId: string | null;
  strategyVersionId: string | null;
  ok: boolean;
  /** 归属来源：strategy=选题绑定的策略；account=账号兜底（用户指定或默认账号）。 */
  source?: 'strategy' | 'account';
}

/**
 * 解析内容项目的归属账号与策略版本（两级）：
 * 1) 选题绑定的策略可解析到账号 → 沿用（原行为，保证从策略生成的选题继承风格基线）；
 * 2) 否则用兜底账号（用户建项目时指定 / 当前用户默认账号），常见于「选题雷达一键转选题」——
 *    这类选题天生没有 strategyId，不应因此无法立项（ContentProject.ownedAccountId 必填）。
 *    兜底账号的默认策略版本若有，一并继承为 strategyVersionId。
 * accountId 必须已由调用方校验归属（防止把项目建到别人的账号下）。
 */
export function resolveProjectTarget(input: {
  topicStrategyId: string | null;
  strategy?: { id: string; ownedAccountId: string } | null;
  accountId?: string | null;
  accountDefaultStrategyId?: string | null;
}): ContentProjectTarget {
  if (
    input.topicStrategyId &&
    input.strategy &&
    input.strategy.id === input.topicStrategyId &&
    input.strategy.ownedAccountId
  ) {
    return {
      ownedAccountId: input.strategy.ownedAccountId,
      strategyVersionId: input.strategy.id,
      ok: true,
      source: 'strategy',
    };
  }
  if (input.accountId) {
    return {
      ownedAccountId: input.accountId,
      strategyVersionId: input.accountDefaultStrategyId ?? null,
      ok: true,
      source: 'account',
    };
  }
  return { ownedAccountId: null, strategyVersionId: null, ok: false };
}

/**
 * 构建内容项目继承上下文快照（含标题/选题/策略摘要/分析摘要）。
 * 该快照在创建时定格，供 T3.3 上下文面板展示与 T3.5 生成渲染使用，不随原实体后续修改漂移。
 */
export function buildContentContext(input: ContentContextInput): Record<string, unknown> {
  return {
    title: input.titleText,
    titleBasis: input.titleBasis ?? null,
    topic: {
      title: input.topicTitle,
      audience: input.topicAudience ?? null,
      angle: input.topicAngle ?? null,
      tags: input.topicTags ?? [],
    },
    strategySummary: input.strategySummary || '',
    analysisSummary: input.analysisSummary || '',
  };
}

// ============ 创作上下文面板形状（T3.3）============
// 纯函数：把「实时关系投影 + 创建时定格的 contextSnapshot」整形成前端侧栏展示的「依据」。
// 不依赖数据库/LLM 密钥，可单测。

export interface ProjectContextTopic {
  title: string;
  audience: string | null;
  angle: string | null;
  tags: unknown;
}

export interface ProjectContextInput {
  account: { id: string; name: string } | null;
  strategy: { id: string; version: number } | null;
  promptTemplate: { id: string; version: number } | null;
  /** 创建时定格的快照（含 title/titleBasis/topic/strategySummary/analysisSummary）。 */
  snapshot: Record<string, unknown> | null;
}

/**
 * 创作上下文面板各字段的来源标记（T5.2）：
 *  - snapshot：创建时定格，源实体后续改名不影响此处（避免误判继承断裂）；
 *  - live：随绑定关系实时投影（账号/策略版本号/提示词模板版本号）。
 * 前端据此明示「定格值」与「实时值」，并可触发 refreshContext 重快照。
 */
export type FieldOrigin = 'snapshot' | 'live';
export type ContextFieldOrigins = Record<string, FieldOrigin>;

export interface ProjectContext {
  account: { id: string; name: string } | null;
  title: { text: string; basis: string | null } | null;
  topic: ProjectContextTopic | null;
  strategy: { id: string; version: number; summary: string } | null;
  promptTemplate: { id: string; version: number } | null;
  analysisSummary: string;
  /** 各字段来源标记（定格/实时），供 UI 区分展示。 */
  fieldOrigins: ContextFieldOrigins;
}

/**
 * 整形创作上下文面板数据：账户/标题/选题取快照（定格值，避免源实体漂移），
 * 策略版本号/提示词模板版本号取实时关系投影，策略摘要与分析摘要取快照。
 * 缺失字段一律降级为 null/''，不抛异常（边界安全）。
 */
export function shapeProjectContext(input: ProjectContextInput): ProjectContext {
  const snap = input.snapshot ?? {};
  const topic = snap['topic'] as ProjectContextTopic | undefined;
  const titleText = typeof snap['title'] === 'string' ? (snap['title'] as string) : '';
  const titleBasis = typeof snap['titleBasis'] === 'string' ? (snap['titleBasis'] as string) : null;
  const analysisSummary =
    typeof snap['analysisSummary'] === 'string' ? (snap['analysisSummary'] as string) : '';
  const strategySummary =
    typeof snap['strategySummary'] === 'string' ? (snap['strategySummary'] as string) : '';

  return {
    account: input.account ?? null,
    title: titleText ? { text: titleText, basis: titleBasis } : null,
    topic: topic
      ? {
          title: topic.title ?? '',
          audience: topic.audience ?? null,
          angle: topic.angle ?? null,
          tags: topic.tags ?? [],
        }
      : null,
    strategy: input.strategy
      ? { id: input.strategy.id, version: input.strategy.version, summary: strategySummary }
      : null,
    promptTemplate: input.promptTemplate ?? null,
    analysisSummary,
    // 来源标记：账号/策略版本号/提示词模板版本号取实时；标题/选题/策略摘要/分析摘要取定格快照。
    fieldOrigins: {
      account: 'live',
      title: 'snapshot',
      topic: 'snapshot',
      strategyVersion: 'live',
      strategySummary: 'snapshot',
      promptTemplate: 'live',
      analysisSummary: 'snapshot',
    },
  };
}

// ============ T3.4 版本链纯函数（不依赖数据库/LLM 密钥，可单测）============

/**
 * 计算下一条 ContentVersion 的 versionNo（单项目内单调递增）。
 * 返回 (当前最大 versionNo ?? 0) + 1；入参为 null/undefined 时从 1 开始。
 */
export function nextVersionNo(currentMax: number | null | undefined): number {
  return (currentMax ?? 0) + 1;
}

/** ContentVersion.source 枚举 → 中文展示标签（供版本历史 UI 使用）。 */
export const VERSION_SOURCE_LABELS: Record<string, string> = {
  manual: '人工保存',
  draft: 'AI 初稿',
  continue: '续写',
  rewrite: '改写',
  compress: '压缩',
  expand: '扩写',
  polish: '润色',
  detect: '检测',
};

/** 取版本来源的中文标签，未知值原样返回（边界安全）。 */
export function versionSourceLabel(source: string | null | undefined): string {
  if (!source) return '未知';
  return VERSION_SOURCE_LABELS[source] ?? source;
}

// ============ T3.6 审核状态机纯函数（不依赖数据库/LLM 密钥，可单测）============

/** 审核状态（与 ContentProjectStatus 审核相关取值对齐）。 */
export type ReviewStatus =
  | 'CREATING'
  | 'PENDING_REVIEW'
  | 'NEEDS_REVISION'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED';

/** 审核动作。 */
export type ReviewAction = 'submit' | 'send_back' | 'approve';

/** 单条审核清单项。 */
export interface ReviewChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  note?: string | null;
  /** 来源：static=人工可勾选项；compliance=由 T3.11 合规预审派生（单一清单源，T5.2）。 */
  source?: 'static' | 'compliance';
}

interface ReviewTransitionDef {
  from: ReviewStatus[];
  to: ReviewStatus;
  /** 执行前置条件（除状态外）：comment=需退回意见非空；checklist=需清单全勾选。 */
  requires?: 'comment' | 'checklist';
}

/**
 * 审核状态机定义（深入设计 §1.3）：
 *   CREATING --标记待审核--> PENDING_REVIEW
 *   PENDING_REVIEW --退回修改--> NEEDS_REVISION
 *   NEEDS_REVISION --重新提交--> PENDING_REVIEW
 *   PENDING_REVIEW/NEEDS_REVISION --通过--> APPROVED
 *   APPROVED --填发布信息--> PUBLISHED/ARCHIVED（由 T3.8 处理，不在此转移）
 */
export const REVIEW_TRANSITIONS: Record<ReviewAction, ReviewTransitionDef> = {
  submit: { from: ['CREATING', 'NEEDS_REVISION'], to: 'PENDING_REVIEW' },
  send_back: { from: ['PENDING_REVIEW'], to: 'NEEDS_REVISION', requires: 'comment' },
  approve: { from: ['PENDING_REVIEW', 'NEEDS_REVISION'], to: 'APPROVED', requires: 'checklist' },
};

export interface ReviewTransitionResult {
  ok: boolean;
  to?: ReviewStatus;
  error?: string;
}

/** 仅校验状态合法性（不校验 comment/checklist 前置条件，由 reviewTransition 补）。 */
export function reviewCanTransition(from: string, action: ReviewAction): ReviewTransitionResult {
  const def = REVIEW_TRANSITIONS[action];
  if (!def) return { ok: false, error: `未知审核动作：${action}` };
  if (!(def.from as string[]).includes(from)) {
    return {
      ok: false,
      error: `当前状态（${from}）不允许「${action}」，合法来源：${def.from.join('/')}`,
    };
  }
  return { ok: true, to: def.to };
}

/** 真实转移校验：状态合法前提下补校验 requires（comment 非空 / checklist 全勾选）。 */
export function reviewTransition(
  from: string,
  action: ReviewAction,
  opts?: { comment?: string; checklist?: ReviewChecklistItem[] },
): ReviewTransitionResult {
  const base = reviewCanTransition(from, action);
  if (!base.ok) return base;
  const def = REVIEW_TRANSITIONS[action];
  if (def.requires === 'comment') {
    if (!opts?.comment || !opts.comment.trim()) {
      return { ok: false, error: '退回修改必须填写退回意见' };
    }
  }
  if (def.requires === 'checklist') {
    if (!opts?.checklist || !reviewChecklistComplete(opts.checklist)) {
      return { ok: false, error: '审核清单未全部勾选，无法标记通过' };
    }
  }
  return { ok: true, to: def.to };
}

/** 审核清单是否全部勾选（空清单视为未完成：需至少一项且全勾）。 */
export function reviewChecklistComplete(items: ReviewChecklistItem[] | null | undefined): boolean {
  if (!items || items.length === 0) return false;
  return items.every((it) => !!it && it.checked === true);
}

/**
 * 默认审核清单模板（深入设计 §1.3）。
 * T5.2 起统一委托 review-checklist.source（单一清单源）：静态人工项 + 合规派生项，
 * 合规项随 DICTIONARY_VERSION 演进，避免与 T3.11 合规预审两处维护不一致。
 */
export function defaultReviewChecklist(): ReviewChecklistItem[] {
  return buildReviewChecklist(DICTIONARY_VERSION);
}

/** 安全校验并规整外部传入的清单项；返回 {ok, items, error}，不抛异常（纯函数，便于单测）。 */
export function validateReviewChecklistInput(input: unknown): {
  ok: boolean;
  items?: ReviewChecklistItem[];
  error?: string;
} {
  if (!Array.isArray(input)) return { ok: false, error: 'checklist 必须是数组' };
  const items: ReviewChecklistItem[] = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: `checklist[${i}] 必须是对象` };
    const o = raw as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label.slice(0, 200).trim() : '';
    if (!label) return { ok: false, error: `checklist[${i}].label 不能为空` };
    const checked = o.checked === true;
    const note = typeof o.note === 'string' ? o.note.slice(0, 500) : null;
    const id = typeof o.id === 'string' && o.id ? o.id.slice(0, 64) : `r${i + 1}`;
    const source = o.source === 'compliance' ? 'compliance' : 'static';
    items.push({ id, label, checked, note, source });
  }
  return { ok: true, items };
}

// ============ 草稿箱筛选条件（T6 体验优化）============
// 纯函数：把列表查询参数翻译成 Prisma where / orderBy，便于单测且不依赖数据库。

export const DRAFT_STATUSES = [
  'TOPIC_SELECTING', 'PENDING_CREATION', 'CREATING',
  'PENDING_REVIEW', 'NEEDS_REVISION', 'APPROVED',
] as const;
export const PUBLISHED_STATUSES = ['PUBLISHED', 'ARCHIVED'] as const;

export interface ProjectListFilter {
  ownedAccountId?: string;
  status?: string;
  q?: string;
  sort?: string;
}

/** 构造内容项目列表（草稿箱）的查询条件。status 支持语义值 draft / published。 */
export function buildProjectListQuery(filter: ProjectListFilter): {
  where: Record<string, unknown>;
  orderBy: { createdAt?: 'desc'; updatedAt?: 'desc' };
} {
  const where: Record<string, unknown> = {};
  if (filter.ownedAccountId) where.ownedAccountId = filter.ownedAccountId;
  if (filter.status === 'draft') {
    where.status = { in: [...DRAFT_STATUSES] };
  } else if (filter.status === 'published') {
    where.status = { in: [...PUBLISHED_STATUSES] };
  } else if (filter.status) {
    where.status = filter.status;
  }
  if (filter.q?.trim()) {
    const q = filter.q.trim();
    where.OR = [
      { selectedTitle: { text: { contains: q, mode: 'insensitive' } } },
      { topic: { title: { contains: q, mode: 'insensitive' } } },
      { workingContent: { contains: q } },
    ];
  }
  const orderBy = filter.sort === 'created' ? { createdAt: 'desc' as const } : { updatedAt: 'desc' as const };
  return { where, orderBy };
}
