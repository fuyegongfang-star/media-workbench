import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenPayload } from '../jwt.constants';

/**
 * 刷新令牌守卫（T1.2）：校验刷新令牌并挂载 req.user。
 * 令牌类型必须为 refresh；访问令牌不可用于刷新。
 */
@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown>; user?: AuthTokenPayload }>();
    const authHeader = request.headers['authorization'];
    if (typeof authHeader !== 'string') {
      throw new UnauthorizedException('缺失 Authorization 头');
    }
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Authorization 头格式应为 Bearer <token>');
    }

    let payload: AuthTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AuthTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('无效的刷新令牌');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('令牌类型错误');
    }
    request.user = payload;
    return true;
  }
}
