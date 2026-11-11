import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CostDashboardService } from './cost-dashboard.service';
import { CostQueryDto } from './dto/cost-query.dto';

/**
 * 成本/配额看板控制器（T4.6）。挂载于 /api/dashboard/cost，全经 AccessTokenGuard。
 * - GET /api/dashboard/cost/overview  总览：总花费/次数/成功率/时长 + 按模型/阶段 + 日序列 + 配额预警
 */
@Controller('dashboard/cost')
@UseGuards(AccessTokenGuard)
export class CostDashboardController {
  constructor(private readonly svc: CostDashboardService) {}

  @Get('overview')
  overview(@Query() q: CostQueryDto) {
    return this.svc.getOverview(q as Record<string, any>);
  }
}
