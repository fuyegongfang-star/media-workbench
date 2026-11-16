import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 工作台业务总览（只读聚合）。
 *
 * 只回答运营问题：有多少选题、项目推进到哪一步、今天雷达抓了多少、
 * 本月 AI 花了多少、还有多少待办。服务健康检查 / 工程骨架之类的运维信息
 * 仍留在「系统管理 → 版本与运维」，不再占据工作台首屏。
 *
 * 数据库不可用时返回 available=false + 零值，由前端如实提示，不伪造数据。
 */
export interface BusinessOverview {
  available: boolean;
  generatedAt: string;
  topics: { total: number; thisWeek: number };
  titles: { total: number; selected: number };
  projects: {
    total: number;
    byStatus: Record<string, number>;
    inProgress: number;
    pendingReview: number;
    published: number;
  };
  radar: {
    runDate: string;
    status: string;
    itemCount: number;
    featuredCount: number;
  } | null;
  planner: { activePlans: number; pendingTasks: number };
  queue: { queued: number; running: number };
  generation: { monthRuns: number; monthCost: number; successRate: number };
  metrics: { total: number; last30Days: number };
  accounts: number;
}

const EMPTY: BusinessOverview = {
  available: false,
  generatedAt: new Date().toISOString(),
  topics: { total: 0, thisWeek: 0 },
  titles: { total: 0, selected: 0 },
  projects: { total: 0, byStatus: {}, inProgress: 0, pendingReview: 0, published: 0 },
  radar: null,
  planner: { activePlans: 0, pendingTasks: 0 },
  queue: { queued: 0, running: 0 },
  generation: { monthRuns: 0, monthCost: 0, successRate: 0 },
  metrics: { total: 0, last30Days: 0 },
  accounts: 0,
};

@Controller('overview')
@UseGuards(AccessTokenGuard)
export class OverviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async summary(): Promise<BusinessOverview> {
    if (!this.prisma.isConnected) return { ...EMPTY, generatedAt: new Date().toISOString() };
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const c = this.prisma.client;

      const [
        topicsTotal,
        topicsWeek,
        titlesTotal,
        titlesSelected,
        projects,
        radarLast,
        activePlans,
        pendingLaunchTasks,
        queuedTasks,
        runningTasks,
        genRows,
        metricRows,
        metricTotal,
        accounts,
      ] = await Promise.all([
        c.topic.count({ where: { deletedAt: null } }),
        c.topic.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
        c.titleCandidate.count(),
        c.titleCandidate.count({ where: { selected: true } }),
        c.contentProject.findMany({
          where: { deletedAt: null },
          select: { status: true, publishStatus: true },
          take: 5000,
        }),
        c.radarRun.findFirst({
          orderBy: { runDate: 'desc' },
          select: { runDate: true, status: true, itemCount: true, featuredCount: true },
        }),
        c.launchPlan.count({ where: { status: 'active' } }),
        c.launchTask.count({ where: { status: { in: ['pending', 'in_progress'] } } }),
        c.task.count({ where: { status: 'queued' } }),
        c.task.count({ where: { status: 'running' } }),
        c.generationRun.findMany({
          where: { createdAt: { gte: monthStart } },
          select: { cost: true, status: true },
          take: 5000,
        }),
        c.contentMetric.findMany({
          where: { metricDate: { gte: thirtyDaysAgo } },
          select: { metricDate: true },
          take: 5000,
        }),
        c.contentMetric.count(),
        c.ownedAccount.count(),
      ]);

      const byStatus: Record<string, number> = {};
      let published = 0;
      for (const p of projects) {
        byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
        if (p.publishStatus === 'PUBLISHED') published += 1;
      }
      const inProgress = (byStatus.CREATING ?? 0) + (byStatus.PENDING_CREATION ?? 0);
      const pendingReview = (byStatus.PENDING_REVIEW ?? 0) + (byStatus.NEEDS_REVISION ?? 0);
      const monthCost = genRows.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
      const successful = genRows.filter((r) => r.status === 'success').length;

      return {
        available: true,
        generatedAt: now.toISOString(),
        topics: { total: topicsTotal, thisWeek: topicsWeek },
        titles: { total: titlesTotal, selected: titlesSelected },
        projects: {
          total: projects.length,
          byStatus,
          inProgress,
          pendingReview,
          published,
        },
        radar: radarLast
          ? {
              runDate: radarLast.runDate.toISOString().slice(0, 10),
              status: String(radarLast.status),
              itemCount: radarLast.itemCount,
              featuredCount: radarLast.featuredCount,
            }
          : null,
        planner: { activePlans, pendingTasks: pendingLaunchTasks },
        queue: { queued: queuedTasks, running: runningTasks },
        generation: {
          monthRuns: genRows.length,
          monthCost: Math.round(monthCost * 100) / 100,
          successRate: genRows.length ? Math.round((successful / genRows.length) * 100) : 0,
        },
        metrics: { total: metricTotal, last30Days: metricRows.length },
        accounts,
      };
    } catch {
      return { ...EMPTY, generatedAt: new Date().toISOString() };
    }
  }
}
