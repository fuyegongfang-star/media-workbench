import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** 创建起号计划（T4.1：图文 / T4.2：贴图，type 区分）。ownedAccountId 服务端校验归属当前用户。 */
export class CreateLaunchPlanDto {
  @IsString()
  ownedAccountId!: string;

  @IsIn(['article', 'image'], { message: 'type 仅支持 article（图文）/ image（贴图）' })
  type!: 'article' | 'image';

  @IsString()
  @MaxLength(500)
  goal!: string;

  @IsOptional()
  @IsISO8601()
  start?: string;

  @IsOptional()
  @IsISO8601()
  end?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  frequency?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'paused', 'done'])
  status?: 'draft' | 'active' | 'paused' | 'done';
}
