import { Module, OnModuleInit } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';
import { GenerationModule } from '../generation/generation.module';
import { TaskHandlerRegistry } from '../tasks/worker/task-handler.registry';
import { RadarController } from './radar.controller';
import { RadarService } from './radar.service';
import { RadarSchedulerService } from './radar-scheduler.service';

/**
 * 选题雷达模块（T6.1）：配置驱动 + 免费源采集 + 复用任务中心/LLM 适配层。
 * - RadarService 在 onModuleInit 注册 RADAR_COLLECT 处理器（与其他任务类型一致）。
 * - 调度器用 BullMQ repeatable job，复用 Redis 连接（待环境降级为仅手动触发）。
 * - 鉴权：控制器挂 AccessTokenGuard（依赖 JwtService），必须导入 AuthModule。
 */
@Module({
  imports: [AuthModule, TasksModule, GenerationModule],
  controllers: [RadarController],
  providers: [RadarService, RadarSchedulerService],
  exports: [RadarService],
})
export class RadarModule implements OnModuleInit {
  constructor(
    private readonly radar: RadarService,
    private readonly handlers: TaskHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.handlers.register(TaskType.RADAR_COLLECT, (p) => this.radar.runCollect(p));
  }
}
