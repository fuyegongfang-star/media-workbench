import { IsOptional, IsString, IsIn } from 'class-validator';

/**
 * T4.6 成本看板查询 DTO。全字段可选；配合全局 ValidationPipe（whitelist + forbidNonWhitelisted）。
 * period 走白名单；其余字符串字段在 util.parseCostQuery 内做空值/日期合法性清洗。
 */
export class CostQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', 'thisMonth', 'all'])
  period?: '7d' | '30d' | 'thisMonth' | 'all';

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
