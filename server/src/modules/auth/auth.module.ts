import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';

/**
 * 认证模块（T1.2）：JWT(access+refresh) + argon2 + users 表。
 * JwtModule 在此用 JWT_SECRET 配置；守卫/服务导出供其他模块复用（如后续 created_by 审计、角色守卫）。
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        // 默认过期交给每次 sign 时按 type 覆盖，这里不设全局 expiresIn
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenGuard, RefreshTokenGuard],
  exports: [JwtModule, AccessTokenGuard, RefreshTokenGuard, AuthService],
})
export class AuthModule {}
