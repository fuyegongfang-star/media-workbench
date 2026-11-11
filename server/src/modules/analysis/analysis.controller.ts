import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthTokenPayload } from '../auth/jwt.constants';
import { AnalysisService } from './analysis.service';
import { SummarizeAccountDto } from './dto/summarize-account.dto';

@Controller('analysis')
@UseGuards(AccessTokenGuard)
export class AnalysisController {
  constructor(private readonly svc: AnalysisService) {}

  /** 触发单篇拆解（异步任务，返回 taskId）。需令牌。 */
  @Post('materials/:id/decompose')
  decompose(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    return this.svc.decompose(id, user?.sub);
  }

  /** 某素材的全部拆解结果。需令牌。 */
  @Get('materials/:id/analyses')
  listByMaterial(@Param('id') id: string) {
    return this.svc.listByMaterial(id);
  }

  /** 拆解任务列表（AnalysisRun, type=single）。需令牌。 */
  @Get('runs')
  listRuns() {
    return this.svc.listRuns();
  }

  /** 单条拆解任务详情（含其 Analysis 列表）。需令牌。 */
  @Get('runs/:id')
  getRun(@Param('id') id: string) {
    return this.svc.getRun(id);
  }

  /** 单条分析结果明细。需令牌。 */
  @Get('analyses/:id')
  getAnalysis(@Param('id') id: string) {
    return this.svc.getAnalysis(id);
  }

  /** 触发账号级汇总：聚合选中拆解 → 产出策略草稿（异步任务，返回 taskId）。需令牌。 */
  @Post('accounts/:ownedAccountId/summary')
  summarize(
    @Param('ownedAccountId') ownedAccountId: string,
    @Body() dto: SummarizeAccountDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.svc.summary(ownedAccountId, dto.analysisIds, user?.sub);
  }

  /** 账号级汇总任务列表（AnalysisRun, type=account_summary）。需令牌。 */
  @Get('account-runs')
  listAccountRuns() {
    return this.svc.listAccountRuns();
  }
}
