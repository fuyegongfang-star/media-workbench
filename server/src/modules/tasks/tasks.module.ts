import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksSseController } from './tasks-sse.controller';
import { TaskQueueService } from './queue/queue.service';
import { TaskWorkerService } from './worker/task-worker.service';
import { TaskHandlerRegistry } from './worker/task-handler.registry';
import { TasksEventBus } from './tasks.event-bus';
import { AuthModule } from '../auth/auth.module';

/**
 * 任务中心模块（T1.5 基础）。
 * 装配：TasksService（CRUD/流转/事件）、TaskQueueService（BullMQ 队列，Redis 降级）、
 * TaskWorkerService（BullMQ Worker，Redis 在线时消费）、TaskHandlerRegistry（handler 注册表，Phase 2/3 注入）、
 * TasksEventBus（进程内事件总线，驱动 SSE）。
 * 复用 AuthModule 的 AccessTokenGuard。PrismaService 由 PrismaModule 全局提供。
 */
@Module({
  imports: [AuthModule],
  controllers: [TasksController, TasksSseController],
  providers: [
    TasksService,
    TaskQueueService,
    TaskWorkerService,
    TaskHandlerRegistry,
    TasksEventBus,
  ],
  exports: [TasksService, TaskHandlerRegistry, TaskQueueService, TasksEventBus],
})
export class TasksModule {}
