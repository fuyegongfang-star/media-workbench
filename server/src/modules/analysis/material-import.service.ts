// T2.2 素材批量导入服务：预览（解析+指纹去重，不落库）/ 提交（按决策三选一创建）。
// 所有写库经 Prisma 参数绑定（防注入）；无 DB 时预览优雅降级（全部视为 new）。
// 三选一（深入设计 §2.1）：skip 跳过 / merge（duplicateOfId 指向已有或批次内首条）/ copy（保留副本入库）。
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  classifyMaterialCandidates,
  computeFingerprint,
  parseMaterials,
  type MaterialAction,
  type MaterialFormat,
  type MaterialImportCandidate,
  type MaterialRow,
} from './material-import.util';

export interface MaterialCommitRow extends MaterialRow {
  action: MaterialAction;
  /** 库内重复合并时指向的已有素材 id；批次内重复合并由服务按指纹解析 */
  existingId?: string;
}

export interface MaterialPreviewResult {
  dbChecked: boolean;
  parsed: number;
  skipped: string[];
  candidates: MaterialImportCandidate[];
}

export interface MaterialCommitResult {
  created: number;
  skipped: number;
  ids: string[];
}

@Injectable()
export class MaterialImportService {
  private readonly logger = new Logger(MaterialImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 解析 + 指纹去重预览：不写库；无 DB 时 existingByFp 为空，所有候选标 new。 */
  async previewMaterialImport(
    referenceAccountId: string,
    raw: string,
    format: MaterialFormat,
  ): Promise<MaterialPreviewResult> {
    const { rows, skipped } = await parseMaterials(raw, format);
    const existingByFp = new Map<string, string>();
    let dbChecked = false;
    if (referenceAccountId) {
      try {
        const existing = await this.prisma.client.sourceMaterial.findMany({
          where: { referenceAccountId, deletedAt: null },
          select: { id: true, fingerprint: true },
        });
        for (const e of existing) if (e.fingerprint) existingByFp.set(e.fingerprint, e.id);
        dbChecked = true;
      } catch (e) {
        // 无 PG 环境：降级为"全部新增"预览，提交时如实失败（不伪造通过）
        this.logger.warn(`素材导入预览读取库内素材失败，按全部新增预览：${(e as Error).message}`);
        dbChecked = false;
      }
    }
    const candidates = classifyMaterialCandidates(rows, existingByFp);
    return { dbChecked, parsed: rows.length, skipped, candidates };
  }

  /** 按每行 action 提交：skip 跳过；create/copy 正常入库（副本允许）；merge 设 duplicateOfId。 */
  async commitMaterialImport(
    referenceAccountId: string,
    rows: MaterialCommitRow[],
  ): Promise<MaterialCommitResult> {
    const valid = (rows ?? []).filter((r) => r && r.title && r.title.trim().length > 0);
    let created = 0;
    let skipped = (rows?.length ?? 0) - valid.length;
    const ids: string[] = [];
    // 本批次已建 id，供批次内重复"合并"引用
    const batchFp = new Map<string, string>();

    for (const row of valid) {
      if (row.action === 'skip') {
        skipped++;
        continue;
      }
      let duplicateOfId: string | null = null;
      if (row.action === 'merge') {
        if (row.existingId) duplicateOfId = row.existingId;
        else {
          const fp = computeFingerprint(row.title, row.body ?? '');
          if (batchFp.has(fp)) duplicateOfId = batchFp.get(fp)!;
        }
      }
      const data: Prisma.SourceMaterialCreateInput = {
        referenceAccount: { connect: { id: referenceAccountId } },
        title: row.title.trim(),
        body: row.body ?? '',
        fingerprint: computeFingerprint(row.title, row.body ?? ''),
        sourceUrl: row.sourceUrl?.trim() || null,
        author: row.author?.trim() || null,
        collectedAt: parseDate(row.collectedAt),
        licenseNote: row.licenseNote?.trim() || null,
        duplicateOf: duplicateOfId ? { connect: { id: duplicateOfId } } : undefined,
      };
      try {
        const createdRow = await this.prisma.client.sourceMaterial.create({ data });
        ids.push(createdRow.id);
        if (createdRow.fingerprint) batchFp.set(createdRow.fingerprint, createdRow.id);
        created++;
      } catch (e) {
        // FK 不存在 / DB 不可用 → 如实跳过该项（不伪造通过）
        this.logger.warn(`素材入库失败（跳过该项）：${(e as Error).message}`);
        skipped++;
      }
    }
    return { created, skipped, ids };
  }
}

function parseDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
