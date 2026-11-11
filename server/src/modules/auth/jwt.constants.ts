/** JWT 令牌类型与载荷约定（T1.2）。 */
export type TokenType = 'access' | 'refresh';

/** 访问令牌默认有效期（可由 env JWT_ACCESS_TTL 覆盖）。 */
export const ACCESS_TOKEN_TTL = '15m';
/** 刷新令牌默认有效期（可由 env JWT_REFRESH_TTL 覆盖）。 */
export const REFRESH_TOKEN_TTL = '7d';

/** JWT 载荷（写入 sub/username/role，便于后续 created_by 审计与鉴权）。 */
export interface AuthTokenPayload {
  /** 用户 ID（users.id） */
  sub: string;
  username: string;
  role: string;
  type: TokenType;
}
