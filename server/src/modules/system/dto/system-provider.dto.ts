import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

/** 新增/更新 LLM 供应商。apiKey 明文仅在服务端 AES 加密入库，绝不回显、绝不写日志。 */
export class UpsertProviderDto {
  @IsString()
  @MaxLength(60)
  provider!: string;

  @IsString()
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  @MaxLength(300)
  baseUrl?: string;

  @IsString()
  @MaxLength(120)
  model!: string;

  /** 明文密钥；更新时留空表示保持原密钥不变。 */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  apiKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyBudget?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
