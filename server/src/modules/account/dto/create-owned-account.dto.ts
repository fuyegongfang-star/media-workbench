import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsPrismaJson } from './is-prisma-json.constraint';

/** 创建自有账号（T1.7）。userId 由服务端从当前登录用户注入，不接收客户端值。 */
export class CreateOwnedAccountDto {
  @IsIn(['wechat'], { message: '平台仅支持 wechat（首期）' })
  @IsOptional()
  platform?: 'wechat';

  @IsString()
  @MaxLength(120)
  name!: string;

  /** 账号定位（Json：人设/标签等）。 */
  @IsOptional()
  @IsPrismaJson()
  position?: unknown;

  /** 目标受众（Json）。 */
  @IsOptional()
  @IsPrismaJson()
  audience?: unknown;

  /** 栏目规划（Json）。 */
  @IsOptional()
  @IsPrismaJson()
  columns?: unknown;

  @IsIn(['active', 'paused', 'archived'])
  @IsOptional()
  status?: 'active' | 'paused' | 'archived';
}
