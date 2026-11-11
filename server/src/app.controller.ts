import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { TaskQueueService } from './modules/tasks/queue/queue.service';

/** 健康检查：不依赖数据库，供 T1.1 冒烟与夜间巡检验证使用。 */
@Controller('health')
export class AppController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskQueue: TaskQueueService,
  ) {}

  @Get()
  health(): Record<string, unknown> {
    return {
      status: 'ok',
      service: 'media-workbench-api',
      version: '0.1.0',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      node: process.version,
      dependencies: {
        // PG 连接由 PrismaService 探活；Redis/BullMQ 由 TaskQueueService 真实探测（T1.5）
        postgres: this.prisma.isConnected ? 'up' : 'unavailable (待环境)',
        redis: this.taskQueue.available ? 'up' : 'unavailable (待环境)',
      },
    };
  }
}
