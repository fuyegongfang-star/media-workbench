import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type Job } from 'bullmq';
import { RadarService } from './radar.service';

/**
 * 调度器专用队列：必须与业务任务队列 generation 物理隔离。
 * 历史缺陷：调度 Worker 曾监听业务队列 generation，其 processor 对非 radar-trigger 的
 * job 直接 return，导致用户点「立即采集」等所有业务 job 被吞、任务永远停在 queued。
 */
const SCHEDULER_QUEUE_NAME = 'radar-scheduler';
/** 调度器专用 job（与业务任务 job 区分：jobId 固定，重复调度只保留一个）。 */
const SCHEDULER_JOB_ID = 'radar-daily-schedule';
const SCHEDULER_JOB_NAME = 'radar-trigger';

export interface RadarSchedulePayload {
  runDate: string;
}

/**
 * 选题雷达调度器：BullMQ repeatable job，每天按配置时间触发一次采集。
 * - 复用现有 Redis 连接配置与队列（不引入 @nestjs/schedule 新依赖）。
 * - 每次触发由 RadarService.triggerCollect 建真正的 RADAR_COLLECT 任务并入同一队列，
 *   jobId=taskId 幂等 + RadarRun.runDate 唯一，双保险防重复采集。
 * - Redis 不可用时如实降级（available=false），只支持前端手动触发，不伪造定时生效。
 * - 时间以 Asia/Shanghai 解释（配置 time 为本地时间），转成 UTC 的 cron 表达式。
 */
@Injectable()
export class RadarSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadarSchedulerService.name);
  private queue?: Queue;
  private worker?: import('bullmq').Worker;
  private available = false;

  constructor(
    private readonly config: ConfigService,
    private readonly radar: RadarService,
  ) {}

  async onModuleInit(): Promise<void> {
    const host = this.config.get<string>('REDIS_HOST') ?? 'localhost';
    const port = Number(this.config.get<string>('REDIS_PORT') ?? 6379);
    const password = this.config.get<string>('REDIS_PASSWORD');
    const prefix = this.config.get<string>('BULLMQ_PREFIX') ?? 'media-workbench';
    const connection = {
      host,
      port,
      ...(password && !password.includes('<') ? { password } : {}),
    } as import('bullmq').ConnectionOptions;

    try {
      this.queue = new Queue(SCHEDULER_QUEUE_NAME, { connection, prefix });
      await Promise.race([
        this.queue.waitUntilReady(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('redis probe timeout')), 2500)),
      ]);
      this.available = true;
    } catch {
      this.available = false;
      this.logger.warn('雷达调度器降级：Redis 不可达（待环境），仅支持前端手动采集');
      return;
    }

    try {
      const cfg = await this.radar.getConfig();
      if (cfg.schedule.enabled) await this.upsertSchedule(cfg.schedule.time);
      // 消费调度 job：它只负责「触发」，真正的采集走 RADAR_COLLECT 任务链
      const { Worker } = await import('bullmq');
      this.worker = new Worker(
        SCHEDULER_QUEUE_NAME,
        async (job: Job) => {
          if (job.name !== SCHEDULER_JOB_NAME) return; // 本队列仅调度 job；业务任务走 generation 队列
          const payload = job.data as RadarSchedulePayload;
          this.logger.log(`雷达定时触发：${payload?.runDate ?? 'today'}`);
          await this.radar.triggerCollect();
        },
        { connection, prefix, concurrency: 1 },
      );
      this.logger.log(`雷达调度器就绪（Redis 在线，定时=${cfg.schedule.enabled ? cfg.schedule.time : '关闭'}）`);
    } catch (error: unknown) {
      this.logger.warn(`雷达调度器初始化异常：${(error as Error).message.split('\n')[0]}`);
    }
  }

  /**
   * 配置更新后调用：用 BullMQ v5 原生 job scheduler 按 id 覆盖（upsert）。
   * 关键：创建与删除必须用同一个 schedulerId，否则改时间会残留旧 scheduler 导致双触发；
   * 旧的 queue.add(name,data,{jobId,repeat}) 写法生成的 scheduler id 与裸 jobId 不匹配，已废弃。
   */
  async upsertSchedule(time: string): Promise<{ enabled: boolean; cron: string; available: boolean }> {
    const cron = this.toUtcCron(time);
    if (!this.queue || !this.available) return { enabled: false, cron, available: false };
    await this.queue.upsertJobScheduler(
      SCHEDULER_JOB_ID,
      { pattern: cron, tz: 'UTC' },
      {
        name: SCHEDULER_JOB_NAME,
        data: { runDate: 'auto' } satisfies RadarSchedulePayload,
        opts: { removeOnComplete: 30, removeOnFail: 30 },
      },
    );
    this.logger.log(`雷达定时任务已设置：本地 ${time}（UTC cron=${cron}）`);
    return { enabled: true, cron, available: true };
  }

  async removeSchedule(): Promise<void> {
    if (!this.queue || !this.available) return;
    try {
      await this.queue.removeJobScheduler(SCHEDULER_JOB_ID);
    } catch {
      /* scheduler 不存在时忽略 */
    }
  }

  getStatus(): { available: boolean; jobId: string } {
    return { available: this.available, jobId: SCHEDULER_JOB_ID };
  }

  /** Asia/Shanghai(UTC+8) 本地 HH:mm → UTC cron。跨日借位。 */
  private toUtcCron(localTime: string): string {
    const [hh, mm] = localTime.split(':').map(Number);
    const utcHour = (((hh ?? 8) - 8) + 24) % 24;
    return `${mm ?? 0} ${utcHour} * * *`;
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.worker) await this.worker.close();
      if (this.queue) await this.queue.close();
    } catch {
      /* 忽略关闭异常 */
    }
  }
}
