import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ContentVersionSource, Prisma, TaskType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { TaskHandlerRegistry } from '../../tasks/worker/task-handler.registry';
import { LlmProviderService } from '../../generation/llm-provider.service';
import { nextVersionNo, versionSourceLabel } from '../project/content-project.util';
import {
  ARTICLE_EDIT_ACTIONS,
  parseArticleText,
  renderArticleDraftMessages,
  renderArticleEditMessages,
  type ArticleContext,
  type ArticleStage,
} from './article.prompt';

interface ArticleGenPayload {
  projectId: string;
  stage?: ArticleStage;
  model?: string | null;
  createdById?: string | null;
}

/**
 * 文章生成服务（T3.5）：注册 ARTICLE_GEN 处理器，落实「生成/续写/改写/压缩/扩写 → staging 版本待采纳」。
 * - 处理器（Worker 消费）：取项目继承上下文 → 解析提示词模板（draft→article_draft / 其余→article_edit）
 *    → 调 LlmProvider → 解析正文 → 写 GenerationRun（promptSnapshot 完整渲染文本，可复现）+ ContentVersion（source=stage，staging）。
 * - 不覆盖 currentVersionId：staging 版本须经前端「采纳」才生效（深入设计 §1.2）。
 * - 全部走 Prisma 参数绑定；密钥仅经 LlmProviderService 内存解密，绝不写日志。
 */
@Injectable()
export class ArticleGenerateService implements OnModuleInit {
  private readonly logger = new Logger(ArticleGenerateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly handlers: TaskHandlerRegistry,
    private readonly llm: LlmProviderService,
  ) {}

  onModuleInit(): void {
    this.handlers.register(TaskType.ARTICLE_GEN, (p) => this.runArticleGen(p as ArticleGenPayload));
    this.logger.log('已注册任务处理器：ARTICLE_GEN（文章初稿/续写/改写/压缩/扩写）');
  }

  // ---------- Worker 处理器 ----------
  async runArticleGen(payload: ArticleGenPayload): Promise<void> {
    const projectId = payload?.projectId;
    if (!projectId) throw new Error('ARTICLE_GEN 缺少 projectId');
    const stage = (payload.stage as ArticleStage) || 'draft';

    const project = await this.prisma.client.contentProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`内容项目不存在：${projectId}`);

    // 取生成前正文本：优先 currentVersion，否则 workingContent（staging 不改变 current）
    let currentContent = '';
    if (project.currentVersionId) {
      const cv = await this.prisma.client.contentVersion.findUnique({
        where: { id: project.currentVersionId },
      });
      currentContent = cv?.content ?? '';
    } else {
      currentContent = project.workingContent ?? '';
    }

    const ctx = this.buildContext(project, currentContent, stage);
    const tplTaskType = stage === 'draft' ? 'article_draft' : 'article_edit';
    const pt = await this.prisma.client.promptTemplate.findFirst({
      where: { taskType: tplTaskType, platform: project.platform, enabled: true },
      orderBy: { version: 'desc' },
    });

    const resolved = await this.llm.resolve(payload?.model ?? undefined);
    const messages =
      stage === 'draft'
        ? renderArticleDraftMessages(ctx, pt?.content)
        : renderArticleEditMessages(ctx, pt?.content);

    const startedAt = Date.now();
    // 先落一条 running 的 GenerationRun（深入设计 §3.3：promptSnapshot 存完整渲染文本 + 状态机）
    const run = await this.prisma.client.generationRun.create({
      data: {
        projectId,
        stage: stage as ContentVersionSource,
        model: resolved.model,
        promptTemplateVersionId: pt?.id ?? null,
        promptSnapshot: messages.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
        status: 'running',
        createdById: payload?.createdById ?? null,
      },
    });
    try {
      const result = await resolved.provider.chat(messages, {
        model: resolved.model,
        temperature: 0.8,
        maxTokens: 6000,
      });
      const text = parseArticleText(result.text);
      if (!text.trim()) throw new Error('ARTICLE_GEN 生成结果为空（模型未返回正文）');

      const agg = await this.prisma.client.contentVersion.aggregate({
        where: { projectId },
        _max: { versionNo: true },
      });
      const version = await this.prisma.client.contentVersion.create({
        data: {
          projectId,
          versionNo: nextVersionNo(agg._max.versionNo),
          content: text,
          source: stage as ContentVersionSource,
          note: `AI ${versionSourceLabel(stage)}`,
          createdById: payload?.createdById ?? null,
        },
      });
      await this.prisma.client.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          outputVersionId: version.id,
          durationMs: Date.now() - startedAt,
        },
      });
      this.logger.log(`ARTICLE_GEN 完成：project=${projectId} stage=${stage} version=${version.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.client.generationRun.update({
        where: { id: run.id },
        data: { status: 'failed', error: msg, durationMs: Date.now() - startedAt },
      });
      throw e; // 让 Task 也标记 failed（诚实，不伪造通过）
    }
  }

  // ---------- 上下文构造 ----------
  private buildContext(
    project: { contextSnapshot?: Prisma.JsonValue | null; platform: string },
    currentContent: string,
    stage: ArticleStage,
  ): ArticleContext {
    const snap = (project.contextSnapshot ?? {}) as Record<string, unknown>;
    const topic = (snap['topic'] ?? {}) as Record<string, unknown>;
    const title = typeof snap['title'] === 'string' ? (snap['title'] as string) : '';
    const titleBasis = typeof snap['titleBasis'] === 'string' ? (snap['titleBasis'] as string) : null;
    const strategySummary =
      typeof snap['strategySummary'] === 'string' ? (snap['strategySummary'] as string) : '';
    const analysisSummary =
      typeof snap['analysisSummary'] === 'string' ? (snap['analysisSummary'] as string) : '';
    const topicTitle = typeof topic['title'] === 'string' ? (topic['title'] as string) : '';
    const topicAudience = typeof topic['audience'] === 'string' ? (topic['audience'] as string) : null;
    const topicAngle = typeof topic['angle'] === 'string' ? (topic['angle'] as string) : null;
    const topicTags = Array.isArray(topic['tags'])
      ? (topic['tags'] as unknown[]).map(String).join('、')
      : '';
    const action = stage === 'draft' ? '' : ARTICLE_EDIT_ACTIONS[stage];
    return {
      title,
      titleBasis,
      topicTitle,
      topicAudience,
      topicAngle,
      topicTags,
      strategySummary,
      analysisSummary,
      currentContent,
      action,
    };
  }
}
