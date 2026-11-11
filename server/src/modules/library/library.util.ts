/**
 * 素材库纯函数工具（T4.3）。
 * 不依赖数据库即可单测；DB 查询参数绑定（防注入）交给 Prisma 执行层。
 */

export type MaterialSort = 'newest' | 'oldest' | 'imported' | 'collected';

export interface MaterialQuery {
  q?: string;
  referenceAccountId?: string;
  platform?: string[];
  tags?: string[];
  author?: string;
  sourceUrl?: string;
  favorite?: boolean;
  archived?: boolean;
  /** true=只看已拆解(有 analysis) / false=未拆解 / undefined=不限 */
  hasAnalysis?: boolean;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
  sort?: MaterialSort;
}

const MAX_TAGS = 30;
const MAX_TAG_LEN = 50;

/**
 * 标签归一化：接受「逗号/空格/分号/换行分隔字符串」或「字符串数组」，
 * 裁剪空白、去重（大小写不敏感、保留首次出现）、限长，返回干净的 string[]。
 * 用于写入与查询解析，防御异常输入（非字符串/数组一律返回空数组）。
 */
export function normalizeTags(input: unknown): string[] {
  let raw: string[];
  if (typeof input === 'string') {
    raw = input.split(/[\s,，;；\n]+/);
  } else if (Array.isArray(input)) {
    // 仅保留数组中的字符串元素，过滤数字/null/对象等异常值（防御注入/脏数据）
    raw = input.filter((v) => typeof v === 'string').map((v) => v.trim());
  } else {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.length > MAX_TAG_LEN ? t.slice(0, MAX_TAG_LEN) : t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * 构造素材列表查询的 Prisma where（不含 deletedAt 注入 —— 软删作用域由 T1.3 扩展统一处理）。
 * 所有条件均为参数化对象，交由 Prisma 绑定执行，绝不拼接 SQL（防注入）。
 */
export function buildMaterialWhere(q: MaterialQuery = {}): Record<string, any> {
  const where: Record<string, any> = {};

  if (q.q && q.q.trim()) {
    const term = q.q.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { body: { contains: term, mode: 'insensitive' } },
      { author: { contains: term, mode: 'insensitive' } },
      { sourceUrl: { contains: term, mode: 'insensitive' } },
    ];
  }

  if (q.referenceAccountId || (q.platform && q.platform.length)) {
    const ref: Record<string, any> = {};
    if (q.referenceAccountId) ref.id = q.referenceAccountId;
    if (q.platform && q.platform.length) ref.platform = { in: q.platform };
    where.referenceAccount = ref;
  }

  if (q.tags && q.tags.length) {
    where.tags = { hasSome: q.tags.map((t) => t.trim()).filter(Boolean) };
  }

  if (q.author && q.author.trim()) {
    where.author = { contains: q.author.trim(), mode: 'insensitive' };
  }
  if (q.sourceUrl && q.sourceUrl.trim()) {
    where.sourceUrl = { contains: q.sourceUrl.trim(), mode: 'insensitive' };
  }

  if (typeof q.favorite === 'boolean') where.favorite = q.favorite;
  if (typeof q.archived === 'boolean') where.archived = q.archived;

  if (typeof q.hasAnalysis === 'boolean') {
    where.analyses = q.hasAnalysis ? { some: {} } : { none: {} };
  }

  const dateFilter: Record<string, Date> = {};
  if (q.dateFrom) {
    const d = new Date(q.dateFrom);
    if (!isNaN(d.getTime())) dateFilter.gte = d;
  }
  if (q.dateTo) {
    const d = new Date(q.dateTo);
    if (!isNaN(d.getTime())) dateFilter.lte = d;
  }
  if (Object.keys(dateFilter).length) where.importedAt = dateFilter;

  return where;
}

/** 分页参数夹紧：page>=1，pageSize∈[1,100]。 */
export function clampPage(page?: number, pageSize?: number): { skip: number; take: number; page: number; pageSize: number } {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const ps = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 20)));
  return { skip: (p - 1) * ps, take: ps, page: p, pageSize: ps };
}

/** 排序映射为 Prisma orderBy。 */
export function materialOrderBy(sort?: MaterialSort): Record<string, any> {
  switch (sort) {
    case 'oldest':
      return { importedAt: 'asc' };
    case 'imported':
      return { importedAt: 'desc' };
    case 'collected':
      return { collectedAt: 'desc' };
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

export interface MaterialListItem {
  id: string;
  referenceAccountId: string;
  referenceAccountName: string | null;
  platform: string | null;
  title: string;
  author: string | null;
  sourceUrl: string | null;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  hasAnalysis: boolean;
  isDuplicate: boolean;
  fingerprint: string;
  importedAt: string | null;
  collectedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 将 Prisma 行投影为列表项 DTO（日期转 ISO；聚合计数来自 include/_count）。 */
export function shapeMaterial(m: any): MaterialListItem {
  return {
    id: m.id,
    referenceAccountId: m.referenceAccountId,
    referenceAccountName: m.referenceAccount?.name ?? null,
    platform: m.referenceAccount?.platform ?? null,
    title: m.title,
    author: m.author ?? null,
    sourceUrl: m.sourceUrl ?? null,
    tags: Array.isArray(m.tags) ? m.tags : [],
    favorite: !!m.favorite,
    archived: !!m.archived,
    hasAnalysis: !!(m._count?.analyses ?? 0) || (Array.isArray(m.analyses) ? m.analyses.length > 0 : false),
    isDuplicate: !!m.duplicateOfId,
    fingerprint: m.fingerprint,
    importedAt: m.importedAt ? new Date(m.importedAt).toISOString() : null,
    collectedAt: m.collectedAt ? new Date(m.collectedAt).toISOString() : null,
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
    updatedAt: m.updatedAt ? new Date(m.updatedAt).toISOString() : null,
  };
}

/**
 * 将 HTTP 查询字符串 DTO（均为字符串）解析为强类型 MaterialQuery。
 * 数组字段以逗号分隔；布尔以 'true'/'false' 判断；非法值忽略。纯函数，便于单测。
 */
export function parseMaterialQuery(dto: Record<string, any> = {}): MaterialQuery {
  const out: MaterialQuery = {};
  if (dto.q) out.q = String(dto.q);
  if (dto.referenceAccountId) out.referenceAccountId = String(dto.referenceAccountId);
  if (dto.platform) {
    out.platform = String(dto.platform)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (dto.tags) out.tags = normalizeTags(dto.tags);
  if (dto.author) out.author = String(dto.author);
  if (dto.sourceUrl) out.sourceUrl = String(dto.sourceUrl);
  if (dto.favorite === 'true') out.favorite = true;
  if (dto.favorite === 'false') out.favorite = false;
  if (dto.archived === 'true') out.archived = true;
  if (dto.archived === 'false') out.archived = false;
  if (dto.hasAnalysis === 'true') out.hasAnalysis = true;
  if (dto.hasAnalysis === 'false') out.hasAnalysis = false;
  if (dto.dateFrom) out.dateFrom = String(dto.dateFrom);
  if (dto.dateTo) out.dateTo = String(dto.dateTo);
  if (dto.sort && ['newest', 'oldest', 'imported', 'collected'].includes(dto.sort)) {
    out.sort = dto.sort as MaterialSort;
  }
  return out;
}

/** 聚合标签计数（供筛选建议）；输入为带 tags:string[] 的行数组。 */
export function aggregateTagCounts(rows: Array<{ tags?: string[] | null }>): Array<{ tag: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!Array.isArray(r.tags)) continue;
    for (const t of r.tags) {
      if (!t) continue;
      map.set(t, (map.get(t) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
