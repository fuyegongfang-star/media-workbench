import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** 更新起号计划（全字段可选，部分更新）。 */
export class UpdateLaunchPlanDto {
  @IsOptional()
  @IsIn(['article', 'image'])
  type?: 'article' | 'image';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string;

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
