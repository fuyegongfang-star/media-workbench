import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenPayload } from '../jwt.constants';

/**
 * 访问令牌守卫（T1.2）：校验 Authorization: Bearer <access> 并挂载 req.user。
 * 令牌类型必须为 access；签名/过期校验失败统一返回 401。
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
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
      throw new UnauthorizedException('无效的访问令牌');
    }
    if (payload.type !== 'access') {
      throw new UnauthorizedException('令牌类型错误');
    }
    request.user = payload;
    return true;
  }
}
