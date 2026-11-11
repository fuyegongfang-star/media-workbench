import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma, TaskStatus, TaskType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { TaskHandlerRegistry } from '../../tasks/worker/task-handler.registry';
import { DetectPolishProviderService } from '../../generation/detect-polish-provider.service';
import { isStaleReview, validateDecision } from './text-review.util';
import type { DetectProvider } from '../../generation/provider.contract';

interface DetectPayload {
  projectId: string;
  versionId: string;
  service?: string | null;
  model?: string | null;
  createdById?: string | null;
}

export interface TextReviewListItem {
  id: string;
  projectId: string;
  versionId: string;
  service: string;
  summary: string | null;
  detectedAt: string | null;
  status: string;
  userDecision: string | null;
  serviceVersion: string | null;
  /** 文章后续修改后，旧结果自动标「旧版本结果」。 */
  stale: boolean;
}

/**
 * T3.7 朱雀/LLM 文本检测服务。
 * - detect：入队 TEXT_DETECT 任务（绑定被检测版本），实际检测由 Worker 处理器完成。
 * - runDetect（Worker 处理器）：调用检测 Provider → 写 TextReviewRun（绑定 versionId，不改文）。
 * - 失败兜底：检测服务不可用时写 status=failed 的 TextReviewRun，前端显示「服务不可用，已跳过」（深入设计 §3.1）。
 * 全部走 Prisma 参数绑定；密钥仅经 Provider 层内存解密，绝不写日志。
 */
@Injectable()
export class TextReviewService implements OnModuleInit {
  private readonly logger = new Logger(TextReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly handlers: TaskHandlerRegistry,
    private readonly detectPolish: DetectPolishProviderService,
  ) {}

  onModuleInit(): void {
    this.handlers.register(TaskType.TEXT_DETECT, (p) => this.runDetect(p as DetectPayload));
    this.logger.log('已注册任务处理器：TEXT_DETECT（朱雀/LLM 文本检测，绑定版本不改文）');
  }

  /** 触发对某版本的检测（入队，不改文）。 */
  async detect(
    projectId: string,
    versionId: string,
    opts: { service?: string; model?: string } = {},
    userId?: string,
  ): Promise<{ taskId: string; dispatched: boolean }> {
    await this.ensureVersionBelongs(projectId, versionId);
    const { task, dispatched } = await this.tasks.create(
      {
        taskType: TaskType.TEXT_DETECT,
        objectType: 'content_version',
        objectId: versionId,
        payload: {
          projectId,
          versionId,
          service: opts.service ?? null,
          model: opts.model ?? null,
          createdById: userId ?? null,
        } as Record<string, unknown>,
      },
      userId,
    );
    this.logger.log(`内容项目 ${projectId} 已提交检测任务（version=${versionId}，dispatched=${dispatched}）`);
    return { taskId: task.id, dispatched };
  }

  /** Worker 处理器：检测并写 TextReviewRun。 */
  async runDetect(payload: DetectPayload): Promise<void> {
    const projectId = payload?.projectId;
    const versionId = payload?.versionId;
    if (!projectId || !versionId) throw new Error('TEXT_DETECT 缺少 projectId/versionId');

    const version = await this.prisma.client.contentVersion.findUnique({ where: { id: versionId } });
    if (!version || version.projectId !== projectId) throw new NotFoundException(`版本不存在或不属于项目：${versionId}`);

    let resolved: { provider: DetectProvider; serviceName: string; serviceVersion?: string };
    try {
      resolved = await this.detectPolish.resolveDetect(payload?.service ?? undefined);
    } catch (e) {
      // 检测服务不可用：写 failed 记录，前端显示「服务不可用，已跳过」
      await this.writeRun({
        projectId,
        versionId,
        service: payload?.service ?? 'unavailable',
        rawResponse: { error: (e as Error).message },
        summary: `检测服务不可用：${(e as Error).message}`,
        serviceVersion: null,
        status: 'failed',
      });
      throw e; // 让 Task 也标记 failed（诚实，不伪造通过）
    }

    try {
      const result = await resolved.provider.detect(version.content, versionId);
      await this.writeRun({
        projectId,
        versionId,
        service: resolved.serviceName,
        rawResponse: result.raw ?? null,
        summary: result.summary ?? null,
        serviceVersion: result.serviceVersion ?? resolved.serviceVersion ?? null,
        status: 'success',
      });
      this.logger.log(`TEXT_DETECT 完成：project=${projectId} version=${versionId} service=${resolved.serviceName}`);
    } catch (e) {
      const msg = (e as Error).message;
      await this.writeRun({
        projectId,
        versionId,
        service: resolved.serviceName,
        rawResponse: { error: msg },
        summary: `检测失败：${msg}`,
        serviceVersion: resolved.serviceVersion ?? null,
        status: 'failed',
      });
      throw e;
    }
  }

  /** 写一条 TextReviewRun（status 由调用方决定）。 */
  private async writeRun(args: {
    projectId: string;
    versionId: string;
    service: string;
    rawResponse: unknown;
    summary: string | null;
    serviceVersion: string | null;
    status: TaskStatus;
  }) {
    return this.prisma.client.textReviewRun.create({
      data: {
        projectId: args.projectId,
        versionId: args.versionId,
        service: args.service,
        rawResponse: (args.rawResponse ?? null) as Prisma.InputJsonValue,
        summary: args.summary,
        serviceVersion: args.serviceVersion,
        status: args.status,
        detectedAt: args.status === 'success' ? new Date() : null,
      },
    });
  }

  /** 列出项目的检测记录，按创建时间倒序，并标注是否「旧版本结果」。 */
  async listReviews(projectId: string): Promise<TextReviewListItem[]> {
    const project = await this.prisma.client.contentProject.findUnique({
      where: { id: projectId },
      select: { currentVersionId: true },
    });
    if (!project) throw new NotFoundException(`内容项目不存在：${projectId}`);
    const rows = await this.prisma.client.textReviewRun.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      versionId: r.versionId,
      service: r.service,
      summary: r.summary,
      detectedAt: r.detectedAt ? r.detectedAt.toISOString() : null,
      status: r.status,
      userDecision: r.userDecision,
      serviceVersion: r.serviceVersion,
      stale: isStaleReview(r.versionId, project.currentVersionId),
    }));
  }

  /** 记录用户对某条检测结果的决策（accepted / ignored / flagged）。 */
  async decide(projectId: string, runId: string, decision: unknown): Promise<TextReviewListItem> {
    const v = validateDecision(decision);
    if (!v.ok) throw new BadRequestException(v.error);
    const run = await this.prisma.client.textReviewRun.findUnique({ where: { id: runId } });
    if (!run || run.projectId !== projectId) throw new NotFoundException(`检测记录不存在或不属于项目：${runId}`);
    const updated = await this.prisma.client.textReviewRun.update({
      where: { id: runId },
      data: { userDecision: v.value },
    });
    const project = await this.prisma.client.contentProject.findUnique({
      where: { id: projectId },
      select: { currentVersionId: true },
    });
    return {
      id: updated.id,
      projectId: updated.projectId,
      versionId: updated.versionId,
      service: updated.service,
      summary: updated.summary,
      detectedAt: updated.detectedAt ? updated.detectedAt.toISOString() : null,
      status: updated.status,
      userDecision: updated.userDecision,
      serviceVersion: updated.serviceVersion,
      stale: isStaleReview(updated.versionId, project?.currentVersionId ?? null),
    };
  }

  /** 校验版本归属本项目（防越权跨项目检测）。 */
  private async ensureVersionBelongs(projectId: string, versionId: string) {
    const v = await this.prisma.client.contentVersion.findUnique({
      where: { id: versionId },
      select: { projectId: true },
    });
    if (!v || v.projectId !== projectId) throw new NotFoundException(`版本不存在或不属于该项目：${versionId}`);
  }
}
