import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { MetricsService } from './metrics.service';
import { MetricQueryDto } from './dto/metric-query.dto';
import { CreateMetricDto } from './dto/create-metric.dto';

/**
 * 效果数据回收控制器（T3.10）。挂载于 /metrics，全经 AccessTokenGuard。
 * - GET  /metrics          指标列表（筛选 + 分页 + 维度 label）
 * - GET  /metrics/dashboard 按选题/标题/账号维度聚合看板
 * - POST /metrics          手动录入单条指标
 * - POST /metrics/pull     触发一次微信统计拉取（需已配置公众号资质）
 */
@Controller('metrics')
@UseGuards(AccessTokenGuard)
export class MetricsController {
  constructor(private readonly svc: MetricsService) {}

  @Get()
  list(@Query() q: MetricQueryDto) {
    return this.svc.listMetrics(q as Record<string, any>);
  }

  @Get('dashboard')
  dashboard(@Query() q: MetricQueryDto) {
    const dimension = (q.dimension as 'topic' | 'title' | 'account') || 'account';
    return this.svc.getDashboard(dimension, q as Record<string, any>);
  }

  @Post()
  create(@Body() dto: CreateMetricDto) {
    return this.svc.createMetric(dto);
  }

  @Post('pull')
  pull(@Query('days') days?: string) {
    return this.svc.pullWechatStats(days ?? '7');
  }
}
