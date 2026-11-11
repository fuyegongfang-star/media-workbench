import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { ObservabilityService } from './observability.service';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * 可观测性控制器（T1.9）。
 * - GET /api/observability/audit：审计日志列表（检索/筛选 + 分页），需令牌。
 * - GET /api/observability/recycle-bin：回收站列表（可选 ?type 过滤），需令牌。
 * - POST /api/observability/recycle-bin/:type/:id/restore：恢复软删记录，需令牌。
 * 全部经 AccessTokenGuard；类型参数受 getRecycleModel 白名单约束，未知类型返回 404。
 */
@Controller('observability')
export class ObservabilityController {
  constructor(private readonly svc: ObservabilityService) {}

  @Get('audit')
  @UseGuards(AccessTokenGuard)
  listAudit(@Query() q: AuditQueryDto) {
    return this.svc.listAudit(q);
  }

  @Get('recycle-bin')
  @UseGuards(AccessTokenGuard)
  listRecycleBin(@Query('type') type?: string) {
    return this.svc.listRecycleBin(type);
  }

  @Post('recycle-bin/:type/:id/restore')
  @UseGuards(AccessTokenGuard)
  restore(@Param('type') type: string, @Param('id') id: string) {
    return this.svc.restore(type, id);
  }
}
