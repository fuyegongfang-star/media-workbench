import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditQuery,
  RECYCLE_MODELS,
  buildAuditWhere,
  clampPage,
  formatRecycleName,
  getRecycleModel,
  type RecycleModelMeta,
} from './observability.util';

/**
 * 可观测性服务（T1.9）：审计日志检索 + 回收站列表/恢复。
 * - 审计日志读 audit_events（非软删实体，无过滤注入）。
 * - 回收站：对 8 个软删实体显式传 `where.deletedAt != null` 绕过 T1.3 软删作用域，
 *   故可列出已删记录；恢复即 `update({ deletedAt: null })`（非 delete，不会被再次软删）。
 * - 无 PG 时这些查询会失败，由 controller 层捕获后如实降级（不伪造通过）。
 */
@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listAudit(q: AuditQuery) {
    const where = buildAuditWhere(q);
    const { skip, take, page, pageSize } = clampPage(q.page, q.pageSize);
    const [items, total] = await Promise.all([
      this.prisma.client.auditEvent.findMany({
        where,
        orderBy: { at: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.auditEvent.count({ where }),
    ]);
    return {
      items: items.map((e) => ({
        id: e.id,
        userId: e.userId,
        objectType: e.objectType,
        objectId: e.objectId,
        action: e.action,
        at: e.at.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async listRecycleBin(type?: string) {
    const models: RecycleModelMeta[] = type ? [getRecycleModel(type)].filter(Boolean) as RecycleModelMeta[] : RECYCLE_MODELS;
    if (type && models.length === 0) {
      throw new NotFoundException(`未知回收站类型：${type}`);
    }

    const out: Array<{
      type: string;
      typeLabel: string;
      id: string;
      name: string;
      deletedAt: string | null;
      updatedAt: string | null;
    }> = [];

    const client = this.prisma.client as unknown as Record<string, any>;
    for (const meta of models) {
      try {
        const select: Record<string, boolean> = { id: true, deletedAt: true, updatedAt: true };
        if (meta.nameField) select[meta.nameField] = true;
        const rows = await client[meta.model].findMany({
          where: { deletedAt: { not: null } },
          select,
          take: 100,
          orderBy: { deletedAt: 'desc' },
        });
        for (const r of rows) {
          out.push({
            type: meta.key,
            typeLabel: meta.label,
            id: r.id,
            name: formatRecycleName(meta, r),
            deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
            updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
          });
        }
      } catch (e) {
        // 单模型失败不影响其它模型；如实记录，不抛出掩盖（深入设计 §2.2 运维可读）
        this.logger.warn(`回收站列举 ${meta.key} 失败：${(e as Error).message}`);
      }
    }

    out.sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
    return {
      items: out,
      total: out.length,
      types: RECYCLE_MODELS.map((m) => ({ key: m.key, label: m.label })),
    };
  }

  async restore(type: string, id: string) {
    const meta = getRecycleModel(type);
    if (!meta) throw new NotFoundException(`未知回收站类型：${type}`);

    const client = this.prisma.client as unknown as Record<string, any>;
    const existing = await client[meta.model].findFirst({
      where: { id, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`未找到可恢复的 ${meta.label}（id=${id}，可能已恢复或不存在）`);
    }

    const updated = await client[meta.model].update({
      where: { id },
      data: { deletedAt: null },
    });
    this.logger.log(`回收站恢复：${meta.label} id=${id}`);
    return {
      type: meta.key,
      id,
      restored: true,
      updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : null,
    };
  }
}
