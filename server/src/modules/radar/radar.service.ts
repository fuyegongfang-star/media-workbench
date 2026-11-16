import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TaskType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SITE_CONFIG_ID } from '../system/system.service';
import { TasksService } from '../tasks/tasks.service';
import { LlmProviderService } from '../generation/llm-provider.service';
import { collectAll } from './collectors';
import {
  DEFAULT_RADAR_CONFIG,
  type RadarConfig,
  type RadarTitle,
  type ScoredCandidate,
} from './radar.contract';
import {
  dedupeAndRank,
  fallbackTitles,
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

    // runDate 唯一：同日重复触发直接复用已有运行，避免任务堆积把简报刷掉（幂等）。
    const existing = await this.prisma.client.radarRun.findUnique({ where: { runDate } });
    if (existing && existing.status === 'success') {
      this.logger.log(`radar ${dayKey} 已有成功简报，跳过重复采集`);
      return;
    }

    const run =
      existing ??
      (await this.prisma.client.radarRun.create({
        data: { runDate, status: 'running', taskId: typeof p.taskId === 'string' ? p.taskId : null },
      }));
    if (existing) {
      await this.prisma.client.radarRun.update({ where: { id: existing.id }, data: { status: 'running', error: null } });
    }

    try {
      // 1) 采集：逐源降级
      const perSource = Math.max(20, Math.ceil(cfg.output.totalItems / Math.max(1, COLLECTOR_COUNT)));
      const outcomes = await collectAll(cfg.sources, keywords, perSource);
      const sourceStats: Record<string, { count: number; error?: string }> = {};
      const raw = outcomes.flatMap((o) => {
        sourceStats[o.source] = { count: o.items.length, ...(o.error ? { error: o.error } : {}) };
        return o.items;
      });

      // 2) 打分 + 去重（相关度为主，热度为辅）
      const maxHeat = Math.max(1, ...raw.map((r) => Number(r.heat) || 0));
      const nicheNames = cfg.niches.filter((n) => n.enabled);
      const scored: ScoredCandidate[] = raw.map((r) => {
        const niche = nicheNames.find((n) => n.keywords.some((k) => r.title.toLowerCase().includes(k.toLowerCase())));
        const relevance = relevanceOf(r.title, niche?.keywords ?? keywords);
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
        await this.prisma.client.radarRun.update({
          where: { id: run.id },
          data: { status: 'failed', error: '所有数据源均未返回条目（待环境/反爬）', sourceStats: sourceStats as Prisma.InputJsonValue },
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
            angle: `赛道：${item.niche ?? '综合'}；相关度 ${(item.relevance * 100).toFixed(0)}%`,
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
      include: { items: { orderBy: [{ tier: 'asc' }, { rank: 'asc' }] } },
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
    const topic = await this.prisma.client.topic.create({
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
      await this.prisma.client.titleCandidate.create({
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
    await this.prisma.client.radarItem.update({
      where: { id: itemId },
      data: { convertedTopicId: topic.id },
    });
    this.logger.log(`雷达条目 ${itemId} 已转选题 ${topic.id}（用户 ${userId ?? 'system'}）`);
    return { topicId: topic.id };
  }

  // ---------- 内部 ----------

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
          if (parsed.length >= batch.length) {
            // 按输入顺序均分：解析结果数量可能不等于 batch*count，用索引取模兜底
            batch.forEach((_, i) => {
              const picked = parsed.filter((__, j) => j % batch.length === i).slice(0, count);
              out.push(picked.length ? picked : fallbackTitles(batch[i]?.title ?? '', batch[i]?.niche, count));
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

/** 采集源数量（用于估算每源采集上限，常量避免硬编码漂移）。 */
const COLLECTOR_COUNT = 4;
