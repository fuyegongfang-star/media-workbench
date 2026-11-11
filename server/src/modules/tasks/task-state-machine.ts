import { TaskStatus } from '@prisma/client';

/**
 * 异步任务状态机（深入设计 §4：queued → running → success | failed | cancelled）。
 * 纯函数，无副作用，便于单测；业务层在落库前后调用并做校验。
 */
export type TaskEvent = 'start' | 'succeed' | 'fail' | 'cancel' | 'retry';

const TRANSITIONS: Record<TaskStatus, Partial<Record<TaskEvent, TaskStatus>>> = {
  queued: { start: 'running', cancel: 'cancelled' },
  running: { succeed: 'success', fail: 'failed', cancel: 'cancelled' },
  success: {},
  failed: { retry: 'queued' },
  cancelled: { retry: 'queued' },
};

/** 当前状态是否允许该事件（用于提前校验，返回 4xx 而非 5xx）。 */
export function canTransition(current: TaskStatus, event: TaskEvent): boolean {
  return TRANSITIONS[current]?.[event] !== undefined;
}

/** 计算流转后的目标状态；非法流转抛错（调用方捕获后回滚/报错）。 */
export function nextStatus(current: TaskStatus, event: TaskEvent): TaskStatus {
  const next = TRANSITIONS[current]?.[event];
  if (!next) {
    throw new Error(`非法状态流转：${current} --${event}--> ?`);
  }
  return next;
}
