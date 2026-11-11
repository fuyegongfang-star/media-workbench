import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  aggregateTagCounts,
  buildMaterialWhere,
  clampPage,
  materialOrderBy,
  normalizeTags,
  parseMaterialQuery,
  shapeMaterial,
  type MaterialListItem,
  type MaterialQuery,
} from './library.util';

/**
 * 素材库服务（T4.3）：跨类型搜索 / 多维度筛选 / 关系回溯 / 收藏·标签·归档·软删恢复。
 * - 搜索与筛选：pg_trgm（0002 已在 title/body 建 GIN）+ 参数化 where（防注入）；
 *   软删过滤由 T1.3 扩展统一注入，本服务不重复处理。
 * - 关系回溯：素材→分析→选题→标题候选/内容项目→生成运行/起号任务（深入设计 §2.3）。
 * - 无 PostgreSQL 时这些查询会失败，controller 层捕获后如实降级（不伪造通过）。
 */
@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async searchMaterials(query: Record<string, any>): Promise<{
    items: MaterialListItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const parsed: MaterialQuery = parseMaterialQuery(query);
    const where = buildMaterialWhere(parsed);
    const { skip, take, page, pageSize } = clampPage(
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    const orderBy = materialOrderBy(parsed.sort);

    const [rows, total] = await Promise.all([
      this.prisma.client.sourceMaterial.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          referenceAccount: { select: { name: true, platform: true } },
          _count: { select: { analyses: true, duplicates: true } },
        },
      }),
      this.prisma.client.sourceMaterial.count({ where }),
    ]);

    return {
      items: rows.map((m) => shapeMaterial(m)),
      total,
      page,
      pageSize,
    };
  }

  async getMaterial(id: string): Promise<MaterialListItem & { duplicateOf?: { id: string; title: string } | null; duplicatesCount: number }> {
    const m = await this.prisma.client.sourceMaterial.findUnique({
      where: { id },
      include: {
        referenceAccount: { select: { name: true, platform: true } },
        duplicateOf: { select: { id: true, title: true } },
        _count: { select: { analyses: true, duplicates: true } },
      },
    });
    if (!m) throw new NotFoundException(`素材不存在：${id}`);
    return {
      ...shapeMaterial(m),
      duplicateOf: m.duplicateOf,
      duplicatesCount: m._count.duplicates,
    };
  }

  /**
   * 关系回溯（深入设计 §2.3）：沿「素材→分析→选题→标题候选/内容项目→生成运行/起号任务」展开。
   * 返回去重后的节点集合，供前端绘制关系图谱。
   */
  async getMaterialGraph(id: string): Promise<{
    material: MaterialListItem | null;
    analyses: Array<{
      id: string;
      kind: string;
      accountId: string | null;
      createdAt: string | null;
      topics: Array<{ id: string; title: string }>;
    }>;
    topics: Array<{ id: string; title: string; audience: string | null; status: string }>;
    titleCandidates: Array<{ id: string; text: string; status: string; selected: boolean }>;
    contentProjects: Array<{
      id: string;
      status: string;
      publishedAt: string | null;
      generationRuns: Array<{ id: string; stage: string; model: string | null; status: string }>;
      launchTasks: Array<{ id: string; title: string | null; status: string }>;
    }>;
    generationRuns: Array<{ id: string; stage: string; model: string | null; status: string }>;
    launchTasks: Array<{ id: string; title: string | null; status: string }>;
  }> {
    const m = await this.prisma.client.sourceMaterial.findUnique({
      where: { id },
      include: { referenceAccount: { select: { name: true, platform: true } }, _count: { select: { analyses: true } } },
    });
    if (!m) throw new NotFoundException(`素材不存在：${id}`);

    const analyses = await this.prisma.client.analysis.findMany({
      where: { materialId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        topics: {
          include: {
            titleCandidates: { select: { id: true, text: true, status: true, selected: true } },
            contentProjects: { select: { id: true, status: true, publishedAt: true } },
          },
        },
      },
    });

    const topicMap = new Map<string, any>();
    const titleCandidates: Array<{ id: string; text: string; status: string; selected: boolean }> = [];
    const tcSeen = new Set<string>();
    const projectIds: string[] = [];
    const projectMap = new Map<string, any>();

    for (const a of analyses) {
      for (const t of a.topics) {
        if (!topicMap.has(t.id)) {
          topicMap.set(t.id, { id: t.id, title: t.title, audience: t.audience ?? null, status: t.status });
        }
        for (const tc of t.titleCandidates) {
          if (!tcSeen.has(tc.id)) {
            tcSeen.add(tc.id);
            titleCandidates.push({ id: tc.id, text: tc.text, status: tc.status, selected: tc.selected });
          }
        }
        for (const p of t.contentProjects) {
          if (!projectMap.has(p.id)) {
            projectMap.set(p.id, p);
            projectIds.push(p.id);
          }
        }
      }
    }

    const projects = projectIds.length
      ? await this.prisma.client.contentProject.findMany({
          where: { id: { in: projectIds } },
          include: {
            generationRuns: { select: { id: true, stage: true, model: true, status: true } },
            launchTasks: { select: { id: true, title: true, status: true } },
          },
        })
      : [];

    const generationRuns: Array<{ id: string; stage: string; model: string | null; status: string }> = [];
    const launchTasks: Array<{ id: string; title: string | null; status: string }> = [];
    const grSeen = new Set<string>();
    const ltSeen = new Set<string>();

    for (const p of projects) {
      for (const gr of p.generationRuns) {
        if (!grSeen.has(gr.id)) {
          grSeen.add(gr.id);
          generationRuns.push(gr);
        }
      }
      for (const lt of p.launchTasks) {
        if (!ltSeen.has(lt.id)) {
          ltSeen.add(lt.id);
          launchTasks.push(lt);
        }
      }
    }

    return {
      material: shapeMaterial(m),
      analyses: analyses.map((a) => ({
        id: a.id,
        kind: a.kind,
        accountId: a.accountId ?? null,
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
        topics: a.topics.map((t) => ({ id: t.id, title: t.title })),
      })),
      topics: [...topicMap.values()],
      titleCandidates,
      contentProjects: projects.map((p) => ({
        id: p.id,
        status: p.status,
        publishedAt: p.publishedAt ? new Date(p.publishedAt).toISOString() : null,
        generationRuns: p.generationRuns,
        launchTasks: p.launchTasks,
      })),
      generationRuns,
      launchTasks,
    };
  }

  async updateMaterial(id: string, dto: { tags?: string[]; favorite?: boolean; archived?: boolean }): Promise<MaterialListItem> {
    const existing = await this.prisma.client.sourceMaterial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`素材不存在：${id}`);

    const data: Record<string, any> = {};
    if (dto.tags !== undefined) data.tags = normalizeTags(dto.tags);
    if (typeof dto.favorite === 'boolean') data.favorite = dto.favorite;
    if (typeof dto.archived === 'boolean') data.archived = dto.archived;

    const updated = await this.prisma.client.sourceMaterial.update({
      where: { id },
      data,
      include: { referenceAccount: { select: { name: true, platform: true } }, _count: { select: { analyses: true } } },
    });
    return shapeMaterial(updated);
  }

  /** 软删（T1.3 扩展将物理 delete 改写为置 deletedAt）。 */
  async softDeleteMaterial(id: string): Promise<{ id: string; deleted: true }> {
    const existing = await this.prisma.client.sourceMaterial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`素材不存在：${id}`);
    await this.prisma.client.sourceMaterial.delete({ where: { id } });
    this.logger.log(`素材软删：${id}`);
    return { id, deleted: true };
  }

  /** 从回收站恢复：显式传 deletedAt:{not:null} 绕过 T1.3 软删作用域读取已删记录。 */
  async restoreMaterial(id: string): Promise<{ id: string; restored: true }> {
    const existing = await this.prisma.client.sourceMaterial.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`未找到可恢复的素材（id=${id}，可能已恢复或不存在）`);
    await this.prisma.client.sourceMaterial.update({ where: { id }, data: { deletedAt: null } });
    this.logger.log(`素材恢复：${id}`);
    return { id, restored: true };
  }

  /** 回收站列表（已删素材），供恢复 UI。 */
  async listDeleted(): Promise<
    Array<{ id: string; title: string; referenceAccountId: string; deletedAt: string | null }>
  > {
    const rows = await this.prisma.client.sourceMaterial.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, title: true, referenceAccountId: true, deletedAt: true },
      orderBy: { deletedAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      referenceAccountId: r.referenceAccountId,
      deletedAt: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
    }));
  }

  /** 标签聚合（筛选建议）。轻量：仅取前 200 条素材的 tags 聚合。 */
  async listTags(): Promise<Array<{ tag: string; count: number }>> {
    const rows = await this.prisma.client.sourceMaterial.findMany({
      where: { deletedAt: null },
      select: { tags: true },
      take: 200,
    });
    return aggregateTagCounts(rows);
  }
}
