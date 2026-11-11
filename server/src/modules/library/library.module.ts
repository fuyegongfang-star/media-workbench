import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

/**
 * 素材库模块（T4.3）：跨类型搜索 / 多维度筛选 / 关系回溯 / 收藏·标签·归档·软删恢复。
 * 复用 AuthModule 的 AccessTokenGuard（全资源鉴权）与全局 PrismaService。
 * 软删/审计由 T1.3 数据完整性扩展统一处理，恢复走显式 deletedAt 置空。
 */
@Module({
  imports: [AuthModule],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
