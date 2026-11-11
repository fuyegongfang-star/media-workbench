import { IsOptional, IsString, Matches } from 'class-validator';

/** 群发 / 定时群发请求体（T3.9）。scheduleTime 为 ISO 时间，留空即立即群发。 */
export class MassSendDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, { message: 'scheduleTime 须为 ISO 时间（如 2026-12-01T09:30）' })
  scheduleTime?: string;
}
