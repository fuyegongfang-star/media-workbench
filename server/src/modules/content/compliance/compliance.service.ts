import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ComplianceProviderService } from './compliance-provider.service';
import { DICTIONARY_VERSION } from './compliance-dictionary';
import {
  buildComplianceSummaryText,
  ComplianceMatch,
  renderHighlight,
  summarizeCompliance,
} from './compliance.util';

export interface ComplianceCheckInput {
  /** 指定被检测版本（绑定具体版本，正文修改后旧结果自动失效）。 */
  versionId?: string;
  /** 直接传入正文（前端实时预审用，不落库版本时）。 */
  content?: string;
  /** 检测来源标识（默认 local）。 */
  service?: string;
}

export interface ComplianceCheckResult {
  checkId: string;
  projectId: string;
  versionId: string | null;
  passed: boolean;
  riskCount: number;
  blockingCount: number;
  warningCount: number;
  maxSeverity: 'blocking' | 'warning' | null;
  service: string;
  summary: string | null;
  /** 命中明细（含位置，供标红）。 */
  matches: ComplianceMatch[];
  /** 标红分段（供前端直接渲染）。 */
  highlights: { text: string; hit: boolean; severity?: 'blocking' | 'warning'; suggestion?: string }[];
  checkedAt: string;
}

/**
 * T3.11 合规预审编排服务。
 * - check：解析待检正文（指定版本/直接正文/当前版本）→ 本地词典 Provider 检测 → 写 ComplianceCheck → 返回命中与标红分段。
 * - getLatest：取项目最近一次预审结果（供审核面板展示与「硬卡点」判定）。
 * 全部走 Prisma 参数绑定；此处无密钥、无外部网络依赖（本地词典确定性可用）。
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ComplianceProviderService,
  ) {}

  /** 运行一次合规预审并落库，返回结果（含标红分段）。 */
  async check(projectId: string, input: ComplianceCheckInput = {}): Promise<ComplianceCheckResult> {
    const project = await this.prisma.client.contentProject.findUnique({
      where: { id: projectId },
      select: { id: true, currentVersionId: true },
    });
    if (!project) throw new NotFoundException(`内容项目不存在：${projectId}`);

    // 解析待检正文：优先指定版本，其次直接传入，再次当前生效版本
    let versionId: string | null = null;
    let text = '';
    if (input.versionId) {
      const v = await this.prisma.client.contentVersion.findFirst({
        where: { id: input.versionId, projectId },
        select: { id: true, content: true },
      });
      if (!v) throw new NotFoundException(`版本不存在或不属于该项目：${input.versionId}`);
      versionId = v.id;
      text = v.content ?? '';
    } else if (typeof input.content === 'string') {
      text = input.content;
    } else if (project.currentVersionId) {
      const v = await this.prisma.client.contentVersion.findUnique({
        where: { id: project.currentVersionId },
        select: { id: true, content: true },
      });
      versionId = v?.id ?? null;
      text = v?.content ?? '';
    }

    const provider = await this.providers.resolve();
    const { matches, service } = await provider.check(text);
    const summary = summarizeCompliance(matches);
    const summaryText = buildComplianceSummaryText(text, matches);
    const highlights = renderHighlight(text, matches);

    const record = await this.prisma.client.complianceCheck.create({
      data: {
        projectId,
        versionId,
        passed: summary.passed,
        riskCount: summary.riskCount,
        blockingCount: summary.blockingCount,
        warningCount: summary.warningCount,
        maxSeverity: summary.maxSeverity,
        service: input.service ?? service,
        matches: matches as unknown as Prisma.InputJsonValue,
        summary: summaryText,
        dictionaryVersion: DICTIONARY_VERSION,
      },
    });

    this.logger.log(
      `合规预审完成：project=${projectId} passed=${summary.passed} blocking=${summary.blockingCount} warning=${summary.warningCount}`,
    );

    return {
      checkId: record.id,
      projectId,
      versionId,
      passed: summary.passed,
      riskCount: summary.riskCount,
      blockingCount: summary.blockingCount,
      warningCount: summary.warningCount,
      maxSeverity: summary.maxSeverity,
      service: record.service,
      summary: summaryText,
      matches,
      highlights,
      checkedAt: record.checkedAt.toISOString(),
    };
  }

  /** 取项目最近一次合规预审（无则返回 null）。 */
  async getLatest(projectId: string): Promise<ComplianceCheckResult | null> {
    const rec = await this.prisma.client.complianceCheck.findFirst({
      where: { projectId },
      orderBy: { checkedAt: 'desc' },
    });
    if (!rec) return null;
    const matches = (rec.matches as unknown as ComplianceMatch[]) ?? [];
    // 复算汇总，避免历史数据不一致
    const s = summarizeCompliance(matches);
    const project = await this.prisma.client.contentProject.findUnique({
      where: { id: projectId },
      select: { currentVersionId: true },
    });
    const text = ''; // 历史记录不再回溯原文，仅返回汇总与命中
    return {
      checkId: rec.id,
      projectId,
      versionId: rec.versionId,
      passed: rec.passed,
      riskCount: rec.riskCount,
      blockingCount: rec.blockingCount,
      warningCount: rec.warningCount,
      maxSeverity: rec.maxSeverity as 'blocking' | 'warning' | null,
      service: rec.service,
      summary: rec.summary,
      matches,
      highlights: renderHighlight(text, matches),
      checkedAt: rec.checkedAt.toISOString(),
      // 标记是否针对当前版本（正文已改则视为过期，类比 TextReviewRun.stale）
      ...(project ? { stale: rec.versionId !== project.currentVersionId } : {}),
    } as ComplianceCheckResult & { stale?: boolean };
  }
}
