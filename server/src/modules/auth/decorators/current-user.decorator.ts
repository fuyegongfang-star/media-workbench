import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthTokenPayload } from '../jwt.constants';

/**
 * 提取当前登录用户。
 *   @CurrentUser()        → 完整 payload（sub/username/role/type）
 *   @CurrentUser('sub')   → 用户 ID，供 created_by 审计使用
 *   @CurrentUser('role')  → 角色，供角色守卫使用
 * 依赖 AccessTokenGuard / RefreshTokenGuard 在请求上挂载 req.user。
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthTokenPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthTokenPayload }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
