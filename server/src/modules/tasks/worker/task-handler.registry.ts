import { Injectable } from '@nestjs/common';
import { TaskType } from '@prisma/client';

/** 单个任务类型的处理函数：消费 Task.payload，产出对应实体（深入设计 §4.3）。 */
export type TaskHandler = (payload: unknown) => Promise<void>;

/**
 * 任务处理器注册表（T1.5 基础：注册表就位，但具体 6 类处理逻辑归属 Phase 2/3）。
 * 后续阶段通过 `register(TaskType.X, handler)` 注入；
 * 未注册类型在 Worker 中被如实置为 failed（error 说明待实现），不伪造成功。
 */
@Injectable()
export class TaskHandlerRegistry {
  private readonly handlers = new Map<TaskType, TaskHandler>();

  register(type: TaskType, handler: TaskHandler): void {
    this.handlers.set(type, handler);
  }

  get(type: TaskType): TaskHandler | undefined {
    return this.handlers.get(type);
  }

  get registered(): TaskType[] {
    return [...this.handlers.keys()];
  }
}
