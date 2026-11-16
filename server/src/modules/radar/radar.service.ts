import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TaskType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SITE_CONFIG_ID } from '../system/system.service';
import { TasksService } from '../tasks/tasks.service';
import { LlmProviderService } from '../generation/llm-provider.service';
import { COLLECTOR_IDS, collectAll } from './collectors';
import {
  DEFAULT_RADAR_CONFIG,
  type RadarConfig,
  type RadarTitle,
  type ScoredCandidate,
} from './radar.contract';
import {
  accountDedupeKey,
  dedupeAndRank,
  fallbackTitles,
  filterSeenAccounts,
  fingerprintOf,
  normalizeHeat,
  parseRadarTitles,
  relevanceOf,
  sanitizeConfig,
  scoreOf,
} from './radar.util';

export interface RadarBriefSummary {
  id: string;
  runDate: string;
  status: string;
  itemCount: number;
  featuredCount: number;
  error: string | null;
  createdAt: string;
}

export interface RadarBriefDetail extends RadarBriefSummary {
  sourceStats: Record<string, unknown>;
  items: Array<{
    id: string;
    title: string;
    angle: string | null;
    sourceUrl: string | null;
    sourceName: string;
    niche: string | null;
    score: number | null;
    relevance: number | null;
    tier: string;
    rank: number;
    titles: RadarTitle[];
    convertedTopicId: string | null;
  }>;
}

/**
 * 选题雷达服务（T6.1）。
 * - 配置存 SiteConfig.radarConfig（单例，站点设置同一行）；读写均清洗，防异常输入。
 * - collectOnce：采集 → 指纹去重 → 赛道打分 → 出标题（LLM 可用则 AI，否则模板兜底）→ 落 RadarRun/RadarItem。
 * - 一键转选题：把 RadarItem 转 Topic(sourceType=radar)，供内容项目复用。
 * - 单源失败降级为 sourceStats.error，不阻断整轮；LLM 未配置不失败，仅用模板标题。
 */
@Injectable()
export class RadarService {
  private readonly logger = new Logger(RadarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly llm: LlmProviderService,
  ) {}

  // ---------- 配置 ----------

  async getConfig(): Promise<RadarConfig> {
    if (!this.prisma.isConnected) return DEFAULT_RADAR_CONFIG; // 待 PG 环境：如实返回默认值，不伪造已保存
    const row = await this.prisma.client.siteConfig.findUnique({ where: { id: SITE_CONFIG_ID } });
    return sanitizeConfig((row?.radarConfig as unknown) ?? null);
  }

  async updateConfig(input: unknown): Promise<RadarConfig> {
    const cfg = sanitizeConfig(input);
    await this.prisma.client.siteConfig.upsert({
      where: { id: SITE_CONFIG_ID },
      create: { id: SITE_CONFIG_ID, radarConfig: cfg as unknown as Prisma.InputJsonValue },
      update: { radarConfig: cfg as unknown as Prisma.InputJsonValue },
    });
    this.logger.log('选题雷达配置已更新（赛道词库/来源/条数/调度）');
    return cfg;
  }

  // ---------- 采集触发 ----------

  /** 手动/定时触发：建 RADAR_COLLECT 任务并入队；Redis 不可用则 dispatched=false（待环境）。 */
  async triggerCollect(userId?: string): Promise<{ taskId: string; dispatched: boolean }> {
    const today = this.utcDayKey(new Date());
    const { task, dispatched } = await this.tasks.create(
      {
        taskType: TaskType.RADAR_COLLECT,
        objectType: 'radar_run',
        objectId: today,
        payload: { runDate: today, createdById: userId ?? null } as Record<string, unknown>,
      },
      userId,
    );
    return { taskId: task.id, dispatched };
  }

  /** Worker 处理器入口：完成一次完整采集流水线。 */
  async runCollect(payload: unknown): Promise<void> {
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const dayKey = typeof p.runDate === 'string' ? p.runDate : this.utcDayKey(new Date());
    const runDate = new Date(`${dayKey}T00:00:00.000Z`);
    if (Number.isNaN(runDate.getTime())) throw new Error(`非法采集日期：${dayKey}`);

    const cfg = await this.getConfig();
    const keywords = cfg.niches.filter((n) => n.enabled).flatMap((n) => n.keywords);

    // runDate 唯一 + 原子抢占：同日只允许一个执行实例（业务 worker 并发度 4，调度改时间也可能双触发）。
    // create 抢首次（并发下仅一个成功）；P2002 说明别人已建行 → success/running 都跳过，
    // 只有 failed 允许重跑，且用条件 updateMany(status:'failed') 二次抢占，count=0 表示别人已抢。
    let runId: string;
    try {
      const created = await this.prisma.client.radarRun.create({
        data: { runDate, status: 'running', taskId: typeof p.taskId === 'string' ? p.taskId : null },
      });
      runId = created.id;
    } catch (error: unknown) {
      const isUnique = typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
      if (!isUnique) throw error;
      const existing = await this.prisma.client.radarRun.findUnique({ where: { runDate } });
      if (!existing || existing.status === 'success') {
        this.logger.log(`radar ${dayKey} 已有成功简报或行已消失，跳过重复采集`);
        return;
      }
      if (existing.status === 'running') {
        this.logger.log(`radar ${dayKey} 正在被另一实例采集，本实例跳过`);
        return;
      }
      // 仅 failed 可重跑；原子条件更新，两个重跑实例只有一个能拿到 count=1
      const claimed = await this.prisma.client.radarRun.updateMany({
        where: { id: existing.id, status: 'failed' },
        data: { status: 'running', error: null },
      });
      if (claimed.count === 0) {
        this.logger.log(`radar ${dayKey} 重跑已被其它实例抢占，本实例跳过`);
        return;
      }
      runId = existing.id;
    }
    const run = { id: runId };

    try {
      // 1) 采集：逐源降级（账号类采集器收到监控账号清单）
      const perSource = Math.max(20, Math.ceil(cfg.output.totalItems / Math.max(1, COLLECTOR_IDS.length)));
      const outcomes = await collectAll(cfg.sources, keywords, perSource, cfg.monitoredAccounts);
      const sourceStats: Record<string, { count: number; error?: string; deduped?: number }> = {};
      const collected = outcomes.flatMap((o) => o.items);

      // 1.5) 盯号跨轮增量去重：查窗口内历史条目的去重键，只保留未推送过的盯号内容。
      //      热榜源不参与（热点本就每日刷新）；统计写入各账号源的 sourceStats.deduped。
      const dedupedCount = { x_account: 0, youtube_account: 0 } as Record<string, number>;
      let raw: typeof collected = collected;
      if (cfg.accountDedupeDays > 0) {
        const seen = await this.loadSeenAccountKeys(cfg.accountDedupeDays);
        const before = raw.length;
        raw = filterSeenAccounts(raw, seen, cfg.accountDedupeDays);
        // 按来源统计被过滤的盯号条数（由去重前后差 + 逐源重算得到，避免误伤热榜）
        const afterBySource = new Map<string, number>();
        for (const it of raw) afterBySource.set(it.sourceName, (afterBySource.get(it.sourceName) ?? 0) + 1);
        for (const o of outcomes) {
          if (o.source === 'x_account' || o.source === 'youtube_account') {
            dedupedCount[o.source] = o.items.length - (afterBySource.get(o.source) ?? 0);
          }
        }
        this.logger.log(`盯号增量去重：窗口 ${cfg.accountDedupeDays} 天，历史键 ${seen.size} 个，过滤 ${before - raw.length} 条`);
      }
      for (const o of outcomes) {
        const afterCount = raw.filter((it) => it.sourceName === o.source).length;
        sourceStats[o.source] = {
          count: afterCount,
          ...(o.error ? { error: o.error } : {}),
          ...(dedupedCount[o.source] ? { deduped: dedupedCount[o.source] } : {}),
        };
      }

      // 2) 打分 + 去重（相关度为主，热度为辅）
      const maxHeat = Math.max(1, ...raw.map((r) => Number(r.heat) || 0));
      const nicheNames = cfg.niches.filter((n) => n.enabled);
      const scored: ScoredCandidate[] = raw.map((r) => {
        const niche = nicheNames.find((n) => n.keywords.some((k) => r.title.toLowerCase().includes(k.toLowerCase())));
        // 盯号内容是用户主动指定的账号，给 0.5 基础相关度，避免全部沉底；命中赛道关键词仍按原逻辑加分。
        const isAccountSource = r.sourceName === 'x_account' || r.sourceName === 'youtube_account';
        const rawRelevance = relevanceOf(r.title, niche?.keywords ?? keywords);
        const relevance = isAccountSource ? Math.max(0.5, rawRelevance) : rawRelevance;
        const heat01 = normalizeHeat(r.heat, maxHeat) / 100;
        return {
          ...r,
          fingerprint: fingerprintOf(r.title),
          niche: niche?.name,
          relevance,
          score: scoreOf(relevance, heat01),
        };
      });
      const ranked = dedupeAndRank(scored, cfg.output.totalItems);
      if (!ranked.length) {
        // 重跑场景：先清空本 run 可能残留的旧条目并重置计数，避免 failed 状态却展示旧简报（数据不一致）
        await this.prisma.client.radarItem.deleteMany({ where: { runId: run.id } });
        await this.prisma.client.radarRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            error: '所有数据源均未返回条目（待环境/反爬）',
            sourceStats: sourceStats as Prisma.InputJsonValue,
            itemCount: 0,
            featuredCount: 0,
          },
        });
        return;
      }

      // 3) 出标题：优先 LLM，未配置则用模板兜底（不失败）
      const titlesPerItem = cfg.output.titlesPerItem;
      const featuredCount = cfg.output.featuredItems;
      const allTitles = await this.generateTitles(ranked, cfg, titlesPerItem);

      // 4) 落库：先清旧条目（重跑场景），再写新条目
      await this.prisma.client.radarItem.deleteMany({ where: { runId: run.id } });
      for (let i = 0; i < ranked.length; i += 1) {
        const item = ranked[i] as ScoredCandidate;
        await this.prisma.client.radarItem.create({
          data: {
            runId: run.id,
            fingerprint: item.fingerprint,
            title: item.title.slice(0, 2000),
            angle: `${item.sourceName === 'x_account' || item.sourceName === 'youtube_account' ? '监控账号' : '赛道'}：${item.niche ?? '综合'}；相关度 ${(item.relevance * 100).toFixed(0)}%`,
            sourceUrl: item.url ?? null,
            sourceName: item.sourceName,
            sourceType: item.sourceType,
            niche: item.niche ?? null,
            heat: item.heat ?? null,
            relevance: item.relevance,
            score: item.score,
            tier: i < featuredCount ? 'featured' : 'candidate',
            titles: (allTitles[i] ?? []) as unknown as Prisma.InputJsonValue,
            rank: i + 1,
          },
        });
      }

      await this.prisma.client.radarRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          itemCount: ranked.length,
          featuredCount: Math.min(featuredCount, ranked.length),
          sourceStats: sourceStats as Prisma.InputJsonValue,
          error: null,
        },
      });
      this.logger.log(`radar ${dayKey} 完成：${ranked.length} 条（主推 ${Math.min(featuredCount, ranked.length)}）`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.prisma.client.radarRun.update({
        where: { id: run.id },
        data: { status: 'failed', error: msg.slice(0, 1000) },
      });
      throw error;
    }
  }

  // ---------- 简报查询 ----------

  async listBriefs(take = 30): Promise<RadarBriefSummary[]> {
    const rows = await this.prisma.client.radarRun.findMany({
      orderBy: { runDate: 'desc' },
      take: Math.max(1, Math.min(100, take)),
    });
    return rows.map((r) => this.toSummary(r));
  }

  async getBrief(idOrDate: string): Promise<RadarBriefDetail> {
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(idOrDate);
    const run = await this.prisma.client.radarRun.findFirst({
      where: isDate
        ? { runDate: new Date(`${idOrDate}T00:00:00.000Z`) }
        : { OR: [{ id: idOrDate }, { taskId: idOrDate }] },
      // rank 全局递增且 featured 在前；只按 rank 排序即可，避免 tier 字符串序（candidate<featured）把主推排到后面
      include: { items: { orderBy: [{ rank: 'asc' }] } },
    });
    if (!run) throw new NotFoundException(`雷达简报不存在：${idOrDate}`);
    return {
      ...this.toSummary(run),
      sourceStats: (run.sourceStats as Record<string, unknown>) ?? {},
      items: run.items.map((i) => ({
        id: i.id,
        title: i.title,
        angle: i.angle,
        sourceUrl: i.sourceUrl,
        sourceName: i.sourceName,
        niche: i.niche,
        score: i.score,
        relevance: i.relevance,
        tier: i.tier,
        rank: i.rank,
        titles: (i.titles as unknown as RadarTitle[]) ?? [],
        convertedTopicId: i.convertedTopicId,
      })),
    };
  }

  /** 一键转选题：RadarItem → Topic(sourceType=radar) + TitleCandidate[]，并回写关联 id。 */
  async convertToTopic(itemId: string, userId?: string): Promise<{ topicId: string }> {
    const item = await this.prisma.client.radarItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`雷达条目不存在：${itemId}`);
    if (item.convertedTopicId) return { topicId: item.convertedTopicId };

    const titles = (item.titles as unknown as RadarTitle[]) ?? [];
    // 事务保证原子性：中途 titleCandidate 建失败不留孤儿 Topic；
    // 回写用条件 update（convertedTopicId:null）做乐观抢占，抢不到则回滚，避免并发重复转出。
    const topicId = await this.prisma.client.$transaction(async (tx) => {
      const claimed = await tx.radarItem.updateMany({
        where: { id: itemId, convertedTopicId: null },
        data: { convertedTopicId: '__pending__' },
      });
      if (claimed.count === 0) {
        // 已被其它请求转出：返回已存在的 id（如果可见），否则视为重复请求
        const latest = await tx.radarItem.findUnique({ where: { id: itemId } });
        if (latest?.convertedTopicId && latest.convertedTopicId !== '__pending__') return latest.convertedTopicId;
        throw new Error('该条目正在被转换为选题，请稍后重试');
      }
      const topic = await tx.topic.create({
        data: {
          title: item.title.slice(0, 2000),
          angle: item.angle,
          tags: [item.niche ?? '选题雷达', item.sourceName] as unknown as Prisma.InputJsonValue,
          sourceType: 'radar',
          status: 'draft',
        },
      });
      for (const t of titles.slice(0, 5)) {
        if (!t.text) continue;
        await tx.titleCandidate.create({
          data: {
            topicId: topic.id,
            text: t.text,
            basis: t.basis ?? null,
            score: t.score ?? null,
            tags: [] as unknown as Prisma.InputJsonValue,
            selected: false,
            status: 'draft',
          },
        });
      }
      await tx.radarItem.update({
        where: { id: itemId },
        data: { convertedTopicId: topic.id },
      });
      return topic.id;
    });
    this.logger.log(`雷达条目 ${itemId} 已转选题 ${topicId}（用户 ${userId ?? 'system'}）`);
    return { topicId };
  }

  // ---------- 内部 ----------

  /**
   * 查窗口内已落库的盯号条目，构建去重键集合。
   * 用 RadarItem.sourceUrl（视频/推文永久链接）优先、fingerprint 回退；
   * 待 PG 环境时如实返回空集合（不去重、不伪造）。
   */
  private async loadSeenAccountKeys(windowDays: number): Promise<Set<string>> {
    const seen = new Set<string>();
    if (!this.prisma.isConnected || windowDays <= 0) return seen;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    try {
      const rows = await this.prisma.client.radarItem.findMany({
        where: {
          sourceName: { in: ['x_account', 'youtube_account'] },
          createdAt: { gte: since },
        },
        select: { sourceUrl: true, title: true },
      });
      for (const r of rows) {
        // 与采集侧用同一函数、同一入参（原始标题），保证无 URL 时的指纹回退键一致
        seen.add(accountDedupeKey(r.sourceUrl ?? undefined, r.title));
      }
    } catch (error: unknown) {
      // 历史查询失败不阻断本轮采集：退化为不去重，如实告警
      this.logger.warn(`盯号去重历史读取失败，本轮跳过增量去重：${(error as Error).message.split('\n')[0]}`);
      return new Set();
    }
    return seen;
  }

  private async generateTitles(items: ScoredCandidate[], cfg: RadarConfig, count: number): Promise<RadarTitle[][]> {
    if (!items.length) return [];
    let llmAvailable = false;
    let resolved: Awaited<ReturnType<LlmProviderService['resolve']>> | null = null;
    try {
      resolved = await this.llm.resolve();
      llmAvailable = true;
    } catch {
      llmAvailable = false; // 未配置供应商：模板兜底，不失败
    }

    const batchSize = 8;
    const out: RadarTitle[][] = [];
    for (let start = 0; start < items.length; start += batchSize) {
      const batch = items.slice(start, start + batchSize);
      if (llmAvailable && resolved) {
        try {
          const prompt = [
            '你是自媒体选题编辑。请为下列热点条目各生成 3 个可直接发布的中文标题。',
            '要求：口语化、有信息增量、不夸大不造假；每条 15-30 字。',
            '严格只输出 JSON：{"titles":[{"text":"标题","basis":"角度说明"}]}，数组顺序与输入一致。',
            '',
            batch.map((x, i) => `${i + 1}. ${x.title}（赛道：${x.niche ?? '综合'}）`).join('\n'),
          ].join('\n');
          const result = await resolved.provider.chat(
            [{ role: 'user', content: prompt }],
            { model: resolved.model, temperature: 0.8, maxTokens: 2000 },
          );
          const parsed = parseRadarTitles(result.text, '', batch.length * count);
          // prompt 要求按输入顺序、每项 count 个连续输出 → 按 count 连续分块；
          // 数量不足/不均时逐项补模板，绝不用取模分组（会把标题错配到别的选题）
          if (parsed.length >= batch.length) {
            batch.forEach((item, i) => {
              const picked = parsed.slice(i * count, (i + 1) * count);
              const filled = picked.length >= count
                ? picked
                : [...picked, ...fallbackTitles(item.title, item.niche, count - picked.length)];
              out.push(filled.slice(0, count));
            });
            continue;
          }
        } catch (error: unknown) {
          this.logger.warn(`雷达标题 LLM 调用失败，本批改用模板：${(error as Error).message.split('\n')[0]}`);
        }
      }
      for (const item of batch) out.push(fallbackTitles(item.title, item.niche, count));
    }
    return out.slice(0, items.length);
  }

  private toSummary(r: {
    id: string;
    runDate: Date;
    status: string;
    itemCount: number;
    featuredCount: number;
    error: string | null;
    createdAt: Date;
  }): RadarBriefSummary {
    return {
      id: r.id,
      runDate: r.runDate.toISOString().slice(0, 10),
      status: r.status,
      itemCount: r.itemCount,
      featuredCount: r.featuredCount,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private utcDayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
