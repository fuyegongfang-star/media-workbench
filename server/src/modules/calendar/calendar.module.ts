import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/**
 * 内容日历模块（T4.4 排期视图）。
 * 复用 AuthModule 的 AccessTokenGuard；聚合与改期直接走 PrismaService（全局扩展客户端）。
 */
@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
