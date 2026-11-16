import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RadarService } from './radar.service';
import { RadarSchedulerService } from './radar-scheduler.service';
import { RadarConfigDto } from './dto/radar-config.dto';

/**
 * 选题雷达控制器（T6.1）：
 * - GET  /api/radar/config      读配置
 * - PUT  /api/radar/config      写配置（同时重建定时）
 * - POST /api/radar/collect     手动触发一次采集（异步任务）
 * - GET  /api/radar/briefs      简报历史列表
 * - GET  /api/radar/briefs/:id  简报详情（id 或 YYYY-MM-DD）
 * - POST /api/radar/items/:id/convert  一键转选题
 * - GET  /api/radar/status      调度与数据源状态（只读）
 * 全部写操作需令牌；配置密钥（若有）不在此模块，沿用 SystemConfig AES 加密。
 */
@Controller('radar')
@UseGuards(AccessTokenGuard)
export class RadarController {
  constructor(
    private readonly svc: RadarService,
    private readonly scheduler: RadarSchedulerService,
  ) {}

  @Get('status')
  status() {
    return {
      module: 'radar',
      scheduler: this.scheduler.getStatus(),
      note: '免费源：头条/B站/HN/搜狗微信；LLM 标题走 SystemConfig（未配置则用模板兜底）',
    };
  }

  @Get('config')
  getConfig() {
    return this.svc.getConfig();
  }

  @Put('config')
  async updateConfig(@Body() dto: RadarConfigDto) {
    const cfg = await this.svc.updateConfig(dto);
    if (cfg.schedule.enabled) await this.scheduler.upsertSchedule(cfg.schedule.time);
    else await this.scheduler.removeSchedule();
    return { config: cfg, scheduler: this.scheduler.getStatus() };
  }

  @Post('collect')
  collect() {
    return this.svc.triggerCollect();
  }

  @Get('briefs')
  async listBriefs() {
    return { briefs: await this.svc.listBriefs() };
  }

  @Get('briefs/:id')
  async getBrief(@Param('id') id: string) {
    return this.svc.getBrief(id);
  }

  @Post('items/:id/convert')
  async convert(@Param('id') id: string) {
    return this.svc.convertToTopic(id);
  }
}
