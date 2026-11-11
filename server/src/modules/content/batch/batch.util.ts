/**
 * T4.5 批量操作：纯函数层（无副作用，便于单测）。
 * - 请求校验：type / action / ids / 各 action 必填载荷。
 * - 标签补丁：add / remove / replace 三种模式对字符串数组的纯计算。
 * 不触碰数据库、不依赖 Nest/Prisma，可在 node --test 中直接执行。
 */

export type BatchType = 'topic' | 'title' | 'project';
export type BatchAction = 'setStatus' | 'tag' | 'delete' | 'publish';
export type TagMode = 'add' | 'remove' | 'replace';

export const BATCH_TYPES: BatchType[] = ['topic', 'title', 'project'];
export const BATCH_ACTIONS: BatchAction[] = ['setStatus', 'tag', 'delete', 'publish'];

/** 各类型允许的状态枚举（与 schema.prisma 枚举对齐，仅供校验与前端下拉）。 */
export const STATUS_OPTIONS: Record<BatchType, string[]> = {
  topic: ['draft', 'active', 'archived'],
  title: ['draft', 'selected', 'rejected'],
  project: [
    'TOPIC_SELECTING',
    'PENDING_CREATION',
    'CREATING',
    'PENDING_REVIEW',
    'NEEDS_REVISION',
    'APPROVED',
    'PUBLISHED',
    'ARCHIVED',
  ],
};

/** publish 仅对草稿（project）有意义。 */
const PUBLISHABLE_TYPES: BatchType[] = ['project'];

export interface BatchRequest {
  type: BatchType;
  action: BatchAction;
  ids: string[];
  status?: string;
  tags?: string[];
  tagMode?: TagMode;
}

export interface ValidationOk {
  ok: true;
  error?: never;
  data: BatchRequest;
}
export interface ValidationErr {
  ok: false;
  error: string;
  data?: never;
}
export type ValidationResult = ValidationOk | ValidationErr;

/** 将任意输入规整为字符串数组：过滤非字符串、trim、去空、去重（保序）。 */
export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * 计算标签补丁后的新数组。
 * - add：在原数组基础上并入输入（去重）。
 * - remove：从原数组剔除输入项。
 * - replace：以输入为准（去重）。
 */
export function planTagPatch(
  currentTags: string[],
  mode: TagMode,
  inputTags: string[],
): string[] {
  const cur = normalizeTags(currentTags);
  const inp = normalizeTags(inputTags);
  if (mode === 'replace') return inp;
  if (mode === 'remove') {
    const drop = new Set(inp);
    return cur.filter((t) => !drop.has(t));
  }
  // add（默认）
  const seen = new Set(cur);
  const out = [...cur];
  for (const t of inp) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.trim().length > 0);
}

const MAX_BATCH_SIZE = 200;

export function validateBatchRequest(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: '请求体必须为对象' };
  }
  const r = input as Record<string, unknown>;

  const type = r.type;
  if (typeof type !== 'string' || !BATCH_TYPES.includes(type as BatchType)) {
    return { ok: false, error: `type 必须是 ${BATCH_TYPES.join(' / ')} 之一` };
  }
  const typedType = type as BatchType;

  const action = r.action;
  if (typeof action !== 'string' || !BATCH_ACTIONS.includes(action as BatchAction)) {
    return { ok: false, error: `action 必须是 ${BATCH_ACTIONS.join(' / ')} 之一` };
  }
  const typedAction = action as BatchAction;

  if (!isNonEmptyStringArray(r.ids)) {
    return { ok: false, error: 'ids 必须为非空字符串数组（每项非空）' };
  }
  if ((r.ids as string[]).length > MAX_BATCH_SIZE) {
    return { ok: false, error: `单次批量上限 ${MAX_BATCH_SIZE} 条` };
  }

  const data: BatchRequest = { type: typedType, action: typedAction, ids: r.ids as string[] };

  if (typedAction === 'setStatus') {
    const status = r.status;
    if (typeof status !== 'string' || !STATUS_OPTIONS[typedType].includes(status)) {
      return {
        ok: false,
        error: `status 必须是 ${STATUS_OPTIONS[typedType].join(' / ')} 之一`,
      };
    }
    data.status = status;
  } else if (typedAction === 'tag') {
    if (!isNonEmptyStringArray(r.tags)) {
      return { ok: false, error: 'tag 操作的 tags 必须为非空字符串数组' };
    }
    const mode = r.tagMode;
    if (mode !== undefined && mode !== 'add' && mode !== 'remove' && mode !== 'replace') {
      return { ok: false, error: 'tagMode 必须是 add / remove / replace 之一' };
    }
    data.tags = r.tags as string[];
    data.tagMode = (mode as TagMode) ?? 'add';
  } else if (typedAction === 'publish') {
    if (!PUBLISHABLE_TYPES.includes(typedType)) {
      return { ok: false, error: 'publish 仅支持 project（草稿）类型' };
    }
  }
  return { ok: true, data };
}
