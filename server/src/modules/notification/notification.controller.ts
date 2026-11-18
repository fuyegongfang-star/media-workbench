import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { NotificationService } from './notification.service';
import {
  type SendAlertDto,
  type SendTestDto,
  type TelegramChatsDto,
  type TelegramProbeDto,
  type UpsertNotificationChannelsDto,
} from './dto/notification.dto';

/**
 * 通知控制器（T1.10）。
 * - GET  /api/notification/status    ：渠道概览（公开，只读非敏感）。
 * - GET  /api/notification/channels  ：读取渠道配置（脱敏，需令牌）。
 * - PUT  /api/notification/channels  ：更新渠道配置（敏感字段加密入库，需令牌）。
 * - POST /api/notification/test      ：向某渠道发测试消息（需令牌）。
 * - POST /api/notification/telegram/chats：列出机器人可发送的会话 ID（需令牌，Token 不入库不回显）。
 * - POST /api/notification/telegram/probe：用表单当前 Token/Chat ID 直发测试消息（需令牌，暴露官方错误原文）。
 * - POST /api/notification/alert     ：手动触发一次监控告警（需令牌；备份脚本可调用此端点）。
 */
@Controller('notification')
export class NotificationController {
  constructor(private readonly svc: NotificationService) {}

  @Get('status')
  status() {
    return this.svc.status();
  }

  @Get('channels')
  @UseGuards(AccessTokenGuard)
  channels() {
    return this.svc.getChannelsView();
  }

  @Put('channels')
  @UseGuards(AccessTokenGuard)
  upsert(@Body() dto: UpsertNotificationChannelsDto) {
    return this.svc.upsertChannels(dto);
  }

  @Post('test')
  @UseGuards(AccessTokenGuard)
  test(@Body() dto: SendTestDto) {
    return this.svc.testChannel(dto.type, dto.text);
  }

  @Post('telegram/chats')
  @UseGuards(AccessTokenGuard)
  telegramChats(@Body() dto: TelegramChatsDto) {
    return this.svc.listTelegramChats(dto.botToken);
  }

  @Post('telegram/probe')
  @UseGuards(AccessTokenGuard)
  telegramProbe(@Body() dto: TelegramProbeDto) {
    return this.svc.probeTelegram(dto);
  }

  @Post('alert')
  @UseGuards(AccessTokenGuard)
  alert(@Body() dto: SendAlertDto) {
    return this.svc.sendAlert(dto.kind, dto.detail);
  }
}
