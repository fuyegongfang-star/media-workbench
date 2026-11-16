import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

/** 更新 LLM 供应商（全部可选，未传字段保持原值）。 */
export class UpdateProviderDto {
  @IsOptional() @IsString() @MaxLength(60) provider?: string;
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsString() @IsUrl({ require_tld: false }) @MaxLength(300) baseUrl?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  /** 留空(undefined)=保持原密钥；空串=清空；非空=加密替换。 */
  @IsOptional() @IsString() @MaxLength(300) apiKey?: string;
  @IsOptional() @IsInt() @Min(0) monthlyBudget?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
