import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { SystemService } from './system.service';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

/**
 * 系统设置控制器（T1.8）。
 * - GET /api/system/status：状态总览，只读非敏感信息，公开（便于系统设置页渲染状态）。
 * - GET /api/system/settings：读取站点设置（脱敏），需令牌。
 * - PUT /api/system/settings：更新站点设置（AppID 加密），需令牌。
 */
@Controller('system')
export class SystemController {
  constructor(private readonly svc: SystemService) {}

  @Get('status')
  status() {
    return this.svc.getStatus();
  }

  @Get('settings')
  @UseGuards(AccessTokenGuard)
  getSettings() {
    return this.svc.getSettings();
  }

  @Put('settings')
  @UseGuards(AccessTokenGuard)
  updateSettings(@Body() dto: UpdateSystemSettingsDto) {
    return this.svc.upsertSettings(dto);
  }
}
