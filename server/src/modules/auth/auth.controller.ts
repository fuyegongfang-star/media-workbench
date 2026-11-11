import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthTokenPayload } from './jwt.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 登录：校验口令，签发 access + refresh 双令牌（首期单用户，无注册/找回）。 */
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** 刷新：用 refresh 令牌重新签发 access（stateless，首期不轮换 refresh）。 */
  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  refresh(@CurrentUser() payload: AuthTokenPayload) {
    return this.auth.refresh(payload);
  }

  /** 当前登录用户（需 access 令牌）。 */
  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@CurrentUser('sub') userId: string) {
    return this.auth.me(userId);
  }

  /** 模块自检信息。 */
  @Get()
  overview() {
    return {
      module: 'auth',
      label: '认证',
      status: 'implemented',
      endpoints: ['POST /api/auth/login', 'POST /api/auth/refresh', 'GET /api/auth/me'],
    };
  }
}
