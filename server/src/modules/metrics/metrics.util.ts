/**
 * T3.10 发布后效果数据回收 —— 纯函数层（不依赖 DB / 网络 / 密钥，可单测）。
 *
 * 职责：
 * - 指标查询构造（dimension/日期/source 过滤）、分页夹紧、排序。
 * - 维度聚合（按选题/标题/账号汇总阅读/分享/收藏/在看/涨粉/取关）。
 * - 微信统计接口响应解析（getuserread / getarticleread / getusersummary）→ 指标种子。
 * - 指标行归一化投影。
 *
 * 所有外部统计响应解析为确定性纯函数，便于用 mock JSON 单测覆盖。
 */

/** 单个指标行（已投影，供前端展示与聚合）。 */
export interface MetricItem {
  id: string;
  contentProjectId: string;
  externalArticleId: string | null;
  metricDate: string; // ISO date（按天）
  readCount: number;
  shareCount: number;
  favoriteCount: number;
  likeCount: number;
  followerIncrease: number;
  unfollowCount: number;
  source: string;
  fetchedAt: string;
}

/** 微信统计拉取产出的指标种子（缺 contentProjectId，由 service 关联补齐后 upsert）。 */
export interface MetricSeed {
  metricDate: Date;
  externalArticleId: string | null;
  readCount: number;
  shareCount: number;
  favoriteCount: number;
  likeCount: number;
  followerIncrease: number;
  unfollowCount: number;
  source: string;
}

/** 维度聚合的一行（按 key 分组求和）。 */
export interface MetricDimensionRow {
  key: string;
  label: string;
  readCount: number;
  shareCount: number;
  favoriteCount: number;
  likeCount: number;
  followerIncrease: number;
  unfollowCount: number;
}

/** 维度聚合结果附带样本数（关联到的指标行数）。 */
export interface MetricDimensionAggregate extends MetricDimensionRow {
  count: number;
}

export type MetricDimension = 'topic' | 'title' | 'account';

export interface MetricQuery {
  contentProjectId?: string;
  ownedAccountId?: string;
  topicId?: string;
  titleId?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** 把任意输入安全归一到非负整数（NaN / 负数 / 非数 → 0）。 */
export function normalizeMetricNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

/** 将 Query DTO 字符串字段解析为强类型查询对象（非法值忽略）。 */
export function parseMetricQuery(query: Record<string, any>): MetricQuery {
  const out: MetricQuery = {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const id = str(query.contentProjectId);
  if (id) out.contentProjectId = id;
  const acc = str(query.ownedAccountId);
  if (acc) out.ownedAccountId = acc;
  const topic = str(query.topicId);
  if (topic) out.topicId = topic;
  const title = str(query.titleId);
  if (title) out.titleId = title;
  const src = str(query.source);
  if (src) out.source = src;
  const from = str(query.dateFrom);
  if (from && !Number.isNaN(Date.parse(from))) out.dateFrom = from;
  const to = str(query.dateTo);
  if (to && !Number.isNaN(Date.parse(to))) out.dateTo = to;
  const s = str(query.sort);
  if (s) out.sort = s;
  if (query.page !== undefined) {
    const p = Number(query.page);
    if (Number.isFinite(p)) out.page = p;
  }
  if (query.pageSize !== undefined) {
    const p = Number(query.pageSize);
    if (Number.isFinite(p)) out.pageSize = p;
  }
  return out;
}

/** 构造 Prisma where（参数绑定防注入；软删过滤由 T1.3 扩展统一注入）。 */
export function buildMetricWhere(q: MetricQuery): Record<string, any> {
  const where: Record<string, any> = {};
  if (q.contentProjectId) where.contentProjectId = q.contentProjectId;
  if (q.source) where.source = q.source;
  if (q.ownedAccountId || q.topicId || q.titleId) {
    const cp: Record<string, any> = {};
    if (q.ownedAccountId) cp.ownedAccountId = q.ownedAccountId;
    if (q.topicId) cp.topicId = q.topicId;
    if (q.titleId) cp.selectedTitleId = q.titleId;
    where.contentProject = cp;
  }
  if (q.dateFrom || q.dateTo) {
    const range: Record<string, Date> = {};
    if (q.dateFrom) range.gte = new Date(q.dateFrom);
    if (q.dateTo) range.lte = new Date(q.dateTo);
    where.metricDate = range;
  }
  return where;
}

/** 分页夹紧（page>=1，pageSize 1..100，默认 20）。 */
export function clampMetricPage(page?: number, pageSize?: number): {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
} {
  const p = Number.isFinite(page) && (page as number) >= 1 ? Math.floor(page as number) : 1;
  let size = Number.isFinite(pageSize) ? Math.floor(pageSize as number) : 20;
  if (size < 1) size = 20;
  if (size > 100) size = 100;
  return { skip: (p - 1) * size, take: size, page: p, pageSize: size };
}

/** 排序：默认 metricDate 倒序；newest/oldest 控制方向。 */
export function metricOrderBy(sort?: string): Record<string, any> {
  if (sort === 'oldest') return { metricDate: 'asc' as const };
  return { metricDate: 'desc' as const };
}

/** 把 DB 行投影为前端指标项（日期转 ISO 当天，数字归一化）。 */
export function shapeMetric(row: {
  id: string;
  contentProjectId: string;
  externalArticleId?: string | null;
  metricDate: Date | string;
  readCount: number;
  shareCount: number;
  favoriteCount: number;
  likeCount: number;
  followerIncrease: number;
  unfollowCount: number;
  source: string;
  fetchedAt: Date | string;
}): MetricItem {
  const toIsoDate = (v: Date | string) => {
    const d = typeof v === 'string' ? new Date(v) : v;
    return d.toISOString().slice(0, 10);
  };
  return {
    id: row.id,
    contentProjectId: row.contentProjectId,
    externalArticleId: row.externalArticleId ?? null,
    metricDate: toIsoDate(row.metricDate),
    readCount: normalizeMetricNumber(row.readCount),
    shareCount: normalizeMetricNumber(row.shareCount),
    favoriteCount: normalizeMetricNumber(row.favoriteCount),
    likeCount: normalizeMetricNumber(row.likeCount),
    followerIncrease: normalizeMetricNumber(row.followerIncrease),
    unfollowCount: normalizeMetricNumber(row.unfollowCount),
    source: row.source,
    fetchedAt: typeof row.fetchedAt === 'string' ? row.fetchedAt : row.fetchedAt.toISOString(),
  };
}

/**
 * 按 key 聚合指标行（同 key 求和，保留首个 label 与样本数）。
 * 纯函数，供 service 在拿到「带维度 label 的指标行」后做分组汇总。
 */
export function aggregateMetricRows(rows: MetricDimensionRow[]): MetricDimensionAggregate[] {
  const map = new Map<string, MetricDimensionAggregate>();
  for (const r of rows) {
    const key = r.key || 'unknown';
    let agg = map.get(key);
    if (!agg) {
      agg = {
        key,
        label: r.label || key,
        readCount: 0,
        shareCount: 0,
        favoriteCount: 0,
        likeCount: 0,
        followerIncrease: 0,
        unfollowCount: 0,
        count: 0,
      };
      map.set(key, agg);
    }
    agg.readCount += normalizeMetricNumber(r.readCount);
    agg.shareCount += normalizeMetricNumber(r.shareCount);
    agg.favoriteCount += normalizeMetricNumber(r.favoriteCount);
    agg.likeCount += normalizeMetricNumber(r.likeCount);
    agg.followerIncrease += normalizeMetricNumber(r.followerIncrease);
    agg.unfollowCount += normalizeMetricNumber(r.unfollowCount);
    agg.count += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.readCount - a.readCount);
}

/** 微信 ref_date（YYYY-MM-DD）转 UTC 当天 Date。 */
function wechatDateToDate(ref: unknown): Date | null {
  if (typeof ref !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ref)) return null;
  const d = new Date(`${ref}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function listOf(json: unknown): any[] {
  if (!json || typeof json !== 'object') return [];
  const o = json as Record<string, unknown>;
  return Array.isArray(o.list) ? (o.list as any[]) : [];
}

/** 解析 getuserread（图文群发总数据）：ref_date + 阅读/分享/收藏。 */
export function parseWechatUserRead(json: unknown): MetricSeed[] {
  return listOf(json).map((it) => {
    const d = wechatDateToDate(it?.ref_date);
    return {
      metricDate: d ?? new Date(0),
      externalArticleId: null,
      readCount: normalizeMetricNumber(it?.int_page_read_user ?? it?.int_page_read_count),
      shareCount: normalizeMetricNumber(it?.share_user ?? it?.share_count),
      favoriteCount: normalizeMetricNumber(it?.add_to_fav_user ?? it?.add_to_fav_count),
      likeCount: 0,
      followerIncrease: 0,
      unfollowCount: 0,
      source: 'wechat_user_read',
    };
  });
}

/** 解析 getarticleread（图文统计分时数据）：按 msgid 拆分，带 article 标识。 */
export function parseWechatArticleRead(json: unknown): MetricSeed[] {
  return listOf(json).map((it) => {
    const d = wechatDateToDate(it?.ref_date);
    return {
      metricDate: d ?? new Date(0),
      externalArticleId: typeof it?.msgid === 'string' ? it.msgid : null,
      readCount: normalizeMetricNumber(it?.int_page_read_user ?? it?.int_page_read_count),
      shareCount: normalizeMetricNumber(it?.share_user ?? it?.share_count),
      favoriteCount: normalizeMetricNumber(it?.add_to_fav_user ?? it?.add_to_fav_count),
      likeCount: 0,
      followerIncrease: 0,
      unfollowCount: 0,
      source: 'wechat_article_read',
    };
  });
}

/** 解析 getusersummary（用户增减数据）：涨粉/取关。 */
export function parseWechatUserSummary(json: unknown): MetricSeed[] {
  return listOf(json).map((it) => {
    const d = wechatDateToDate(it?.ref_date);
    return {
      metricDate: d ?? new Date(0),
      externalArticleId: null,
      readCount: 0,
      shareCount: 0,
      favoriteCount: 0,
      likeCount: 0,
      followerIncrease: normalizeMetricNumber(it?.new_user),
      unfollowCount: normalizeMetricNumber(it?.cancel_user),
      source: 'wechat_user_summary',
    };
  });
}
