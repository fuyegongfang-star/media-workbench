import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CostDashboardController } from './cost-dashboard.controller';
import { CostDashboardService } from './cost-dashboard.service';

/**
 * 工作台仪表盘模块（T4.6 成本/配额看板）。
 * 复用 AuthModule 的 AccessTokenGuard（全资源鉴权）与全局 PrismaService。
 * （原 T1.1 脚手架遗留的空白 DashboardController 已移除，功能由成本看板接管。）
 */
@Module({
  imports: [AuthModule],
  controllers: [CostDashboardController],
  providers: [CostDashboardService],
  exports: [CostDashboardService],
})
export class DashboardModule {}
