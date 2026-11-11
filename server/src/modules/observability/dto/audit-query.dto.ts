import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * 审计日志查询 DTO（T1.9）。全局 ValidationPipe 启用 whitelist：
 * 多余字段将被丢弃，防越权注入。
 */
export class AuditQueryDto {
  @IsOptional()
  @IsString()
  objectType?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  /** ISO 日期字符串（from 含当天，to 含当天），无效值由 service 忽略。 */
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
