import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getSecretCrypto } from '../system/crypto.util';
import { SITE_CONFIG_ID } from '../system/system.service';
import { WeChatPublishProvider } from '../content/publish/wechat.provider';
import {
  aggregateMetricRows,
  buildMetricWhere,
  clampMetricPage,
  type MetricDimension,
  type MetricDimensionAggregate,
  type MetricItem,
  metricOrderBy,
  normalizeMetricNumber,
  parseMetricQuery,
  parseWechatArticleRead,
  parseWechatUserRead,
  parseWechatUserSummary,
  shapeMetric,
  type MetricSeed,
  type MetricQuery,
} from './metrics.util';

/** 看板聚合返回的一行（含维度 label）。 */
export interface MetricItemWithLabels extends MetricItem {
  accountName?: string | null;
  topicTitle?: string | null;
  titleText?: string | null;
  projectTitle?: string | null;
}

const ALLOWED_SOURCES = [
  'manual',
  'wechat_user_read',
  'wechat_article_read',
  'wechat_user_summary',
] as const;

function formatDateRange(days: number): { begin: string; end: string } {
  const end = new Date();
  const begin = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { begin: fmt(begin), end: fmt(end) };
}

/**
 * 发布后效果数据回收服务（T3.10）。
 * - 列表/看板：按选题/标题/账号维度聚合阅读/分享/收藏/在看/涨粉/取关（参数化查询，防注入）。
 * - 手动录入：createMetric（参数绑定）。
 * - 微信拉取：pullWechatStats 调用 getuserread/getarticleread/getusersummary → 解析 → upsert；
 *   真实 DB / 微信凭据 / 网络缺省时如实抛错（待环境），不伪造通过。
 * - 可选定时：METRICS_AUTO_PULL=1 时启用定时拉取（每次 tick 先校验 DB 连通性）。
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  private readonly provider: WeChatPublishProvider;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() provider?: WeChatPublishProvider,
  ) {
    this.provider = provider ?? new WeChatPublishProvider();
  }

  onModuleInit(): void {
    if (process.env.METRICS_AUTO_PULL === '1') {
      const intervalMs = Number(process.env.METRICS_PULL_INTERVAL_MS) || 6 * 60 * 60 * 1000;
      this.timer = setInterval(() => {
        if (!this.prisma.isConnected) return;
        void this.pullWechatStats('7').catch((e) =>
          this.logger.warn(`效果数据自动拉取失败：${(e as Error).message}`),
        );
      }, intervalMs);
      this.logger.log(`已启用效果数据自动拉取（间隔 ${Math.round(intervalMs / 1000)}s）`);
    }
  }

  /** 指标列表（含关联维度 label，供前端展示）。 */
  async listMetrics(query: Record<string, any>): Promise<{
    items: MetricItemWithLabels[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const parsed: MetricQuery = parseMetricQuery(query);
    const where = buildMetricWhere(parsed);
    const { skip, take, page, pageSize } = clampMetricPage(
      parsed.page,
      parsed.pageSize,
    );
    const orderBy = metricOrderBy(parsed.sort);

    const [rows, total] = await Promise.all([
      this.prisma.client.contentMetric.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          contentProject: {
            select: {
              externalUrl: true,
              topic: { select: { title: true } },
              selectedTitle: { select: { text: true } },
              ownedAccount: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.client.contentMetric.count({ where }),
    ]);

    return {
      items: rows.map((r) => {
        const base = shapeMetric(r);
        return {
          ...base,
          accountName: r.contentProject?.ownedAccount?.name ?? null,
          topicTitle: r.contentProject?.topic?.title ?? null,
          titleText: r.contentProject?.selectedTitle?.text ?? null,
          projectTitle: r.contentProject?.externalUrl ?? null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  /** 按维度聚合的效果看板（选题/标题/账号）。 */
  async getDashboard(
    dimension: MetricDimension,
    query: Record<string, any>,
  ): Promise<{
    dimension: MetricDimension;
    totals: MetricDimensionAggregate;
    rows: MetricDimensionAggregate[];
    generatedAt: string;
  }> {
    const parsed: MetricQuery = parseMetricQuery(query);
    const where = buildMetricWhere(parsed);

    const rows = await this.prisma.client.contentMetric.findMany({
      where,
      select: {
        readCount: true,
        shareCount: true,
        favoriteCount: true,
        likeCount: true,
        followerIncrease: true,
        unfollowCount: true,
        contentProject: {
          select: {
            id: true,
            ownedAccountId: true,
            topicId: true,
            selectedTitleId: true,
            topic: { select: { title: true } },
            selectedTitle: { select: { text: true } },
            ownedAccount: { select: { name: true } },
          },
        },
      },
    });

    const dimensionRows = rows
      .map((r) => {
        const cp = r.contentProject;
        let key = 'unknown';
        let label = '未知';
        if (dimension === 'account' && cp?.ownedAccountId) {
          key = cp.ownedAccountId;
          label = cp.ownedAccount?.name ?? key;
        } else if (dimension === 'topic' && cp?.topicId) {
          key = cp.topicId;
          label = cp.topic?.title ?? key;
        } else if (dimension === 'title' && cp?.selectedTitleId) {
          key = cp.selectedTitleId;
          label = cp.selectedTitle?.text ?? key;
        }
        return {
          key,
          label,
          readCount: r.readCount,
          shareCount: r.shareCount,
          favoriteCount: r.favoriteCount,
          likeCount: r.likeCount,
          followerIncrease: r.followerIncrease,
          unfollowCount: r.unfollowCount,
        };
      })
      .filter((r) => r.key !== 'unknown');

    const aggregated = aggregateMetricRows(dimensionRows);
    const totals: MetricDimensionAggregate = {
      key: '__total__',
      label: '合计',
      readCount: aggregated.reduce((s, x) => s + x.readCount, 0),
      shareCount: aggregated.reduce((s, x) => s + x.shareCount, 0),
      favoriteCount: aggregated.reduce((s, x) => s + x.favoriteCount, 0),
      likeCount: aggregated.reduce((s, x) => s + x.likeCount, 0),
      followerIncrease: aggregated.reduce((s, x) => s + x.followerIncrease, 0),
      unfollowCount: aggregated.reduce((s, x) => s + x.unfollowCount, 0),
      count: aggregated.reduce((s, x) => s + x.count, 0),
    };

    return {
      dimension,
      totals,
      rows: aggregated,
      generatedAt: new Date().toISOString(),
    };
  }

  /** 手动录入单条指标（参数绑定；数字非负归一）。 */
  async createMetric(dto: {
    contentProjectId: string;
    metricDate: string;
    externalArticleId?: string;
    readCount?: number;
    shareCount?: number;
    favoriteCount?: number;
    likeCount?: number;
    followerIncrease?: number;
    unfollowCount?: number;
    source?: string;
  }): Promise<MetricItem> {
    const source = ALLOWED_SOURCES.includes(dto.source as never)
      ? (dto.source as string)
      : 'manual';
    const metricDate = new Date(`${dto.metricDate}T00:00:00.000Z`);
    if (Number.isNaN(metricDate.getTime())) {
      throw new Error('metricDate 不是合法日期（应为 YYYY-MM-DD）');
    }
    const created = await this.prisma.client.contentMetric.upsert({
      where: {
        contentProjectId_metricDate_source: {
          contentProjectId: dto.contentProjectId,
          metricDate,
          source,
        },
      },
      update: {
        externalArticleId: dto.externalArticleId ?? null,
        readCount: normalizeMetricNumber(dto.readCount),
        shareCount: normalizeMetricNumber(dto.shareCount),
        favoriteCount: normalizeMetricNumber(dto.favoriteCount),
        likeCount: normalizeMetricNumber(dto.likeCount),
        followerIncrease: normalizeMetricNumber(dto.followerIncrease),
        unfollowCount: normalizeMetricNumber(dto.unfollowCount),
      },
      create: {
        contentProjectId: dto.contentProjectId,
        metricDate,
        externalArticleId: dto.externalArticleId ?? null,
        readCount: normalizeMetricNumber(dto.readCount),
        shareCount: normalizeMetricNumber(dto.shareCount),
        favoriteCount: normalizeMetricNumber(dto.favoriteCount),
        likeCount: normalizeMetricNumber(dto.likeCount),
        followerIncrease: normalizeMetricNumber(dto.followerIncrease),
        unfollowCount: normalizeMetricNumber(dto.unfollowCount),
        source,
      },
    });
    return shapeMetric(created);
  }

  /** 解析并写入一批指标种子（按 contentProjectId + 日期 + source 幂等 upsert）。 */
  private async upsertSeeds(contentProjectId: string, seeds: MetricSeed[]): Promise<number> {
    let n = 0;
    for (const s of seeds) {
      await this.prisma.client.contentMetric.upsert({
        where: {
          contentProjectId_metricDate_source: {
            contentProjectId,
            metricDate: s.metricDate,
            source: s.source,
          },
        },
        update: {
          externalArticleId: s.externalArticleId ?? null,
          readCount: s.readCount,
          shareCount: s.shareCount,
          favoriteCount: s.favoriteCount,
          likeCount: s.likeCount,
          followerIncrease: s.followerIncrease,
          unfollowCount: s.unfollowCount,
        },
        create: {
          contentProjectId,
          metricDate: s.metricDate,
          externalArticleId: s.externalArticleId ?? null,
          readCount: s.readCount,
          shareCount: s.shareCount,
          favoriteCount: s.favoriteCount,
          likeCount: s.likeCount,
          followerIncrease: s.followerIncrease,
          unfollowCount: s.unfollowCount,
          source: s.source,
        },
      });
      n += 1;
    }
    return n;
  }

  /**
   * 效果数据回收定时任务单元：拉取微信公众号统计接口 → 解析 → 落库。
   * 真实网络/凭据/DB 不可用则抛清晰错误（待环境）。days 默认 7（微信统计接口单次要 ≤7 天）。
   */
  async pullWechatStats(days = '7'): Promise<{ pulled: number; note: string }> {
    if (!this.prisma.isConnected) {
      throw new Error('效果数据回收失败：数据库未连接（待 PG 环境）');
    }
    const dayNum = Math.min(Math.max(Number(days) || 7, 1), 7);

    // 1) 解析公众号凭据（AES 解密，仅内存使用不落日志）。
    const row = await this.prisma.client.siteConfig.findUnique({ where: { id: SITE_CONFIG_ID } });
    const appIdEnc = row?.defaultWechatAppIdEncrypted;
    const appSecretEnc = row?.defaultWechatAppSecretEncrypted;
    if (!appIdEnc || !appSecretEnc) {
      throw new Error('未配置公众号 AppID / AppSecret（请在系统设置中填写并经加密入库）');
    }
    const appId = getSecretCrypto().decrypt(appIdEnc);
    const appSecret = getSecretCrypto().decrypt(appSecretEnc);
    if (!appId || !appSecret) {
      throw new Error('公众号凭据解密后为空，请重新在系统设置中配置');
    }

    const token = await this.provider.getAccessToken(appId, appSecret);
    const { begin, end } = formatDateRange(dayNum);

    // 2) 拉取三类统计接口。
    const [userReadJson, articleReadJson, userSummaryJson] = await Promise.all([
      this.provider.getUserRead(token, begin, end),
      this.provider.getArticleRead(token, begin, end),
      this.provider.getUserSummary(token, begin, end),
    ]);
    const articleSeeds = parseWechatArticleRead(articleReadJson);
    const summarySeeds = parseWechatUserSummary(userSummaryJson);
    void userReadJson; // user_read 为全局聚合，按图文粒度已由 articleRead 覆盖

    // 3) 取已发布且有外部 media_id 的内容项目，按 msgid 对齐 article 级指标。
    const projects = await this.prisma.client.contentProject.findMany({
      where: { externalMediaId: { not: null }, publishStatus: 'PUBLISHED' },
      select: { id: true, externalMediaId: true },
    });

    let pulled = 0;
    for (const p of projects) {
      const matched = articleSeeds.filter((s) => s.externalArticleId === p.externalMediaId);
      if (matched.length) {
        pulled += await this.upsertSeeds(p.id, matched);
      }
      // 涨粉/取关为账号级指标，按日期归属到已发布项目（近似：多项目会重复计入，已记 warn）。
      if (summarySeeds.length) {
        pulled += await this.upsertSeeds(p.id, summarySeeds);
      }
    }
    if (projects.length > 1 && summarySeeds.length) {
      this.logger.warn(
        '涨粉/取关为账号级指标，已按项目数重复归属（近似）；如有多篇已发布文章，看板该字段会偏高。',
      );
    }

    return {
      pulled,
      note:
        projects.length === 0
          ? '无已发布（含 externalMediaId）的内容项目可对齐，未写入'
          : `已对齐 ${projects.length} 个已发布项目`,
    };
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
