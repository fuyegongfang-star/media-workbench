import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** 更新起号任务（全字段可选）。projectId 可置 null 解除关联。 */
export class UpdateLaunchTaskDto {
  @IsOptional()
  @IsIn(['article', 'image'])
  type?: 'article' | 'image';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  materialRefs?: unknown;

  /** 关联内容项目；传 null 表示解除关联。 */
  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsIn(['pending', 'in_progress', 'done', 'skipped'])
  status?: 'pending' | 'in_progress' | 'done' | 'skipped';

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}
