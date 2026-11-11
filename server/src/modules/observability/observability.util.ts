/**
 * 可观测性元数据与纯函数（T1.9）。
 * - RECYCLE_MODELS：软删实体 → 回收站类型映射（与 T1.3 SOFT_DELETE_MODELS 一致）。
 * - buildAuditWhere / clampPage：审计查询条件与分页（纯函数，不依赖 DB 可单测）。
 * - formatRecycleName：软删记录的展示名（按各实体标题/名称字段）。
 * 均为纯函数，便于 node --test 真实验证。
 */

export interface RecycleModelMeta {
  /** URL 安全的类型键，如 owned-account */
  key: string;
  /** Prisma client 上的模型键（camelCase），如 ownedAccount */
  model: string;
  /** 中文展示名 */
  label: string;
  /** 用于展示名称的字段；缺省时回退到 label */
  nameField?: string;
  /** 名称特殊格式化 */
  format?: 'version';
}

/** 与 data-integrity.ts 的 SOFT_DELETE_MODELS 一一对应（8 个带 deletedAt 的实体）。 */
export const RECYCLE_MODELS: RecycleModelMeta[] = [
  { key: 'owned-account', model: 'ownedAccount', label: '自有账号', nameField: 'name' },
  { key: 'reference-account', model: 'referenceAccount', label: '对标账号', nameField: 'name' },
  { key: 'source-material', model: 'sourceMaterial', label: '素材', nameField: 'title' },
  { key: 'media-asset', model: 'mediaAsset', label: '媒体资产', nameField: 'filePath' },
  { key: 'account-strategy', model: 'accountStrategy', label: '账号策略', nameField: 'version', format: 'version' },
  { key: 'topic', model: 'topic', label: '选题', nameField: 'title' },
  { key: 'content-project', model: 'contentProject', label: '内容项目', nameField: 'status' },
  { key: 'launch-plan', model: 'launchPlan', label: '起号计划', nameField: 'goal' },
];

export function getRecycleModel(type: string): RecycleModelMeta | null {
  return RECYCLE_MODELS.find((m) => m.key === type) ?? null;
}

export interface AuditQuery {
  objectType?: string;
  action?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** 由查询参数构造 Prisma auditEvent.where（纯函数）。无效日期被忽略，不抛错。 */
export function buildAuditWhere(q: AuditQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.objectType) where.objectType = q.objectType;
  if (q.action) where.action = q.action;
  if (q.userId) where.userId = q.userId;

  const at: Record<string, Date> = {};
  if (q.from) {
    const d = new Date(q.from);
    if (!Number.isNaN(d.getTime())) at.gte = d;
  }
  if (q.to) {
    const d = new Date(q.to);
    if (!Number.isNaN(d.getTime())) at.lte = d;
  }
  if (Object.keys(at).length) where.at = at;
  return where;
}

/** 分页参数收敛（纯函数）：page≥1、pageSize∈[1,200]。 */
export function clampPage(
  page?: number,
  pageSize?: number,
): { page: number; pageSize: number; skip: number; take: number } {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const ps = Math.min(200, Math.max(1, Math.floor(Number(pageSize) || 20)));
  return { page: p, pageSize: ps, skip: (p - 1) * ps, take: ps };
}

/** 由元数据与行数据生成回收站展示名（纯函数）。 */
export function formatRecycleName(meta: RecycleModelMeta, row: Record<string, unknown>): string {
  if (!meta.nameField) return meta.label;
  const v = row[meta.nameField];
  if (v === null || v === undefined) return '';
  if (meta.format === 'version') return `v${String(v)}`;
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}
