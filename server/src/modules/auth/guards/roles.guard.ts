import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthTokenPayload } from '../jwt.constants';

export const ROLES_KEY = 'requiredRoles';

/** 声明端点允许的角色（需配合 AccessTokenGuard 先挂载 req.user）。 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * 角色守卫（T6.4）：在 AccessTokenGuard 之后执行，校验 req.user.role 是否命中 @Roles。
 * 未标注 @Roles 的端点直接放行（保持向后兼容）；无用户信息返回 401。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthTokenPayload }>();
    const user = request.user;
    if (!user) throw new UnauthorizedException('未登录或令牌无效');
    if (!required.includes(user.role)) {
      throw new ForbiddenException('当前角色无权执行此操作');
    }
    return true;
  }
}
