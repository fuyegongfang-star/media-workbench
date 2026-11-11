/**
 * 内容日历纯函数（T4.4）：日期解析、范围归一、按日分组、类型标签。
 * 刻意与 DB 解耦，便于无数据库环境下单测覆盖核心逻辑。
 */

export type CalendarKind = 'topic' | 'title' | 'content' | 'launch';

/** 日历统一条目（四类实体的归一化投影）。 */
export interface CalendarItem {
  kind: CalendarKind;
  id: string;
  title: string;
  status: string | null;
  /** 锚点日期（本地 YYYY-MM-DD）。 */
  date: string;
  accountName: string | null;
  /** 前端跳转路由（基于 PRD 导航模块）。 */
  link: string;
}

export const KIND_LABELS: Record<CalendarKind, string> = {
  topic: '选题',
  title: '标题',
  content: '内容项目',
  launch: '起号任务',
};

export const KIND_ROUTES: Record<CalendarKind, string> = {
  topic: '/analysis',
  title: '/analysis',
  content: '/content',
  launch: '/launch',
};

/** 校验并解析 YYYY-MM-DD 为本地午夜 Date（避免 new Date('YYYY-MM-DD') 的 UTC 偏移）。 */
export function parseLocalDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, mo, d] = value.split('-').map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

/** Date → 本地 YYYY-MM-DD（分组键，与存储的本地午夜一致，消除时区歧义）。 */
export function dateToKey(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** 在本地时区加 n 天（n 可为负）。 */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** 默认范围：今天往前 15 天、往后 45 天的本地日（覆盖当月及相邻）。 */
export function defaultCalendarRange(now: Date = new Date()): { from: string; to: string } {
  const from = addDays(dateToKey(now) ? parseLocalDate(dateToKey(now))! : now, -15);
  const to = addDays(from, 60);
  return { from: dateToKey(from), to: dateToKey(to) };
}

export interface CalendarQueryInput {
  from?: string;
  to?: string;
}

/**
 * 归一化日历查询范围：解析 from/to（本地日），非法或缺失则回退默认范围，
 * 返回 [fromDate, toExclusive) —— 锚点统一存本地午夜，故 to 取「次日」以闭区间包含当天。
 */
export function normalizeCalendarQuery(
  input: CalendarQueryInput,
): { from: Date; to: Date } {
  const def = defaultCalendarRange();
  const from = parseLocalDate(input.from) ?? parseLocalDate(def.from)!;
  const toRaw = parseLocalDate(input.to) ?? parseLocalDate(def.to)!;
  return { from, to: addDays(toRaw, 1) };
}

/** 校验拖拽改期目标日期：必须合法 YYYY-MM-DD。 */
export function validateRescheduleDate(value: unknown): { ok: boolean; value?: Date; error?: string } {
  const d = parseLocalDate(value);
  if (!d) return { ok: false, error: '非法的目标日期，需为 YYYY-MM-DD' };
  return { ok: true, value: d };
}

/** 按本地日分组；组内先按 kind 顺序再按 title 排序，便于稳定渲染。 */
export function groupByDate(items: CalendarItem[]): Record<string, CalendarItem[]> {
  const order: CalendarKind[] = ['topic', 'title', 'content', 'launch'];
  const map: Record<string, CalendarItem[]> = {};
  for (const it of items) {
    const key = it.date || 'unscheduled';
    (map[key] ??= []).push(it);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => {
      const ka = order.indexOf(a.kind) - order.indexOf(b.kind);
      if (ka !== 0) return ka;
      return a.title.localeCompare(b.title);
    });
  }
  return map;
}

/** 排序后的扁平列表（按日期升序，同日按 kind 顺序）。 */
export function sortCalendarItems(items: CalendarItem[]): CalendarItem[] {
  const order: CalendarKind[] = ['topic', 'title', 'content', 'launch'];
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ka = order.indexOf(a.kind) - order.indexOf(b.kind);
    if (ka !== 0) return ka;
    return a.title.localeCompare(b.title);
  });
}

/** 构造一个归一化日历条目。 */
export function makeCalendarItem(
  kind: CalendarKind,
  id: string,
  title: string,
  status: string | null,
  anchor: Date | string | null | undefined,
  accountName: string | null,
): CalendarItem {
  return {
    kind,
    id,
    title,
    status,
    date: dateToKey(anchor),
    accountName,
    link: KIND_ROUTES[kind],
  };
}
