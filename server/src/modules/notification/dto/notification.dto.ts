import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ALERT_KINDS,
  CHANNEL_TYPES,
  type NotificationAlertKind,
  type NotificationChannelType,
} from '../notification.util';

/** 单个通知渠道配置（写入时字段受白名单 + 长度约束，防越权/异常输入）。 */
export class ChannelConfigDto {
  @IsIn(CHANNEL_TYPES)
  type!: NotificationChannelType;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  secret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpUser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  smtpPassword?: string;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  from?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  @ArrayMaxSize(50)
  to?: string[];
}

/** 通知渠道配置整体更新（全量覆盖 channels + 转发告警类型）。 */
export class UpsertNotificationChannelsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelConfigDto)
  @ArrayMaxSize(20)
  channels!: ChannelConfigDto[];

  @IsOptional()
  @IsArray()
  @IsIn(ALERT_KINDS, { each: true })
  forwardKinds?: NotificationAlertKind[];
}

/** 渠道测试发送。 */
export class SendTestDto {
  @IsIn(CHANNEL_TYPES)
  type!: NotificationChannelType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  text?: string;
}

/** 手动触发一次监控告警（如备份脚本失败后置此端点）。 */
export class SendAlertDto {
  @IsIn(ALERT_KINDS)
  kind!: NotificationAlertKind;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;
}
