import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthTokenPayload } from './jwt.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 登录：校验口令，签发 access + refresh 双令牌。 */
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** 是否开放自助注册（公开，供登录页决定是否显示注册入口）。 */
  @Get('registration-status')
  registrationStatus() {
    return this.auth.isRegistrationEnabled().then((enabled) => ({ enabled }));
  }

  /** 自助注册（T6.4）：受系统开关控制，角色固定 editor，注册即登录。 */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /** 修改本人口令（需令牌）。 */
  @Post('change-password')
  @UseGuards(AccessTokenGuard)
  changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(userId, dto.oldPassword, dto.newPassword).then(() => ({ ok: true }));
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
      endpoints: [
        'POST /api/auth/login',
        'POST /api/auth/refresh',
        'GET /api/auth/me',
        'GET /api/auth/registration-status',
        'POST /api/auth/register',
        'POST /api/auth/change-password',
      ],
    };
  }
}
