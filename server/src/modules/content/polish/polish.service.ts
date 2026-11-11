import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { TaskHandlerRegistry } from '../../tasks/worker/task-handler.registry';
import { DetectPolishProviderService } from '../../generation/detect-polish-provider.service';
import { ContentProjectService } from '../project/content-project.service';

interface PolishPayload {
  projectId: string;
  model?: string | null;
  tone?: string | null;
  createdById?: string | null;
}

/**
 * T3.7 第三方润色服务（TEXT_POLISH）。
 * - polish：取当前生效版本/缓冲正文入队，实际润色由 Worker 处理器完成。
 * - runPolish（Worker 处理器）：调用润色 Provider → 写 ContentVersion(source=polish, staging)，**不**改 currentVersionId（深入设计 §1.2）。
 * - 原稿不变：staging 版本须经前端「采纳」才生效；润色失败如实 failed（失败兜底，创作链路不阻断）。
 * 全部走 Prisma 参数绑定；密钥仅经 Provider 层内存解密，绝不写日志。
 */
@Injectable()
export class PolishService implements OnModuleInit {
  private readonly logger = new Logger(PolishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly handlers: TaskHandlerRegistry,
    private readonly detectPolish: DetectPolishProviderService,
    private readonly contentProject: ContentProjectService,
  ) {}

  onModuleInit(): void {
    this.handlers.register(TaskType.TEXT_POLISH, (p) => this.runPolish(p as PolishPayload));
    this.logger.log('已注册任务处理器：TEXT_POLISH（第三方润色，原稿不变 + 对比/采纳/放弃）');
  }

  /** 触发生成润色（入队，原稿不变）。 */
  async polish(
    projectId: string,
    opts: { model?: string; tone?: string } = {},
    userId?: string,
  ): Promise<{ taskId: string; dispatched: boolean }> {
    await this.ensureHasContent(projectId);
    const { task, dispatched } = await this.tasks.create(
      {
        taskType: TaskType.TEXT_POLISH,
        objectType: 'content_project',
        objectId: projectId,
        payload: {
          projectId,
          model: opts.model ?? null,
          tone: opts.tone ?? null,
          createdById: userId ?? null,
        } as Record<string, unknown>,
      },
      userId,
    );
    this.logger.log(`内容项目 ${projectId} 已提交润色任务（dispatched=${dispatched}）`);
    return { taskId: task.id, dispatched };
  }

  /** Worker 处理器：润色并写 staging 版本。 */
  async runPolish(payload: PolishPayload): Promise<void> {
    const projectId = payload?.projectId;
    if (!projectId) throw new Error('TEXT_POLISH 缺少 projectId');

    const project = await this.prisma.client.contentProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`内容项目不存在：${projectId}`);

    const text = await this.currentText(project);
    if (!text.trim()) throw new Error('无可润色的正文（请先保存至少一个版本）');

    const resolved = await this.detectPolish.resolvePolish(payload?.model ?? undefined);
    const result = await resolved.provider.polish(text, { tone: payload?.tone ?? undefined });
    if (!result.revised.trim()) throw new Error('TEXT_POLISH 润色结果为空（模型未返回正文）');

    const note = `AI 润色${payload?.tone ? `（${payload.tone}）` : ''}`;
    await this.contentProject.createStagingVersion(
      projectId,
      { content: result.revised, source: 'polish', note },
      payload?.createdById ?? undefined,
    );
    this.logger.log(`TEXT_POLISH 完成：project=${projectId}（staging 待采纳）`);
  }

  /** 取当前生效版本正文，否则回退 workingContent。 */
  private async currentText(project: { id: string; currentVersionId: string | null; workingContent: string | null }): Promise<string> {
    if (project.currentVersionId) {
      const cv = await this.prisma.client.contentVersion.findUnique({ where: { id: project.currentVersionId } });
      return cv?.content ?? project.workingContent ?? '';
    }
    return project.workingContent ?? '';
  }

  /** 校验项目存在且有正文（防空润色）。 */
  private async ensureHasContent(projectId: string) {
    const p = await this.prisma.client.contentProject.findUnique({
      where: { id: projectId },
      select: { id: true, currentVersionId: true, workingContent: true },
    });
    if (!p) throw new NotFoundException(`内容项目不存在：${projectId}`);
  }
}
