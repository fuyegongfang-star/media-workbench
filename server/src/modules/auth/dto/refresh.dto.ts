import { IsString, MinLength } from 'class-validator';

/** 刷新令牌请求体（T1.2）。 */
export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}
