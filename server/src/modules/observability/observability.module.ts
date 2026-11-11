import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';

/**
 * 可观测性模块（T1.9）：审计日志检索 + 回收站列表/恢复。
 * 复用 AuthModule 的 AccessTokenGuard 与全局 PrismaService（经扩展 client）。
 */
@Module({
  imports: [AuthModule],
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
})
export class ObservabilityModule {}
