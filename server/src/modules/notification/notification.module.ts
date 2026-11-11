import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

/**
 * 通知模块（T1.10）：通知渠道与监控告警。
 * 复用 AuthModule 的 AccessTokenGuard（写操作鉴权）与 TasksModule 的 TasksEventBus（订阅任务事件）。
 * 敏感字段（webhookUrl/secret/smtpPassword）经 §3.1 AES-256-GCM 加密入库，绝不写日志。
 */
@Module({
  imports: [AuthModule, TasksModule],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
