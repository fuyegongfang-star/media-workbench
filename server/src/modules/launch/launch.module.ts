import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LaunchService } from './launch.service';
import { LaunchController } from './launch.controller';

/**
 * 起号计划模块（T4.1 图文起号计划 / T4.2 贴图起号计划）。
 * 复用 AuthModule 的 AccessTokenGuard 与全局 PrismaService。
 * 软删/审计由 T1.3 数据完整性扩展统一处理（LaunchPlan 已在 SOFT_DELETE_MODELS）。
 * T4.1 交付：计划与任务的 CRUD、项目关联、进度统计、任务状态随项目发布而更新。
 */
@Module({
  imports: [AuthModule],
  controllers: [LaunchController],
  providers: [LaunchService],
  exports: [LaunchService],
})
export class LaunchModule {}
