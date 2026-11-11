import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 素材库列表查询 DTO（T4.3）。全局 ValidationPipe 启用 whitelist：
 * 多余字段丢弃，防越权注入。数组/布尔以逗号或 'true'/'false' 字符串传入，service 层解析。
 */
export class MaterialQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  referenceAccountId?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  favorite?: string;

  @IsOptional()
  @IsString()
  archived?: string;

  @IsOptional()
  @IsString()
  hasAnalysis?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['newest', 'oldest', 'imported', 'collected'])
  sort?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
