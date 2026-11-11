import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, TaskType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { TaskHandlerRegistry } from '../../tasks/worker/task-handler.registry';
import { LlmProviderService } from '../../generation/llm-provider.service';
import {
  clampCount,
  parseTitleCandidates,
  parseTopics,
  renderTitleGenMessages,
  renderTopicGenMessages,
  summarizeStrategy,
} from './topic-title.prompt';

interface TopicGenPayload {
  strategyId?: string | null;
  analysisId?: string | null;
  count?: number;
  model?: string;
  createdById?: string | null;
}

interface TitleGenPayload {
  topicId: string;
  count?: number;
  model?: string;
  createdById?: string | null;
}

/**
 * 选题/标题生成服务（T3.1）。
 * - generateTopics：建 TOPIC_GEN 任务并入队（Redis 不可用则 dispatched=false，待环境）。
 * - generateTitles：建 TITLE_GEN 任务并入队。
 * - runTopicGen：Worker 处理器——取策略/分析上下文 → 调 LlmProvider → 写 Topic[]（sourceType=ai_gen）。
 * - runTitleGen：Worker 处理器——取选题与策略上下文 → 调 LlmProvider → 写 TitleCandidate[]。
 * 处理器在 onModuleInit 注册到 TaskHandlerRegistry（深入设计 §4.3）。
 * 全部走 Prisma 参数绑定；密钥仅经 LlmProviderService 内存解密，绝不写日志。
 */
@Injectable()
export class TopicTitleGenerateService implements OnModuleInit {
  private readonly logger = new Logger(TopicTitleGenerateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly handlers: TaskHandlerRegistry,
    private readonly llm: LlmProviderService,
  ) {}

  onModuleInit(): void {
    this.handlers.register(TaskType.TOPIC_GEN, (p) => this.runTopicGen(p as TopicGenPayload));
    this.handlers.register(TaskType.TITLE_GEN, (p) => this.runTitleGen(p as TitleGenPayload));
    this.logger.log('已注册任务处理器：TOPIC_GEN（选题生成）、TITLE_GEN（标题生成）');
  }

  async generateTopics(
    input: { strategyId?: string; analysisId?: string; count?: number },
    userId?: string,
  ): Promise<{ taskId: string; dispatched: boolean }> {
    const count = clampCount(input.count, 5);
    const { task, dispatched } = await this.tasks.create(
      {
        taskType: TaskType.TOPIC_GEN,
        objectType: input.strategyId ? 'account_strategy' : input.analysisId ? 'analysis' : 'topic_gen',
        objectId: input.strategyId ?? input.analysisId ?? 'topic_gen',
        payload: {
          strategyId: input.strategyId ?? null,
          analysisId: input.analysisId ?? null,
          count,
          createdById: userId ?? null,
        } as Record<string, unknown>,
      },
      userId,
    );
    return { taskId: task.id, dispatched };
  }

  async generateTitles(
    input: { topicId: string; count?: number },
    userId?: string,
  ): Promise<{ taskId: string; dispatched: boolean }> {
    const count = clampCount(input.count, 8);
    const { task, dispatched } = await this.tasks.create(
      {
        taskType: TaskType.TITLE_GEN,
        objectType: 'topic',
        objectId: input.topicId,
        payload: {
          topicId: input.topicId,
          count,
          createdById: userId ?? null,
        } as Record<string, unknown>,
      },
      userId,
    );
    return { taskId: task.id, dispatched };
  }

  // ---------- Worker 处理器 ----------

  async runTopicGen(payload: TopicGenPayload): Promise<void> {
    const strategyId = payload?.strategyId ?? null;
    const analysisId = payload?.analysisId ?? null;
    const count = clampCount(payload?.count, 5);

    const [strategySummary, analysisSummary] = await Promise.all([
      this.buildStrategySummary(strategyId),
      this.buildAnalysisSummary(analysisId),
    ]);

    const pt = await this.prisma.client.promptTemplate.findFirst({
      where: { taskType: 'topic_gen', platform: 'wechat', enabled: true },
      orderBy: { version: 'desc' },
    });
    const resolved = await this.llm.resolve(payload?.model);
    const messages = renderTopicGenMessages(
      { strategySummary, analysisSummary, count },
      pt?.content,
    );
    const result = await resolved.provider.chat(messages, {
      model: resolved.model,
      temperature: 0.7,
      maxTokens: 2500,
    });
    const { topics } = parseTopics(result.text);
    if (!topics.length) {
      this.logger.warn('TOPIC_GEN 未解析到有效选题，已跳过写入（原文见任务日志）');
      return;
    }
    for (const t of topics) {
      await this.prisma.client.topic.create({
        data: {
          strategyId: strategyId ?? null,
          analysisId: analysisId ?? null,
          title: t.title,
          audience: t.audience ?? null,
          angle: t.angle ?? null,
          status: 'draft',
          tags: (t.tags ?? []) as Prisma.InputJsonValue,
          sourceType: 'ai_gen',
        },
      });
    }
    this.logger.log(`TOPIC_GEN 完成：产出 ${topics.length} 个选题`);
  }

  async runTitleGen(payload: TitleGenPayload): Promise<void> {
    const topicId = payload?.topicId;
    if (!topicId) throw new Error('TITLE_GEN 缺少 topicId');
    const count = clampCount(payload?.count, 8);
    const topic = await this.prisma.client.topic.findUnique({ where: { id: topicId } });
    if (!topic) throw new NotFoundException(`选题不存在：${topicId}`);

    const strategySummary = await this.buildStrategySummary(topic.strategyId);
    const pt = await this.prisma.client.promptTemplate.findFirst({
      where: { taskType: 'title_gen', platform: 'wechat', enabled: true },
      orderBy: { version: 'desc' },
    });
    const resolved = await this.llm.resolve(payload?.model);
    const messages = renderTitleGenMessages(
      {
        topicTitle: topic.title,
        topicAngle: topic.angle ?? undefined,
        strategySummary,
        count,
      },
      pt?.content,
    );
    const result = await resolved.provider.chat(messages, {
      model: resolved.model,
      temperature: 0.8,
      maxTokens: 2500,
    });
    const { titles } = parseTitleCandidates(result.text);
    if (!titles.length) {
      this.logger.warn('TITLE_GEN 未解析到有效标题，已跳过写入（原文见任务日志）');
      return;
    }
    for (const t of titles) {
      await this.prisma.client.titleCandidate.create({
        data: {
          topicId,
          text: t.text,
          basis: t.basis ?? null,
          score: t.score ?? null,
          tags: (t.tags ?? []) as Prisma.InputJsonValue,
          selected: false,
          status: 'draft',
        },
      });
    }
    this.logger.log(`TITLE_GEN 完成：topic=${topicId} 产出 ${titles.length} 个标题`);
  }

  // ---------- 上下文构造 ----------

  private async buildStrategySummary(strategyId?: string | null): Promise<string> {
    if (!strategyId) return '';
    const s = await this.prisma.client.accountStrategy.findUnique({ where: { id: strategyId } });
    return s ? summarizeStrategy(s) : '';
  }

  private async buildAnalysisSummary(analysisId?: string | null): Promise<string> {
    if (!analysisId) return '';
    const a = await this.prisma.client.analysis.findUnique({ where: { id: analysisId } });
    if (!a) return '';
    return typeof a.structured === 'object' && a.structured !== null
      ? JSON.stringify(a.structured)
      : '';
  }
}
