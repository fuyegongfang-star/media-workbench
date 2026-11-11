import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * 效果数据回收模块（T3.10）：发布后效果指标列表 / 维度看板 / 手动录入 / 微信统计拉取。
 * 复用 AuthModule 的 AccessTokenGuard（全资源鉴权）与全局 PrismaService。
 * 微信拉取复用 content/publish 的 WeChatPublishProvider（已含 token 缓存与 datacube 接口）。
 */
@Module({
  imports: [AuthModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
