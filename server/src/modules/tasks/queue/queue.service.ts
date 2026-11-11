import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type ConnectionOptions } from 'bullmq';

/** 单队列名（深入设计 §4.1）。 */
export const TASK_QUEUE_NAME = 'generation';

/**
 * BullMQ 队列封装（T1.5）。
 * - jobId = taskId → 同任务重复入队自动去重（深入设计 §4.2）。
 * - Redis 不可用时**如实降级**：不抛启动错误、不伪造，enqueue 返回 false 由调用方标记「待环境」。
 * - 连接参数仅来自环境变量（REDIS_*），禁止硬编码。
 */
@Injectable()
export class TaskQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskQueueService.name);
  private queue?: Queue;
  private connectionOptions?: ConnectionOptions;
  private prefixValue = 'media-workbench';
  /** 队列是否可用（Redis 在线且队列已建）。 */
  available = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.prefixValue = this.config.get<string>('BULLMQ_PREFIX') ?? 'media-workbench';
    const connection = this.buildConnection();
    this.connectionOptions = connection;
    try {
      this.queue = new Queue(TASK_QUEUE_NAME, {
        connection,
        prefix: this.prefixValue,
      });
    } catch (error: unknown) {
      this.available = false;
      const msg = error instanceof Error ? error.message.split('\n')[0] : String(error);
      this.logger.warn(`BullMQ 队列未就绪（待环境，不伪造通过）：${msg}`);
      return;
    }
    // 真实连通性探测：BullMQ 构造是惰性连接，必须探测才能确认 Redis 在线（护栏：不伪造通过）。
    // 用超时兜底，避免 Redis 缺失时无限重连阻塞启动。Nest 会 await 本钩子，确保 Worker 启动时 available 已确证。
    await this.probe();
  }

  /** 探测 Redis 连通性，结果写入 available。非阻塞，结果稍后生效。 */
  private async probe(): Promise<void> {
    if (!this.queue) {
      this.available = false;
      return;
    }
    try {
      await Promise.race([
        this.queue.waitUntilReady(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('redis probe timeout')), 2500),
        ),
      ]);
      if (!this.available) {
        this.available = true;
        this.logger.log('BullMQ 队列已就绪（Redis 在线）');
      }
    } catch {
      this.available = false;
      this.logger.warn('BullMQ 队列未就绪（Redis 不可达，待环境，不伪造通过）');
    }
  }

  private buildConnection(): ConnectionOptions {
    const host = this.config.get<string>('REDIS_HOST') ?? 'localhost';
    const port = Number(this.config.get<string>('REDIS_PORT') ?? 6379);
    const rawPassword = this.config.get<string>('REDIS_PASSWORD');
    const conn: Record<string, unknown> = { host, port };
    // 占位符('<...>')或空口令不注入，避免把 .env.example 占位当真口令
    if (rawPassword && !rawPassword.includes('<')) {
      conn.password = rawPassword;
    }
    return conn as ConnectionOptions;
  }

  /** Worker 复用同一连接配置（各自独立 ioredis 连接）。 */
  get connection(): ConnectionOptions | undefined {
    return this.connectionOptions;
  }

  get prefix(): string {
    return this.prefixValue;
  }

  /**
   * 入队任务。jobId=taskId 幂等；Redis 不可用时返回 false（任务保留 queued，待环境）。
   * @returns 是否成功入队
   */
  async enqueue(taskId: string): Promise<boolean> {
    if (!this.queue || !this.available) return false;
    try {
      await this.queue.add(
        'process',
        { taskId },
        {
          jobId: taskId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message.split('\n')[0] : String(error);
      this.logger.warn(`入队失败（待环境）：${msg}`);
      return false;
    }
  }

  /** 取消：从队列移除待执行 Job（已运行/已完成则为 no-op）。 */
  async removeJob(taskId: string): Promise<void> {
    if (!this.queue || !this.available) return;
    try {
      const job = await this.queue.getJob(taskId);
      if (job) await job.remove();
    } catch {
      /* Redis 不可用时忽略 */
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.close();
      } catch {
        /* 忽略关闭异常 */
      }
    }
  }
}
