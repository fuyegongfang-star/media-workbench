/**
 * 起号计划纯函数（T4.1）。
 * - 任务状态随关联内容项目更新：项目已发布/已归档 → 任务置 done。
 * - 计划进度统计：按任务状态聚合 + 完成率 + 已关联项目数。
 * 全部为无副作用纯函数，便于不连库单测（与 wechat-publish.util 同思路）。
 */

export const PROJECT_DONE_STATUSES: ReadonlyArray<string> = ['PUBLISHED', 'ARCHIVED'];

export const LAUNCH_TASK_STATUSES: ReadonlyArray<string> = [
  'pending',
  'in_progress',
  'done',
  'skipped',
];

export type LaunchTaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

export function isProjectDone(projectStatus?: string | null): boolean {
  return !!projectStatus && PROJECT_DONE_STATUSES.includes(projectStatus);
}

export interface TaskStatusSeed {
  status: string;
  publishedAt?: Date | null;
}

export interface TaskStatusDerivation {
  status: LaunchTaskStatus;
  publishedAt: Date | null;
}

/**
 * 依据关联内容项目的状态推导任务状态。
 * - 项目未关联：保持现状（publishedAt 沿用）。
 * - 项目已发布/已归档：任务置 done，publishedAt 取项目发布时间（无则当前时间）。
 * - 项目未发布：保持人工设定的状态，绝不反向降级（如手动置 in_progress 不被清空）。
 * - 已 skipped 的任务不随项目发布而改变（保留"跳过"语义）。
 */
export function deriveTaskStatusFromProject(
  current: TaskStatusSeed,
  project: TaskStatusSeed | null,
): TaskStatusDerivation {
  const currentStatus = (current.status ?? 'pending') as LaunchTaskStatus;
  const currentPublishedAt = current.publishedAt ?? null;

  if (!project) {
    return { status: currentStatus, publishedAt: currentPublishedAt };
  }

  if (isProjectDone(project.status)) {
    if (currentStatus === 'skipped') {
      return { status: 'skipped', publishedAt: currentPublishedAt };
    }
    return {
      status: 'done',
      publishedAt: project.publishedAt ?? currentPublishedAt ?? new Date(),
    };
  }

  // 项目尚未发布：保留人工状态，不自动降级
  return { status: currentStatus, publishedAt: currentPublishedAt };
}

export interface PlanProgressTask {
  status: string;
  projectId?: string | null;
}

export interface PlanProgress {
  total: number;
  byStatus: Record<string, number>;
  done: number;
  completionRate: number; // 0-100
  linked: number; // 已关联内容项目的任务数
}

export interface ReorderTarget {
  id: string;
  sortOrder: number;
}

/**
 * 计算拖拽重排后的 sortOrder（T4.2 图片组）。
 * - orderedIds：前端拖拽后提交的完整顺序。
 * - existingIds：服务端该组真实存在的图片 id 集合（用于丢弃伪造/多提交的 id）。
 * 返回仅含真实 id 的重排结果；出现在 orderedIds 中的按序赋值，未出现的真实 id 追加到末尾（保持原序）。
 */
export function reorderImages(orderedIds: string[], existingIds: string[]): ReorderTarget[] {
  const existingSet = new Set(existingIds);
  const seen = new Set<string>();
  const result: ReorderTarget[] = [];
  let order = 0;
  for (const id of orderedIds) {
    if (existingSet.has(id) && !seen.has(id)) {
      result.push({ id, sortOrder: order++ });
      seen.add(id);
    }
  }
  for (const id of existingIds) {
    if (!seen.has(id)) {
      result.push({ id, sortOrder: order++ });
      seen.add(id);
    }
  }
  return result;
}

/** 新增图片项时计算下一个 sortOrder（取现有最大值 + 1，无则 0）。 */
export function nextImageSortOrder(existingOrders: number[]): number {
  if (existingOrders.length === 0) return 0;
  return Math.max(...existingOrders) + 1;
}

export function computePlanProgress(tasks: PlanProgressTask[]): PlanProgress {
  const byStatus: Record<string, number> = {
    pending: 0,
    in_progress: 0,
    done: 0,
    skipped: 0,
  };
  let done = 0;
  let linked = 0;

  for (const t of tasks) {
    const s = t.status ?? 'pending';
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    if (s === 'done') done += 1;
    if (t.projectId) linked += 1;
  }

  const total = tasks.length;
  return {
    total,
    byStatus,
    done,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
    linked,
  };
}
