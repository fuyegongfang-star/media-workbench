// T2.1 对标账号批量导入服务：预览（解析+去重，不落库）/ 提交（按决策创建）。
// 所有写库经 Prisma 参数绑定（防注入）；无 DB 时预览优雅降级（全部视为 new）。
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  classifyCandidates,
  deriveDomain,
  normalizeRefName,
  parseReferenceAccounts,
  VALID_PLATFORMS,
  type ImportCandidate,
  type ReferenceFormat,
} from './reference-import.util';

export interface CommitRow {
  name: string;
  platform?: string;
  homepageUrl?: string;
  domain?: string;
  note?: string;
  action: 'create' | 'skip';
}

export interface PreviewResult {
  dbChecked: boolean;
  parsed: number;
  skipped: string[];
  candidates: ImportCandidate[];
}

export interface CommitResult {
  created: number;
  skipped: number;
  ids: string[];
}

@Injectable()
export class ReferenceImportService {
  private readonly logger = new Logger(ReferenceImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 解析 + 去重预览：不写库；无 DB 时 existingLower 为空，所有候选标 new。 */
  async previewReferenceImport(raw: string, format: ReferenceFormat): Promise<PreviewResult> {
    const { rows, skipped } = parseReferenceAccounts(raw, format);
    const existingLower = new Map<string, string>();
    let dbChecked = false;
    try {
      const existing = await this.prisma.client.referenceAccount.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      });
      for (const e of existing) existingLower.set(normalizeRefName(e.name), e.id);
      dbChecked = true;
    } catch (e) {
      // 无 PG 环境：降级为"全部新增"预览，提交时如实失败（不伪造通过）
      this.logger.warn(`对标账号导入预览读取已有账号失败，按全部新增预览：${(e as Error).message}`);
      dbChecked = false;
    }
    const candidates = classifyCandidates(rows, existingLower);
    return { dbChecked, parsed: rows.length, skipped, candidates };
  }

  /** 按每行的 action 创建：action=skip 跳过；action=create 且 name 非空才入；提交时再次去重防御。 */
  async commitReferenceImport(rows: CommitRow[]): Promise<CommitResult> {
    const toCreate: Prisma.ReferenceAccountCreateManyInput[] = rows
      .filter((r) => r.action !== 'skip' && r.name && r.name.trim().length > 0)
      .map((r) => {
        const name = r.name.trim();
        const homepageUrl = r.homepageUrl?.trim() || undefined;
        const platform: 'wechat' =
          r.platform && VALID_PLATFORMS.has(r.platform) ? (r.platform as 'wechat') : 'wechat';
        return {
          name,
          platform,
          homepageUrl: homepageUrl || null,
          domain: r.domain?.trim() || deriveDomain(homepageUrl) || null,
          note: r.note?.trim() || null,
        };
      });

    if (toCreate.length === 0) {
      return { created: 0, skipped: rows.length, ids: [] };
    }

    // 防御性去重：跳过与已有同名（避免 UI 误传 create 已存在项）
    let existingLower = new Set<string>();
    try {
      const existing = await this.prisma.client.referenceAccount.findMany({
        where: { deletedAt: null },
        select: { name: true },
      });
      existingLower = new Set(existing.map((e) => normalizeRefName(e.name)));
    } catch {
      existingLower = new Set();
    }
    const filtered = toCreate.filter((r) => !existingLower.has(normalizeRefName(r.name)));
    const skipped = rows.length - filtered.length;

    if (filtered.length === 0) {
      return { created: 0, skipped, ids: [] };
    }

    const created = await this.prisma.client.referenceAccount.createMany({ data: filtered });
    return {
      created: typeof created.count === 'number' ? created.count : filtered.length,
      skipped,
      ids: [],
    };
  }
}
