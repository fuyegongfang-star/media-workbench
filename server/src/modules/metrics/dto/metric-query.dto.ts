import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 效果指标查询 DTO（T3.10）。全局 ValidationPipe 启用 whitelist：多余字段丢弃，防越权注入。
 * 数组/日期以字符串传入，service 层解析。
 */
export class MetricQueryDto {
  @IsOptional()
  @IsString()
  contentProjectId?: string;

  @IsOptional()
  @IsString()
  ownedAccountId?: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  @IsOptional()
  @IsString()
  titleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['topic', 'title', 'account'])
  dimension?: string;

  @IsOptional()
  @IsString()
  @IsIn(['newest', 'oldest'])
  sort?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
