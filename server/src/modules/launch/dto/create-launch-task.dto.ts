import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** 在指定计划下创建起号任务（T4.1）。可关联内容项目 projectId，关联后状态随项目发布而更新。 */
export class CreateLaunchTaskDto {
  @IsIn(['article', 'image'], { message: 'type 仅支持 article（图文）/ image（贴图）' })
  type!: 'article' | 'image';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  /** 素材引用（Json 数组），缺省空数组。服务端仅做类型兜底，不强制结构。 */
  @IsOptional()
  materialRefs?: unknown;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}
