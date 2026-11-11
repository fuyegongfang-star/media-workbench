import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

/**
 * 系统设置模块（T1.8）：站点设置单例（基础信息 / 默认公众号 AppID 加密 / 合规开关）+ 状态总览。
 * 复用 AuthModule 的 AccessTokenGuard（写操作鉴权）与 TasksModule 的 TaskQueueService（读任务/Redis 状态）。
 * 敏感字段（AppID）经 §3.1 AES-256-GCM 加密入库，绝不写日志。
 */
@Module({
  imports: [AuthModule, TasksModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
