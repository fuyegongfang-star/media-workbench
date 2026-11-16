import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * 用户管理模块（T6.4）：复用 AuthModule 的 AccessTokenGuard + RolesGuard。
 * PrismaService 由全局 PrismaModule 提供。
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
