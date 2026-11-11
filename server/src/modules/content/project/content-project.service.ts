import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContentVersionSource, Prisma, TaskType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** 将 YYYY-MM-DD（本地日）解析为本地午夜 Date；非法/空返回 null（清除排期）。 */
function toDateOrNull(value?: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
import { TasksService } from '../../tasks/tasks.service';
import { ComplianceService } from '../compliance/compliance.service';
import { DICTIONARY_VERSION } from '../compliance/compliance-dictionary';
import { summarizeStrategy } from '../generation/topic-title.prompt';
import { resolvePlatform } from '../platforms';
import {
  buildContentContext,
  defaultReviewChecklist,
  nextVersionNo,
  resolveProjectTarget,
  reviewTransition,
  shapeProjectContext,
  validateReviewChecklistInput,
  type ReviewChecklistItem,
} from './content-project.util';
import {
  stampComplianceItem,
  syncComplianceChecklistItem,
} from './review-checklist.source';
import {
  buildExportFilename,
  renderExportMarkdown,
  validatePublishRecordInput,
} from './export.util';

/**
 * 内容项目服务（T3.2 起）。
 * - createFromTitle：选中标题一键建内容项目，自动继承「账号/策略/选题/标题」上下文，并快照分析摘要 + 当前 article_draft 提示词模板版本。
 * - list/get/update/remove：内容项目 CRUD；remove 经 T1.3 软删作用域转软删（ContentProject 已在 SOFT_DELETE_MODELS）。
 * 全部走 Prisma 参数绑定（防注入）；密钥仅经 LLM 适配层在生成时内存解密，绝不写日志。
 */
@Injectable()
export class ContentProjectService {
  private readonly logger = new Logger(ContentProjectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly compliance: ComplianceService,
  ) {}

  /**
   * T3.2 核心：选中标题一键建内容项目。
   * 继承链：TitleCandidate → Topic（strategyId / analysisId）→ AccountStrategy（ownedAccountId）。
   * T5.2 起 platform 可指定（默认 wechat），提示词模板按平台解析，预留多平台模板占位。
   */
  async createFromTitle(titleCandidateId: string, userId?: string, platform?: string) {
    const title = await this.prisma.client.titleCandidate.findUnique({
      where: { id: titleCandidateId },
    });
    if (!title) throw new NotFoundException(`标题候选不存在：${titleCandidateId}`);

    const topic = await this.prisma.client.topic.findUnique({ where: { id: title.topicId } });
    if (!topic) throw new NotFoundException(`选题不存在：${title.topicId}`);

    const resolvedPlatform = resolvePlatform(platform);

    let strategySummary = '';
    let analysisSummary = '';
    let strategy: { id: string; ownedAccountId: string } | null = null;
    if (topic.strategyId) {
      const s = await this.prisma.client.accountStrategy.findUnique({
        where: { id: topic.strategyId },
      });
      if (s) {
        strategy = { id: s.id, ownedAccountId: s.ownedAccountId };
        strategySummary = summarizeStrategy(s);
      }
    }

    const target = resolveProjectTarget({
      topicStrategyId: topic.strategyId,
      strategy,
    });
    if (!target.ok) {
      throw new BadRequestException(
        '该选题未绑定有效的策略/账号，无法确定归属账号（请先在选题上关联策略并完成账号绑定）',
      );
    }

    if (topic.analysisId) {
      const a = await this.prisma.client.analysis.findUnique({
        where: { id: topic.analysisId },
      });
      if (a && a.structured && typeof a.structured === 'object') {
        analysisSummary = JSON.stringify(a.structured);
      }
    }

    // 快照当前启用、对应平台的 article_draft 提示词模板版本（深入设计 §3.2 可复现）
    const pt = await this.prisma.client.promptTemplate.findFirst({
      where: { taskType: 'article_draft', platform: resolvedPlatform, enabled: true },
      orderBy: { version: 'desc' },
    });

    const context = buildContentContext({
      titleText: title.text,
      titleBasis: title.basis,
      topicTitle: topic.title,
      topicAudience: topic.audience,
      topicAngle: topic.angle,
      topicTags: topic.tags,
      strategySummary,
      analysisSummary,
    });

    const project = await this.prisma.client.contentProject.create({
      data: {
        platform: resolvedPlatform,
        ownedAccountId: target.ownedAccountId!,
        topicId: topic.id,
        selectedTitleId: title.id,
        strategyVersionId: target.strategyVersionId,
        contentType: 'article',
        status: 'PENDING_CREATION',
        contextSnapshot: context as Prisma.InputJsonValue,
        promptTemplateVersionId: pt?.id ?? null,
        createdById: userId ?? null,
      },
    });

    // 标记该标题为「选中」（互斥），与 T3.1 标题选中语义一致
    await this.prisma.client.titleCandidate.updateMany({
      where: { topicId: topic.id, id: { not: title.id } },
      data: { selected: false },
    });
    await this.prisma.client.titleCandidate.update({
      where: { id: title.id },
      data: { selected: true, status: title.status === 'rejected' ? 'draft' : title.status },
    });

    this.logger.log(`内容项目已创建：${project.id}（来源标题 ${title.id} / 选题 ${topic.id}）`);
    return project;
  }

  async list(filter: { ownedAccountId?: string; status?: string }) {
    const where: Prisma.ContentProjectWhereInput = {};
    if (filter.ownedAccountId) where.ownedAccountId = filter.ownedAccountId;
    if (filter.status) {
      where.status = filter.status as Prisma.ContentProjectWhereInput['status'];
    }
    return this.prisma.client.contentProject.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        ownedAccount: { select: { id: true, name: true } },
        topic: { select: { id: true, title: true } },
      },
    });
  }

  async get(id: string) {
    const p = await this.prisma.client.contentProject.findUnique({
      where: { id },
      include: {
        ownedAccount: { select: { id: true, name: true } },
        topic: { select: { id: true, title: true } },
        selectedTitle: { select: { id: true, text: true } },
        strategyVersion: { select: { id: true, version: true } },
      },
    });
    if (!p) throw new NotFoundException(`内容项目不存在：${id}`);
    return p;
  }

  /**
   * T3.3 创作上下文面板：返回内容项目继承的「依据」。
   * 账户/标题/选题/策略摘要/分析摘要取创建时定格的 contextSnapshot（避免源实体漂移），
   * 策略版本号与提示词模板版本号取实时关系投影（这两者在创作过程中可能被重新绑定）。
   * 纯组装，参数绑定防注入；密钥不经此路径。
   */
  async getContext(id: string) {
    const p = await this.prisma.client.contentProject.findUnique({
      where: { id },
      include: {
        ownedAccount: { select: { id: true, name: true } },
        strategyVersion: { select: { id: true, version: true } },
      },
    });
    if (!p) throw new NotFoundException(`内容项目不存在：${id}`);

    // promptTemplateVersionId 为标量 FK，无 relation 字段，按 id 单独取版本号（深入设计 §3.2 可复现）。
    let promptTemplate: { id: string; version: number } | null = null;
    if (p.promptTemplateVersionId) {
      const pt = await this.prisma.client.promptTemplate.findUnique({
        where: { id: p.promptTemplateVersionId },
        select: { id: true, version: true },
      });
      promptTemplate = pt ? { id: pt.id, version: pt.version } : null;
    }

    return shapeProjectContext({
      account: p.ownedAccount ? { id: p.ownedAccount.id, name: p.ownedAccount.name } : null,
      strategy: p.strategyVersion
        ? { id: p.strategyVersion.id, version: p.strategyVersion.version }
        : null,
      promptTemplate,
      snapshot: (p.contextSnapshot as Record<string, unknown>) ?? null,
    });
  }

  /**
   * T3.3 AI 操作入口：触发生成/续写/改写/压缩/扩写（ARTICLE_GEN 异步任务）。
   * 仅负责入队与返回 taskId；实际 LLM 调用与 ContentVersion 写出由 T3.5 注册的 ARTICLE_GEN 处理器完成。
   * 若 ARTICLE_GEN 处理器尚未注册（T3.5 待实现），Worker 会如实将任务置 failed（"未注册处理器"），不伪造通过。
   */
  async generate(
    id: string,
    stage: 'draft' | 'continue' | 'rewrite' | 'compress' | 'expand',
    model?: string,
    userId?: string,
  ): Promise<{ taskId: string; dispatched: boolean; stage: string }> {
    await this.get(id); // 404 守卫 + 继承校验
    // 生成期间加锁：已有 running 的 GenerationRun 则拒绝，避免并发覆盖 staging（深入设计 §1.4）
    const running = await this.prisma.client.generationRun.findFirst({
      where: { projectId: id, status: 'running' },
    });
    if (running) {
      throw new BadRequestException('该项目有正在进行的生成任务，请等待完成或稍后重试');
    }
    const { task, dispatched } = await this.tasks.create(
      {
        taskType: TaskType.ARTICLE_GEN,
        objectType: 'content_project',
        objectId: id,
        payload: {
          projectId: id,
          stage,
          model: model ?? null,
          createdById: userId ?? null,
        } as Record<string, unknown>,
      },
      userId,
    );
    this.logger.log(`内容项目 ${id} 已提交 ${stage} 生成任务 ${task.id}（dispatched=${dispatched}）`);
    return { taskId: task.id, dispatched, stage };
  }

  async update(
    id: string,
    dto: {
      workingContent?: string;
      status?: string;
      contentType?: 'article' | 'image';
      externalUrl?: string;
      aiGenerated?: boolean;
      aiDeclaration?: string;
      plannedPublishAt?: string;
    },
  ) {
    await this.get(id); // 404 守卫
    const data: Prisma.ContentProjectUpdateInput = {};
    if (dto.workingContent !== undefined) data.workingContent = dto.workingContent;
    if (dto.contentType !== undefined) data.contentType = dto.contentType;
    if (dto.status !== undefined) {
      data.status = dto.status as Prisma.ContentProjectUpdateInput['status'];
    }
    if (dto.externalUrl !== undefined) data.externalUrl = dto.externalUrl;
    // T3.8：AI 生成标识声明入口（合规 §12）
    if (dto.aiGenerated !== undefined) data.aiGenerated = dto.aiGenerated;
    if (dto.aiDeclaration !== undefined) data.aiDeclaration = dto.aiDeclaration || null;
    // T4.4 内容日历：计划发布日（本地日 → 本地午夜 Date；空串清除排期）
    if (dto.plannedPublishAt !== undefined) {
      data.plannedPublishAt = toDateOrNull(dto.plannedPublishAt);
    }
    return this.prisma.client.contentProject.update({ where: { id }, data });
  }

  /**
   * T3.8 导出内容项目为规范 Markdown：元信息 front-matter + 正文（当前生效版本，缺省 workingContent）+ AI 生成声明页脚。
   * 纯组装 + 纯函数渲染，参数绑定防注入；密钥不经此路径。
   * 返回 { filename, content }，由前端负责复制 / 下载（.md）。
   */
  async exportProject(id: string): Promise<{ filename: string; content: string }> {
    const p = await this.prisma.client.contentProject.findUnique({
      where: { id },
      include: {
        ownedAccount: { select: { id: true, name: true } },
        topic: { select: { id: true, title: true } },
        strategyVersion: { select: { id: true, version: true } },
        selectedTitle: { select: { id: true, text: true } },
        currentVersion: { select: { id: true, content: true } },
      },
    });
    if (!p) throw new NotFoundException(`内容项目不存在：${id}`);

    // 正文：优先当前生效版本，否则 workingContent 兜底（深入设计 §1.1）
    const body =
      p.currentVersion?.content ??
      (typeof p.workingContent === 'string' ? p.workingContent : '');

    const content = renderExportMarkdown({
      title: p.selectedTitle?.text ?? p.topic?.title ?? null,
      accountName: p.ownedAccount?.name ?? null,
      topicTitle: p.topic?.title ?? null,
      strategyVersion: p.strategyVersion?.version ?? null,
      aiGenerated: p.aiGenerated,
      aiDeclaration: p.aiDeclaration ?? null,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      externalUrl: p.externalUrl ?? null,
      body,
    });
    const filename = buildExportFilename(p.selectedTitle?.text ?? p.topic?.title, p.id);
    return { filename, content };
  }

  /**
   * T3.8 手动记录发布信息：校验输入 → APPROVED/已发布态可填发布信息 → 置 PUBLISHED（或 ARCHIVED）+ publishedAt/externalUrl/publishNote。
   * 状态守卫：仅允许从 APPROVED（或已 PUBLISHED/ARCHIVED 重填）进入，阻断跳过审核（CREATING/PENDING_REVIEW/NEEDS_REVISION → PUBLISHED）。
   */
  async recordPublication(id: string, raw: unknown) {
    const v = validatePublishRecordInput(raw);
    if (!v.ok) throw new BadRequestException(v.error);
    const p = await this.get(id); // 404 守卫
    if (!['APPROVED', 'PUBLISHED', 'ARCHIVED'].includes(p.status)) {
      throw new BadRequestException(
        '仅审核通过（APPROVED）或已发布态可填写发布信息；请先完成审核通过再发布',
      );
    }
    const d = v.data!;
    const data: Prisma.ContentProjectUpdateInput = {
      status: d.status,
      publishedAt: d.publishedAt ?? new Date(),
    };
    if (d.externalUrl !== undefined) data.externalUrl = d.externalUrl;
    if (d.publishNote !== undefined) data.publishNote = d.publishNote;
    const updated = await this.prisma.client.contentProject.update({ where: { id }, data });
    this.logger.log(`内容项目 ${id} 已记录发布信息（状态→${d.status}）`);
    return updated;
  }

  /** 软删（T1.3 扩展：delete → 置 deletedAt）。 */
  async remove(id: string) {
    await this.get(id);
    return this.prisma.client.contentProject.delete({ where: { id } });
  }

  // ============ T3.4 Markdown 编辑器：版本链（自动保存 + 显式保存版本 + 历史/恢复）============

  /**
   * T3.4 显式「保存版本」：在事务内自增 versionNo 写一条 ContentVersion（默认 source=manual），
   * 并把项目 currentVersionId 指向新版本（深入设计 §1.1：仅显式保存才落版本，避免版本爆炸）。
   */
  async saveVersion(
    id: string,
    dto: { content: string; note?: string; source?: string },
    userId?: string,
  ) {
    await this.get(id); // 404 守卫
    return this.prisma.client.$transaction(async (tx) => {
      const agg = await tx.contentVersion.aggregate({
        where: { projectId: id },
        _max: { versionNo: true },
      });
      const version = await tx.contentVersion.create({
        data: {
          projectId: id,
          versionNo: nextVersionNo(agg._max.versionNo),
          content: dto.content,
          source: (dto.source as ContentVersionSource) || 'manual',
          note: dto.note ?? null,
          createdById: userId ?? null,
        },
      });
      await tx.contentProject.update({
        where: { id },
        data: { currentVersionId: version.id },
      });
      return version;
    });
  }

  /** T3.4 版本历史：按 versionNo 倒序返回全部版本（ContentVersion 无软删字段，全量）。 */
  async listVersions(id: string) {
    await this.get(id);
    return this.prisma.client.contentVersion.findMany({
      where: { projectId: id },
      orderBy: { versionNo: 'desc' },
      take: 200,
      include: { createdBy: { select: { id: true, username: true } } },
    });
  }

  /**
   * T3.7 写一条「待采纳」staging 版本（AI 产出：polish/detect 等），**不**改变 currentVersionId。
   * 区别于 saveVersion（显式保存即生效），AI 结果须经前端「采纳」才成为当前版本（深入设计 §1.2）。
   * 在事务内自增 versionNo，与 saveVersion 共用同一递增序列。
   */
  async createStagingVersion(
    id: string,
    dto: { content: string; source: string; note?: string },
    userId?: string,
  ) {
    await this.get(id); // 404 守卫
    return this.prisma.client.$transaction(async (tx) => {
      const agg = await tx.contentVersion.aggregate({
        where: { projectId: id },
        _max: { versionNo: true },
      });
      return tx.contentVersion.create({
        data: {
          projectId: id,
          versionNo: nextVersionNo(agg._max.versionNo),
          content: dto.content,
          source: dto.source as ContentVersionSource,
          note: dto.note ?? null,
          createdById: userId ?? null,
        },
      });
    });
  }

  /** T3.4 单版本详情：校验版本归属本项目（防越权跨项目读取）。 */
  async getVersion(id: string, versionId: string) {
    await this.get(id);
    const v = await this.prisma.client.contentVersion.findFirst({
      where: { id: versionId, projectId: id },
      include: { createdBy: { select: { id: true, username: true } } },
    });
    if (!v) throw new NotFoundException(`版本不存在或不属于该项目：${versionId}`);
    return v;
  }

  /**
   * T3.4 恢复某版本：深入设计 §1.4 —— 仅设 currentVersionId 指向该版本（不删其它版本），
   * 同时把 workingContent 还原为该版本内容（离开页面不丢 / 重新进入用 workingContent 还原）。
   */
  async restoreVersion(id: string, versionId: string, userId?: string) {
    return this.applyCurrentVersion(id, versionId, userId);
  }

  /** T3.5：采纳 staging 版本（与恢复同义：设 currentVersionId + 还原 workingContent）。 */
  async adoptVersion(id: string, versionId: string, userId?: string) {
    return this.applyCurrentVersion(id, versionId, userId);
  }

  /** T3.5：放弃 staging 版本（硬删 ContentVersion；当前生效版本不可删，防孤儿 currentVersionId）。 */
  async deleteVersion(id: string, versionId: string) {
    await this.get(id); // 404 守卫
    const v = await this.prisma.client.contentVersion.findFirst({
      where: { id: versionId, projectId: id },
    });
    if (!v) throw new NotFoundException(`版本不存在或不属于该项目：${versionId}`);
    const p = await this.prisma.client.contentProject.findUnique({
      where: { id },
      select: { currentVersionId: true },
    });
    if (p?.currentVersionId === versionId) {
      throw new BadRequestException('当前生效版本不可删除，请先采纳其它版本');
    }
    return this.prisma.client.contentVersion.delete({ where: { id: versionId } });
  }

  /** T3.5：生成运行记录（GenerationRun，按创建时间倒序，供前端查看生成状态/结果）。 */
  async listGenerationRuns(id: string) {
    await this.get(id);
    return this.prisma.client.generationRun.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        outputVersion: { select: { id: true, versionNo: true, source: true } },
      },
    });
  }

  /** 设某版本为当前生效版本（恢复/采纳共用，深入设计 §1.4）。 */
  private async applyCurrentVersion(id: string, versionId: string, userId?: string) {
    await this.get(id);
    const v = await this.getVersion(id, versionId);
    await this.prisma.client.contentProject.update({
      where: { id },
      data: { currentVersionId: v.id, workingContent: v.content },
    });
    this.logger.log(`内容项目 ${id} 已置为版本 v${v.versionNo}（${versionId}）`);
    return v;
  }

  // ============ T3.6 审核状态机（待审核/需修改/已审核 + 审核清单 + 退回修改）============

  /** 懒创建审核记录，返回（含默认清单）。已有清单按 DICTIONARY_VERSION 刷新合规项（单一清单源）。 */
  private async upsertReview(projectId: string) {
    const existing = await this.prisma.client.contentReview.findUnique({ where: { projectId } });
    if (existing) {
      // 确保既有清单里的合规项 label 与当前词典版本一致（旧数据可能缺 source/版本戳）
      const current = (existing.checklist as unknown as ReviewChecklistItem[]) ?? [];
      const stamped = stampComplianceItem(current, DICTIONARY_VERSION);
      if (stamped.length !== current.length || JSON.stringify(stamped) !== JSON.stringify(current)) {
        return this.prisma.client.contentReview.update({
          where: { id: existing.id },
          data: { checklist: stamped as unknown as Prisma.InputJsonValue },
        });
      }
      return existing;
    }
    return this.prisma.client.contentReview.create({
      data: { projectId, checklist: defaultReviewChecklist() as unknown as Prisma.InputJsonValue },
    });
  }

  /**
   * T5.2：刷新创作上下文快照（一键重新定格）。
   * 重新从当前「标题/选题/策略/分析」读取并重建 contextSnapshot，并把提示词模板版本指向
   * 当前平台最新启用模板。解决观察清单里的★高风险点：源实体改名后面板不更新的误判。
   * 仅重算快照与模板版本，不改动账号/策略绑定与正文版本（绑定关系由业务流控制）。
   */
  async refreshContext(id: string, userId?: string) {
    const p = await this.get(id); // 404 + 归属校验
    const titleId = p.selectedTitleId;
    const topicId = p.topicId;

    const title = titleId
      ? await this.prisma.client.titleCandidate.findUnique({ where: { id: titleId } })
      : null;
    const topic = topicId
      ? await this.prisma.client.topic.findUnique({ where: { id: topicId } })
      : null;

    let strategySummary = '';
    let analysisSummary = '';
    let strategy: { id: string; ownedAccountId: string } | null = null;
    if (topic?.strategyId) {
      const s = await this.prisma.client.accountStrategy.findUnique({
        where: { id: topic.strategyId },
      });
      if (s) {
        strategy = { id: s.id, ownedAccountId: s.ownedAccountId };
        strategySummary = summarizeStrategy(s);
      }
    }
    if (topic?.analysisId) {
      const a = await this.prisma.client.analysis.findUnique({ where: { id: topic.analysisId } });
      if (a && a.structured && typeof a.structured === 'object') {
        analysisSummary = JSON.stringify(a.structured);
      }
    }

    const resolvedPlatform = resolvePlatform(p.platform);
    const pt = await this.prisma.client.promptTemplate.findFirst({
      where: { taskType: 'article_draft', platform: resolvedPlatform, enabled: true },
      orderBy: { version: 'desc' },
    });

    const context = buildContentContext({
      titleText: title?.text ?? '',
      titleBasis: title?.basis ?? null,
      topicTitle: topic?.title ?? '',
      topicAudience: topic?.audience ?? null,
      topicAngle: topic?.angle ?? null,
      topicTags: topic?.tags ?? null,
      strategySummary,
      analysisSummary,
    });

    await this.prisma.client.contentProject.update({
      where: { id },
      data: {
        contextSnapshot: context as Prisma.InputJsonValue,
        promptTemplateVersionId: pt?.id ?? null,
      },
    });
    this.logger.log(`内容项目 ${id} 上下文快照已刷新（platform=${resolvedPlatform}）`);
    return this.getContext(id);
  }

  /** 获取/初始化内容项目的审核记录（懒创建，默认清单）。 */
  async getReview(id: string) {
    await this.get(id); // 404 守卫（同时校验归属，防越权）
    return this.upsertReview(id);
  }

  /** 更新审核清单（整体替换，经白名单/长度校验，防注入与越界）。 */
  async updateChecklist(id: string, rawItems: unknown) {
    await this.get(id);
    const v = validateReviewChecklistInput(rawItems);
    if (!v.ok) throw new BadRequestException(v.error);
    const review = await this.upsertReview(id);
    return this.prisma.client.contentReview.update({
      where: { id: review.id },
      data: { checklist: v.items as unknown as Prisma.InputJsonValue },
    });
  }

  /** 标记待审核：CREATING/NEEDS_REVISION → PENDING_REVIEW（需先有可审核版本）。 */
  async submitForReview(
    id: string,
    opts: { overrideCompliance?: boolean } = {},
    userId?: string,
  ) {
    const p = await this.get(id);
    if (!p.currentVersionId) {
      throw new BadRequestException('请先保存至少一个版本再提交审核');
    }
    // T3.11 合规预审硬卡点：送审前自动标红，blocking 级风险词阻断提交（除非显式 override）
    const cc = await this.compliance.check(id, { versionId: p.currentVersionId });
    if (!cc.passed && !opts.overrideCompliance) {
      throw new BadRequestException({
        code: 'COMPLIANCE_BLOCKED',
        message:
          `送审被合规预审拦截：检出 ${cc.blockingCount} 处阻断级风险词（极限词/违禁词）。` +
          `请修改后重新送审，或确认风险后选择「覆盖提交」。`,
        blockingCount: cc.blockingCount,
        warningCount: cc.warningCount,
        matches: cc.matches,
        summary: cc.summary,
      });
    }
    const t = reviewTransition(p.status, 'submit');
    if (!t.ok) throw new BadRequestException(t.error);

    // 确保审核记录存在且合规项 stamp 到当前词典版本（单一清单源）
    const review = await this.upsertReview(id);
    // 预审通过时，把真实结果同步进清单的合规项（checked=passed），实现「清单与预审单一真相源」
    if (cc.passed) {
      const synced = syncComplianceChecklistItem(
        (review.checklist as unknown as ReviewChecklistItem[]) ?? [],
        true,
        DICTIONARY_VERSION,
      );
      await this.prisma.client.contentReview.update({
        where: { id: review.id },
        data: { checklist: synced as unknown as Prisma.InputJsonValue },
      });
    }

    const updated = await this.prisma.client.contentProject.update({
      where: { id },
      data: { status: t.to! },
    });
    this.logger.log(`内容项目 ${id} 已提交审核（${p.status} → ${t.to}）合规预审 passed=${cc.passed}`);
    return updated;
  }

  /** 退回修改：PENDING_REVIEW → NEEDS_REVISION（需退回意见，记录决定人/时间）。 */
  async sendBack(id: string, comment: string, userId?: string) {
    const p = await this.get(id);
    const t = reviewTransition(p.status, 'send_back', { comment });
    if (!t.ok) throw new BadRequestException(t.error);
    const review = await this.upsertReview(id);
    await this.prisma.client.contentReview.update({
      where: { id: review.id },
      data: { comment: comment.slice(0, 500), decidedAt: new Date(), decidedById: userId ?? null },
    });
    const updated = await this.prisma.client.contentProject.update({
      where: { id },
      data: { status: t.to! },
    });
    this.logger.log(`内容项目 ${id} 已退回修改（${p.status} → ${t.to}）：${comment.slice(0, 80)}`);
    return updated;
  }

  /** 审核通过：PENDING_REVIEW/NEEDS_REVISION → APPROVED（审核清单需全勾选，硬卡点）。 */
  async approve(id: string, userId?: string) {
    const p = await this.get(id);
    const review = await this.upsertReview(id);
    const checklist = (review.checklist as unknown as ReviewChecklistItem[]) ?? [];
    const t = reviewTransition(p.status, 'approve', { checklist });
    if (!t.ok) throw new BadRequestException(t.error);
    await this.prisma.client.contentReview.update({
      where: { id: review.id },
      data: { decidedAt: new Date(), decidedById: userId ?? null },
    });
    const updated = await this.prisma.client.contentProject.update({
      where: { id },
      data: { status: t.to! },
    });
    this.logger.log(`内容项目 ${id} 审核通过（${p.status} → ${t.to}）`);
    return updated;
  }
}
