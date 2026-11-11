import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountService } from './account.service';
import {
  OwnedAccountController,
  ReferenceAccountController,
  StrategyController,
} from './account.controller';

/**
 * 账号与策略模块（T1.7）：自有账号 / 对标账号 / 账号策略版本 的基础 CRUD。
 * 复用 AuthModule 的 AccessTokenGuard（全资源鉴权）与全局 PrismaService。
 * 软删/审计由 T1.3 数据完整性扩展统一处理，本模块不重复实现。
 */
@Module({
  imports: [AuthModule],
  controllers: [OwnedAccountController, ReferenceAccountController, StrategyController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
