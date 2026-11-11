import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma, TaskType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { TaskHandlerRegistry } from '../tasks/worker/task-handler.registry';
import { LlmProviderService } from '../generation/llm-provider.service';
import {
  parseAnalysisJson,
  renderAnalysisMessages,
  parseStrategyDraftJson,
  renderAccountSummaryMessages,
  type StrategyDraft,
  type AccountAnalysisInput,
} from './analysis.prompt';

interface DecomposePayload {
  materialId: string;
  createdById?: string | null;
  model?: string;
}

interface AccountSummaryPayload {
  ownedAccountId: string;
  analysisIds: string[];
  createdById?: string | null;
  model?: string;
}

/**
 * 单篇拆解服务（T2.3）。
 * - decompose：建 ANALYSIS_SINGLE 任务并入队（Redis 不可用则 dispatched=false，保留 queued 待环境）。
 * - runSingle：Worker 处理器——取素材 → 调 LlmProvider → 写 AnalysisRun + Analysis(kind=single)。
 * - 处理器在 onModuleInit 注册到 TaskHandlerRegistry，对应深入设计 §4.3。
 * - 全部走 Prisma 参数绑定；密钥仅经 LlmProviderService 内存解密，绝不写日志。
 */
@Injectable()
export class AnalysisService implements OnModuleInit {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly handlers: TaskHandlerRegistry,
    private readonly llm: LlmProviderService,
  ) {}

  onModuleInit(): void {
    this.handlers.register(TaskType.ANALYSIS_SINGLE, (p) =>
      this.runSingle(p as DecomposePayload),
    );
    this.handlers.register(TaskType.ANALYSIS_ACCOUNT_SUMMARY, (p) =>
      this.runAccountSummary(p as AccountSummaryPayload),
    );
    this.logger.log('已注册任务处理器：ANALYSIS_SINGLE（单篇拆解）、ANALYSIS_ACCOUNT_SUMMARY（账号级汇总）');
  }

  /** 触发单篇拆解：建 Task 并入队（Redis 不可用则 dispatched=false，待环境）。 */
  async decompose(materialId: string, userId?: string) {
    const material = await this.prisma.client.sourceMaterial.findUnique({
      where: { id: materialId },
    });
    if (!material) throw new NotFoundException(`素材不存在：${materialId}`);
    const { task, dispatched } = await this.tasks.create(
      {
        taskType: TaskType.ANALYSIS_SINGLE,
        objectType: 'source_material',
        objectId: materialId,
        payload: { materialId, createdById: userId ?? null } as Record<string, unknown>,
      },
      userId,
    );
    return { taskId: task.id, dispatched };
  }

  /** 触发账号级汇总：聚合选中拆解 → 建 ANALYSIS_ACCOUNT_SUMMARY 任务并入队（Redis 不可用则 dispatched=false，待环境）。 */
  async summary(ownedAccountId: string, analysisIds: string[], userId?: string) {
    if (!ownedAccountId) throw new BadRequestException('缺少 ownedAccountId');
    if (!Array.isArray(analysisIds) || analysisIds.length === 0) {
      throw new BadRequestException('analysisIds 不能为空');
    }
    const where: Prisma.OwnedAccountWhereInput = { id: ownedAccountId };
    if (userId) where.userId = userId; // 限定为当前用户的自有账号
    const acc = await this.prisma.client.ownedAccount.findFirst({ where });
    if (!acc) throw new NotFoundException('自有账号不存在或不属于当前用户');

    const { task, dispatched } = await this.tasks.create(
      {
        taskType: TaskType.ANALYSIS_ACCOUNT_SUMMARY,
        objectType: 'owned_account',
        objectId: ownedAccountId,
        payload: {
          ownedAccountId,
          analysisIds,
          createdById: userId ?? null,
        } as Record<string, unknown>,
      },
      userId,
    );
    return { taskId: task.id, dispatched };
  }

  /**
   * ANALYSIS_ACCOUNT_SUMMARY 处理器：聚合选中拆解 → 调 LlmProvider → 规范化为策略草稿
   * → 写 AccountStrategy（草稿版，version=最大+1）→ 写 AnalysisRun(type=account_summary)。
   */
  async runAccountSummary(payload: AccountSummaryPayload): Promise<void> {
    const ownedAccountId = payload?.ownedAccountId;
    const analysisIds: string[] = Array.isArray(payload?.analysisIds) ? payload.analysisIds : [];
    if (!ownedAccountId) throw new Error('ANALYSIS_ACCOUNT_SUMMARY 缺少 ownedAccountId');
    if (analysisIds.length === 0) throw new Error('ANALYSIS_ACCOUNT_SUMMARY 缺少 analysisIds');

    const owned = await this.prisma.client.ownedAccount.findUnique({ where: { id: ownedAccountId } });
    if (!owned) throw new Error(`自有账号不存在：${ownedAccountId}`);

    // 取选中拆解（含素材标题），拼装聚合输入
    const analyses = await this.prisma.client.analysis.findMany({
      where: { id: { in: analysisIds } },
      include: { material: { select: { title: true } } },
    });
    const inputs: AccountAnalysisInput[] = analyses.map((a) => ({
      title: (a.material as { title?: string } | null)?.title ?? '(未知素材)',
      summary: JSON.stringify(a.structured ?? {}),
    }));

    // 取 account_summary 启用模板（最新版本）
    let template: string | undefined;
    let templateVersionId: string | undefined;
    const pt = await this.prisma.client.promptTemplate.findFirst({
      where: { taskType: 'account_summary', platform: 'wechat', enabled: true },
      orderBy: { version: 'desc' },
    });
    if (pt) {
      template = pt.content;
      templateVersionId = pt.id;
    }

    const resolved = await this.llm.resolve(payload.model);
    const messages = renderAccountSummaryMessages(owned.name, inputs, template);
    const result = await resolved.provider.chat(messages, {
      model: resolved.model,
      temperature: 0.5,
      maxTokens: 3000,
    });

    const parsed = parseStrategyDraftJson(result.text);
    // 兜底：解析失败时把原始文本写入 structure，仍产出草稿（不丢模型输出，可由人工整理）
    const draft: StrategyDraft =
      parsed.draft ??
      ({
        position: {},
        audience: {},
        pillars: [],
        titlePref: {},
        structure: parsed.rawText ?? '',
        tone: {},
        boundaries: [],
      } as StrategyDraft);

    // 计算该账号下一个策略版本号（复用 T1.7 的「最大版本+1」约定）
    const existing = await this.prisma.client.accountStrategy.findMany({
      where: { ownedAccountId },
      select: { version: true },
    });
    const version = existing.reduce((m, e) => Math.max(m, e.version), 0) + 1;

    const strategy = await this.prisma.client.accountStrategy.create({
      data: {
        ownedAccountId,
        version,
        status: 'draft',
        isDefault: false,
        position: draft.position as Prisma.InputJsonValue,
        audience: draft.audience as Prisma.InputJsonValue,
        pillars: draft.pillars as Prisma.InputJsonValue,
        titlePref: draft.titlePref as Prisma.InputJsonValue,
        structure: draft.structure as Prisma.InputJsonValue,
        tone: draft.tone as Prisma.InputJsonValue,
        boundaries: draft.boundaries as Prisma.InputJsonValue,
        sourceAnalysisIds: analysisIds as Prisma.InputJsonValue,
      },
    });

    await this.prisma.client.analysisRun.create({
      data: {
        type: 'account_summary',
        status: 'success',
        scope: { ownedAccountId, analysisIds } as unknown as Prisma.InputJsonValue,
        promptTemplateVersionId: templateVersionId ?? null,
        model: resolved.model,
        output: {
          strategyId: strategy.id,
          version,
          draft,
          rawText: result.text,
        } as unknown as Prisma.InputJsonValue,
        createdById: payload.createdById ?? null,
      },
    });
    this.logger.log(
      `账号级汇总完成：ownedAccount=${ownedAccountId} strategy=${strategy.id} version=${version}`,
    );
  }

  /** ANALYSIS_SINGLE 处理器：调用 LlmProvider，写 AnalysisRun + Analysis(kind=single)。 */
  async runSingle(payload: DecomposePayload): Promise<void> {
    const materialId = payload?.materialId;
    if (!materialId) throw new Error('ANALYSIS_SINGLE 缺少 materialId');
    const material = await this.prisma.client.sourceMaterial.findUnique({
      where: { id: materialId },
    });
    if (!material) throw new Error(`素材不存在：${materialId}`);

    // 取 single_analysis 启用模板（最新版本）
    let template: string | undefined;
    let templateVersionId: string | undefined;
    const pt = await this.prisma.client.promptTemplate.findFirst({
      where: { taskType: 'single_analysis', platform: 'wechat', enabled: true },
      orderBy: { version: 'desc' },
    });
    if (pt) {
      template = pt.content;
      templateVersionId = pt.id;
    }

    const resolved = await this.llm.resolve(payload.model); // 无供应商→抛清晰错误
    const messages = renderAnalysisMessages(
      { title: material.title, body: material.body },
      template,
    );
    const result = await resolved.provider.chat(messages, {
      model: resolved.model,
      temperature: 0.4,
      maxTokens: 2000,
    });
    const structured = parseAnalysisJson(result.text);
    const output = { structured, usage: result.usage ?? null };

    const run = await this.prisma.client.analysisRun.create({
      data: {
        type: 'single',
        status: 'success',
        scope: { materialId } as unknown as Prisma.InputJsonValue,
        promptTemplateVersionId: templateVersionId ?? null,
        model: resolved.model,
        output: output as unknown as Prisma.InputJsonValue,
        createdById: payload.createdById ?? null,
      },
    });
    await this.prisma.client.analysis.create({
      data: {
        runId: run.id,
        materialId,
        accountId: material.referenceAccountId,
        kind: 'single',
        structured: structured as unknown as Prisma.InputJsonValue,
        version: 1,
      },
    });
    this.logger.log(`单篇拆解完成：material=${materialId} run=${run.id}`);
  }

  /** 拆解任务列表（AnalysisRun, type=single），含其 Analysis 列表。 */
  async listRuns() {
    return this.prisma.client.analysisRun.findMany({
      where: { type: 'single' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { analyses: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /** 账号级汇总任务列表（AnalysisRun, type=account_summary），含 output（strategyId/草稿）。 */
  async listAccountRuns() {
    return this.prisma.client.analysisRun.findMany({
      where: { type: 'account_summary' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getRun(id: string) {
    const run = await this.prisma.client.analysisRun.findUnique({
      where: { id },
      include: { analyses: { orderBy: { createdAt: 'asc' } } },
    });
    if (!run) throw new NotFoundException(`分析任务不存在：${id}`);
    return run;
  }

  /** 某素材的全部拆解结果。 */
  async listByMaterial(materialId: string) {
    return this.prisma.client.analysis.findMany({
      where: { materialId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAnalysis(id: string) {
    const a = await this.prisma.client.analysis.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`分析结果不存在：${id}`);
    return a;
  }
}
