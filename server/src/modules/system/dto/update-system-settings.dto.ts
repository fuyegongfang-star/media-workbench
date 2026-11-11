import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 站点设置更新 DTO（T1.8）：所有字段可选，未传字段保持原值。
 * - defaultWechatAppId：明文 AppID，服务端加密入库（绝不入库明文、绝不写日志）；传空串表示清空。
 * - compliance：合规开关键值对，仅布尔值生效（见 system.util.mergeCompliance）。
 */
export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  siteName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteDesc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultWechatAppId?: string;

  /**
   * T3.9 公众号发布执行所需的 AppSecret（与 AppID 配套，用于换取 access_token）。
   * 明文仅在服务端加密入库（AES-256-GCM），绝不入库明文、绝不写日志；传空串表示清空。
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  defaultWechatAppSecret?: string;

  @IsOptional()
  @IsObject()
  compliance?: Record<string, unknown>;
}
