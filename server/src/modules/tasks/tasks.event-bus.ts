import { EventEmitter } from 'node:events';

/** 任务状态变更事件名（SSE 端点订阅此事件）。 */
export const TASK_EVENT_UPDATED = 'task.updated';

/**
 * 进程内事件总线：任务状态变更时广播，供 SSE 端点订阅（深入设计 §4.4 实时性）。
 * 同模块单例，TasksService 发事件、TasksSseController 订阅。
 */
export class TasksEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }
}
