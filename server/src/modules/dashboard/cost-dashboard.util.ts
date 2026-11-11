/**
 * T4.6 成本/配额看板 —— 纯函数层（不依赖 DB / 网络 / 密钥，可单测）。
 *
 * 职责：
 * - 查询构造（period/model/stage/status/日期范围过滤）、类型解析。
 * - 总览汇总、按模型聚合、按阶段聚合、按日时间序列。
 * - 配额预警：把「当月各模型花费」与「SystemConfig 月度预算」比对，给出 ok/warning/exceeded。
 *
 * 所有聚合为确定性纯函数，便于用 mock 行单测覆盖；DB 查询参数绑定（防注入）交给 Prisma 执行层。
 */

export type CostPeriod = '7d' | '30d' | 'thisMonth' | 'all';
export type QuotaStatus = 'ok' | 'warning' | 'exceeded';

/** 一条 GenerationRun 的最小投影（供聚合使用）。 */
export interface CostRunRow {
  model: string;
  stage: string;
  status: string;
  cost: number | null;
  durationMs: number | null;
  createdAt: Date | string;
  createdById?: string | null;
}

export interface CostQuery {
  period?: CostPeriod;
  model?: string;
  stage?: string;
  status?: string;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
  createdById?: string;
}

export interface CostTotals {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  runningRuns: number;
  queuedRuns: number;
  totalCost: number;
  totalDurationMs: number;
  avgDurationMs: number;
  successRate: number; // 0..1
}

export interface CostByModelRow {
  model: string;
  runs: number;
  success: number;
  failed: number;
  cancelled: number;
  totalCost: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

export interface CostByStageRow {
  stage: string;
  runs: number;
  success: number;
  failed: number;
  totalCost: number;
  avgDurationMs: number;
}

export interface CostDailyRow {
  date: string; // YYYY-MM-DD
  runs: number;
  success: number;
  failed: number;
  totalCost: number;
}

export interface QuotaBudget {
  provider: string;
  model: string;
  monthlyBudget: number;
}

export interface QuotaAlert {
  provider: string;
  model: string;
  budget: number;
  spent: number;
  ratio: number; // spent / budget
  status: QuotaStatus;
  hasRuns: boolean;
}

export interface QuotaSummary {
  totalBudget: number;
  totalSpent: number;
  anyExceeded: boolean;
  anyWarning: boolean;
  unconfiguredModels: string[];
}

const ALLOWED_PERIODS: CostPeriod[] = ['7d', '30d', 'thisMonth', 'all'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** 把任意输入安全归一到非负数值（NaN / 负数 / 非数 → 0）。 */
export function normalizeCost(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function normalizeDuration(v: unknown): number {
  return normalizeCost(v);
}

/** 月末对齐：把 Date 格式化为本地 YYYY-MM-DD。 */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 取当前月第一天 00:00。 */
export function getMonthStart(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * 把 HTTP 查询字符串 DTO（均为字符串）解析为强类型 CostQuery。
 * period 仅接受白名单值，非法/缺失回退 '30d'；model/stage/status 做基本清洗；日期需可解析。纯函数。
 */
export function parseCostQuery(dto: Record<string, any> = {}): CostQuery {
  const out: CostQuery = {};

  const period = dto.period as CostPeriod | undefined;
  out.period = period && ALLOWED_PERIODS.includes(period) ? period : '30d';

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const model = str(dto.model);
  if (model) out.model = model;
  const stage = str(dto.stage);
  if (stage) out.stage = stage;
  const status = str(dto.status);
  if (status) out.status = status;

  const from = str(dto.dateFrom);
  if (from && !Number.isNaN(Date.parse(from))) out.dateFrom = from;
  const to = str(dto.dateTo);
  if (to && !Number.isNaN(Date.parse(to))) out.dateTo = to;

  const uid = str(dto.createdById);
  if (uid) out.createdById = uid;

  return out;
}

/**
 * 把 period 解析为绝对时间范围（from/to）。'all' 返回 null 表示不限（由调用方按数据回退）。
 */
export function resolvePeriodRange(
  period: CostPeriod = '30d',
  now: Date = new Date(),
): { from: Date | null; to: Date | null } {
  switch (period) {
    case '7d':
      return { from: new Date(now.getTime() - 6 * DAY_MS), to: now };
    case '30d':
      return { from: new Date(now.getTime() - 29 * DAY_MS), to: now };
    case 'thisMonth':
      return { from: getMonthStart(now), to: now };
    case 'all':
    default:
      return { from: null, to: null };
  }
}

/**
 * 构造 Prisma where（参数绑定防注入；generation_runs 无软删作用域，无需注入 deletedAt）。
 * dateFrom/dateTo 与 period 同时存在时，取更严格的区间（period 优先，dateFrom/dateTo 收窄）。
 */
export function buildGenerationRunWhere(q: CostQuery): Record<string, any> {
  const where: Record<string, any> = {};
  if (q.model) where.model = q.model;
  if (q.stage) where.stage = q.stage;
  if (q.status) where.status = q.status;
  if (q.createdById) where.createdById = q.createdById;

  const range: Record<string, Date> = {};
  const periodRange = resolvePeriodRange(q.period);
  if (periodRange.from) range.gte = periodRange.from;
  if (periodRange.to) range.lte = periodRange.to;
  if (q.dateFrom) {
    const d = new Date(q.dateFrom);
    if (!Number.isNaN(d.getTime())) range.gte = range.gte ? new Date(Math.max(range.gte.getTime(), d.getTime())) : d;
  }
  if (q.dateTo) {
    const d = new Date(q.dateTo);
    if (!Number.isNaN(d.getTime())) range.lte = range.lte ? new Date(Math.min(range.lte.getTime(), d.getTime())) : d;
  }
  if (Object.keys(range).length) where.createdAt = range;
  return where;
}

/** 总览汇总：运行数（按状态拆分）、总花费、总/平均时长、成功率。 */
export function computeTotals(rows: CostRunRow[]): CostTotals {
  let totalRuns = 0;
  let successRuns = 0;
  let failedRuns = 0;
  let cancelledRuns = 0;
  let runningRuns = 0;
  let queuedRuns = 0;
  let totalCost = 0;
  let totalDurationMs = 0;
  let durationCount = 0;

  for (const r of rows) {
    totalRuns += 1;
    const s = (r.status || '').toLowerCase();
    if (s === 'success') successRuns += 1;
    else if (s === 'failed') failedRuns += 1;
    else if (s === 'cancelled') cancelledRuns += 1;
    else if (s === 'running') runningRuns += 1;
    else if (s === 'queued') queuedRuns += 1;

    const c = normalizeCost(r.cost);
    if (c > 0) totalCost += c;
    const d = normalizeDuration(r.durationMs);
    if (d > 0) {
      totalDurationMs += d;
      durationCount += 1;
    }
  }

  return {
    totalRuns,
    successRuns,
    failedRuns,
    cancelledRuns,
    runningRuns,
    queuedRuns,
    totalCost: Math.round(totalCost * 1e6) / 1e6,
    totalDurationMs,
    avgDurationMs: durationCount ? Math.round(totalDurationMs / durationCount) : 0,
    successRate: totalRuns ? successRuns / totalRuns : 0,
  };
}

/** 按模型聚合花费/次数/时长。 */
export function aggregateByModel(rows: CostRunRow[]): CostByModelRow[] {
  const map = new Map<string, CostByModelRow>();
  for (const r of rows) {
    const model = r.model || 'unknown';
    let agg = map.get(model);
    if (!agg) {
      agg = { model, runs: 0, success: 0, failed: 0, cancelled: 0, totalCost: 0, totalDurationMs: 0, avgDurationMs: 0 };
      map.set(model, agg);
    }
    agg.runs += 1;
    const s = (r.status || '').toLowerCase();
    if (s === 'success') agg.success += 1;
    else if (s === 'failed') agg.failed += 1;
    else if (s === 'cancelled') agg.cancelled += 1;
    const c = normalizeCost(r.cost);
    if (c > 0) agg.totalCost += c;
    const d = normalizeDuration(r.durationMs);
    if (d > 0) agg.totalDurationMs += d;
  }
  return Array.from(map.values())
    .map((a) => ({
      ...a,
      totalCost: Math.round(a.totalCost * 1e6) / 1e6,
      avgDurationMs: a.runs ? Math.round(a.totalDurationMs / a.runs) : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/** 按阶段（stage）聚合。 */
export function aggregateByStage(rows: CostRunRow[]): CostByStageRow[] {
  const map = new Map<string, CostByStageRow>();
  for (const r of rows) {
    const stage = r.stage || 'unknown';
    let agg = map.get(stage);
    if (!agg) {
      agg = { stage, runs: 0, success: 0, failed: 0, totalCost: 0, avgDurationMs: 0 };
      map.set(stage, agg);
    }
    agg.runs += 1;
    const s = (r.status || '').toLowerCase();
    if (s === 'success') agg.success += 1;
    else if (s === 'failed') agg.failed += 1;
    const c = normalizeCost(r.cost);
    if (c > 0) agg.totalCost += c;
    const d = normalizeDuration(r.durationMs);
    if (d > 0) agg.avgDurationMs += d; // 累加后取均值
  }
  return Array.from(map.values())
    .map((a) => ({
      ...a,
      totalCost: Math.round(a.totalCost * 1e6) / 1e6,
      avgDurationMs: a.runs ? Math.round(a.avgDurationMs / a.runs) : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * 按日时间序列。from/to 为 null 时回退：start=数据中最早 createdAt，否则 now-30d；end=now。
 * 输出按日期升序，缺失日期补 0，便于前端画柱状图。
 */
export function buildDailySeries(
  rows: CostRunRow[],
  from: Date | null,
  to: Date | null,
  now: Date = new Date(),
): CostDailyRow[] {
  const end = to ?? now;
  let start: Date;
  if (from) {
    start = from;
  } else {
    let minTs = Infinity;
    for (const r of rows) {
      const t = new Date(r.createdAt).getTime();
      if (!Number.isNaN(t) && t < minTs) minTs = t;
    }
    start = Number.isFinite(minTs) ? new Date(minTs) : new Date(end.getTime() - 30 * DAY_MS);
  }

  // 按日期桶初始化
  const buckets = new Map<string, CostDailyRow>();
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= endDay) {
    const key = toDateKey(cur);
    buckets.set(key, { date: key, runs: 0, success: 0, failed: 0, totalCost: 0 });
    cur.setDate(cur.getDate() + 1);
  }

  for (const r of rows) {
    const t = new Date(r.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    const key = toDateKey(new Date(t));
    const b = buckets.get(key);
    if (!b) continue; // 超出区间的旧数据忽略
    b.runs += 1;
    const s = (r.status || '').toLowerCase();
    if (s === 'success') b.success += 1;
    else if (s === 'failed') b.failed += 1;
    const c = normalizeCost(r.cost);
    if (c > 0) b.totalCost += c;
  }

  return Array.from(buckets.values()).map((b) => ({
    ...b,
    totalCost: Math.round(b.totalCost * 1e6) / 1e6,
  }));
}

/**
 * 配额预警：把当月各模型花费与 SystemConfig 月度预算比对。
 * - 仅对 monthlyBudget>0 的配置生成告警；ratio=spent/budget。
 * - status: ratio>=1 exceeded / >=0.8 warning / 否则 ok。
 * - summary 汇总总预算/总花费/是否越界/未配置预算的模型（有花费但无预算）。
 */
export function computeQuotaAlerts(
  monthlyRuns: CostRunRow[],
  budgets: QuotaBudget[],
): { alerts: QuotaAlert[]; summary: QuotaSummary } {
  const modelSpent = new Map<string, number>();
  for (const r of monthlyRuns) {
    const c = normalizeCost(r.cost);
    if (c > 0) modelSpent.set(r.model, (modelSpent.get(r.model) ?? 0) + c);
  }

  const effective = budgets.filter((b) => b.monthlyBudget > 0);
  const alerts: QuotaAlert[] = effective.map((b) => {
    const spent = modelSpent.get(b.model) ?? 0;
    const ratio = b.monthlyBudget > 0 ? spent / b.monthlyBudget : 0;
    const status: QuotaStatus = ratio >= 1 ? 'exceeded' : ratio >= 0.8 ? 'warning' : 'ok';
    return {
      provider: b.provider,
      model: b.model,
      budget: b.monthlyBudget,
      spent: Math.round(spent * 1e6) / 1e6,
      ratio: Math.round(ratio * 1e4) / 1e4,
      status,
      hasRuns: spent > 0,
    };
  });
  alerts.sort((a, b) => b.ratio - a.ratio);

  const configuredModels = new Set(effective.map((b) => b.model));
  const unconfiguredModels = Array.from(
    new Set(monthlyRuns.map((r) => r.model).filter((m) => m && !configuredModels.has(m))),
  );

  const summary: QuotaSummary = {
    totalBudget: effective.reduce((s, b) => s + b.monthlyBudget, 0),
    totalSpent: alerts.reduce((s, a) => s + a.spent, 0),
    anyExceeded: alerts.some((a) => a.status === 'exceeded'),
    anyWarning: alerts.some((a) => a.status === 'warning'),
    unconfiguredModels,
  };

  return { alerts, summary };
}
