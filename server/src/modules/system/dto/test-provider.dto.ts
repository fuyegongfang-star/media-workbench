import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 供应商连通性测试入参。
 * - providerId：测试已保存的供应商（服务端解密已入库密钥，不回传前端）。
 * - 其余字段：测试「尚未保存」的表单配置，apiKey 为本次明文，仅用于这一请求。
 * 全局 ValidationPipe 开启 forbidNonWhitelisted，未声明字段会被拒绝。
 */
export class TestProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  providerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiKey?: string;
}
