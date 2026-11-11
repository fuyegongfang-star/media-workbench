import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  aggregateByModel,
  aggregateByStage,
  buildDailySeries,
  buildGenerationRunWhere,
  computeQuotaAlerts,
  computeTotals,
  getMonthStart,
  normalizeCost,
  parseCostQuery,
  type CostRunRow,
  type QuotaBudget,
} from './cost-dashboard.util';

/** 成本看板聚合输出。 */
export interface CostOverview {
  period: string;
  totals: ReturnType<typeof computeTotals>;
  byModel: ReturnType<typeof aggregateByModel>;
  byStage: ReturnType<typeof aggregateByStage>;
  daily: ReturnType<typeof buildDailySeries>;
  quota: ReturnType<typeof computeQuotaAlerts>;
  generatedAt: string;
  dbConnected: boolean;
}

/**
 * 成本/配额看板服务（T4.6）。
 * - 基于 GenerationRun 的 cost/durationMs/model/stage/status/createdAt 做汇总（参数化查询，防注入）。
 * - 配额预警：当月各模型花费 vs SystemConfig.monthlyBudget（T4.6 新增字段），比率超 0.8 预警、超 1 越界。
 * - 真实 DB 不可用时如实抛错（待环境），不伪造通过。
 */
@Injectable()
export class CostDashboardService {
  private readonly logger = new Logger(CostDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: Record<string, any>): Promise<CostOverview> {
    const parsed = parseCostQuery(query);
    const where = buildGenerationRunWhere(parsed);

    const rows = (await this.prisma.client.generationRun.findMany({
      where,
      select: {
        model: true,
        stage: true,
        status: true,
        cost: true,
        durationMs: true,
        createdAt: true,
        createdById: true,
      },
    })) as CostRunRow[];

    const totals = computeTotals(rows);
    const byModel = aggregateByModel(rows);
    const byStage = aggregateByStage(rows);

    const now = new Date();
    const periodRange =
      parsed.period === '7d'
        ? { from: new Date(now.getTime() - 6 * 864e5), to: now }
        : parsed.period === '30d'
          ? { from: new Date(now.getTime() - 29 * 864e5), to: now }
          : parsed.period === 'thisMonth'
            ? { from: getMonthStart(now), to: now }
            : { from: null, to: null };
    const daily = buildDailySeries(rows, periodRange.from, periodRange.to, now);

    // 配额：仅取配置了月度预算的供应商模型
    const budgetRows = await this.prisma.client.systemConfig.findMany({
      where: { monthlyBudget: { not: null } },
      select: { provider: true, model: true, monthlyBudget: true },
    });
    const budgets: QuotaBudget[] = budgetRows.map((r) => ({
      provider: r.provider,
      model: r.model,
      monthlyBudget: normalizeCost(r.monthlyBudget),
    }));

    let monthlyRuns: CostRunRow[] = [];
    if (budgets.length) {
      const monthStart = getMonthStart(now);
      const models = budgets.map((b) => b.model);
      monthlyRuns = (await this.prisma.client.generationRun.findMany({
        where: { createdAt: { gte: monthStart }, model: { in: models } },
        select: { model: true, cost: true },
      })) as CostRunRow[];
    }

    const quota = computeQuotaAlerts(monthlyRuns, budgets);

    return {
      period: parsed.period ?? '30d',
      totals,
      byModel,
      byStage,
      daily,
      quota,
      generatedAt: now.toISOString(),
      dbConnected: true,
    };
  }
}
