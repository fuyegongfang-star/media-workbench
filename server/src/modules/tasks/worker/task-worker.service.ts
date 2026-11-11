import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { TaskQueueService, TASK_QUEUE_NAME } from '../queue/queue.service';
import { TasksService } from '../tasks.service';
import { TaskHandlerRegistry } from './task-handler.registry';

/**
 * BullMQ Worker（T1.5 基础装配）。
 * - 仅当 Redis 在线（queue.available）时启动；否则明确告警「待环境」，不伪造消费。
 * - 消费 `process` job（data.taskId）→ 调 TasksService.processTask 做状态流转 + 分发 handler。
 * - 深入设计 §4.4：生产可独立 `npm run worker` 与 API 分离；本基础版在同进程装配，逻辑一致。
 */
@Injectable()
export class TaskWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskWorkerService.name);
  private worker?: Worker;

  constructor(
    private readonly queue: TaskQueueService,
    private readonly tasks: TasksService,
    private readonly handlers: TaskHandlerRegistry,
  ) {}

  onModuleInit(): void {
    if (!this.queue.available || !this.queue.connection) {
      this.logger.warn('Worker 未启动（Redis 不可用，待环境）');
      return;
    }
    this.worker = new Worker(
      TASK_QUEUE_NAME,
      async (job) => {
        const taskId = String((job.data as { taskId?: string })?.taskId ?? '');
        if (taskId) await this.tasks.processTask(taskId);
      },
      {
        connection: this.queue.connection,
        prefix: this.queue.prefix,
        concurrency: 4,
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} 处理失败：${err?.message ?? err}`);
    });
    this.logger.log('BullMQ Worker 已启动');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.close();
      } catch {
        /* 忽略关闭异常 */
      }
    }
  }
}
