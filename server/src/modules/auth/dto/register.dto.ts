import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

/** 自助注册请求体（T6.4）：仅用户名 + 口令；角色固定 editor，不接受 role 字段（防提权）。 */
export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_.-]+$/, { message: '用户名仅允许字母、数字、下划线、点、连字符' })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
