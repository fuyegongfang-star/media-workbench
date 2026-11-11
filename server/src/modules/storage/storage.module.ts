import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { MediaService } from './media.service';

/**
 * 文件存储模块（T1.4）：本地磁盘内容寻址存储 + sha256 校验和 + MediaAsset 元数据。
 * 复用 AuthModule 的 JwtModule 与 AccessTokenGuard（上传/列表/删除需鉴权）；
 * PrismaService 由全局 PrismaModule 提供；StorageService 不依赖 DB，可独立工作。
 */
@Module({
  imports: [AuthModule],
  controllers: [StorageController],
  providers: [StorageService, MediaService],
  exports: [StorageService, MediaService],
})
export class StorageModule {}
