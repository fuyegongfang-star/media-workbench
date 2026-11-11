import { IsString, MinLength, MaxLength } from 'class-validator';

/** 登录请求体（T1.2）。首期单用户，仅用户名 + 口令。 */
export class LoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
