import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** 上传时随 multipart 提交的归属字段（T1.4）。ownerType 限定 schema 枚举值。 */
export class UploadMediaDto {
  @IsIn(['source_material', 'content_project', 'owned_account', 'launch_task'])
  ownerType!: 'source_material' | 'content_project' | 'owned_account' | 'launch_task';

  @IsString()
  @MaxLength(64)
  ownerId!: string;

  /** 来源说明/原始文件名（可选，截断入库）。 */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;
}
