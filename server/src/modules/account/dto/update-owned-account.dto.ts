import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsPrismaJson } from './is-prisma-json.constraint';

/** 更新自有账号（T1.7）：全字段可选的部分更新。 */
export class UpdateOwnedAccountDto {
  @IsIn(['wechat'])
  @IsOptional()
  platform?: 'wechat';

  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsPrismaJson()
  position?: unknown;

  @IsOptional()
  @IsPrismaJson()
  audience?: unknown;

  @IsOptional()
  @IsPrismaJson()
  columns?: unknown;

  @IsIn(['active', 'paused', 'archived'])
  @IsOptional()
  status?: 'active' | 'paused' | 'archived';
}
