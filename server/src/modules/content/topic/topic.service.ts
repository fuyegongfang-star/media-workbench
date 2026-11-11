import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTopicDto, UpdateTopicDto } from './topic.dto';

/** 将 YYYY-MM-DD（本地日）解析为本地午夜 Date；非法/空返回 null（清除排期）。 */
function toDateOrNull(value?: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * 选题 CRUD（T3.1）。
 * - 软删作用域：Topic 在 T1.3 SOFT_DELETE_MODELS 中，remove 经扩展转软删（deletedAt），绝不物理删除。
 * - tags 为 Json 必填列，缺省落 []；sourceType 必填标注来源。
 * - 查询/写入一律走 Prisma 参数绑定（防注入）。
 */
@Injectable()
export class TopicService {
  private readonly logger = new Logger(TopicService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTopicDto, userId?: string) {
    void userId; // 当前单用户；预留 createdBy 审计（Topic 无 createdBy 列，由审计中间件统一记录）
    return this.prisma.client.topic.create({
      data: {
        strategyId: dto.strategyId ?? null,
        analysisId: dto.analysisId ?? null,
        title: dto.title,
        audience: dto.audience ?? null,
        angle: dto.angle ?? null,
        status: dto.status ?? 'draft',
        tags: (dto.tags ?? []) as Prisma.InputJsonValue,
        sourceType: dto.sourceType,
        plannedAt: toDateOrNull(dto.plannedAt),
      },
    });
  }

  async list(filter: { strategyId?: string; analysisId?: string; status?: string }) {
    const where: Prisma.TopicWhereInput = {};
    if (filter.strategyId) where.strategyId = filter.strategyId;
    if (filter.analysisId) where.analysisId = filter.analysisId;
    if (filter.status) where.status = filter.status as Prisma.TopicWhereInput['status'];
    return this.prisma.client.topic.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(id: string) {
    const t = await this.prisma.client.topic.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`选题不存在：${id}`);
    return t;
  }

  async update(id: string, dto: UpdateTopicDto) {
    await this.get(id); // 404 守卫
    return this.prisma.client.topic.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(dto.angle !== undefined ? { angle: dto.angle } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.sourceType !== undefined ? { sourceType: dto.sourceType } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags as Prisma.InputJsonValue } : {}),
        ...(dto.plannedAt !== undefined ? { plannedAt: toDateOrNull(dto.plannedAt) } : {}),
      },
    });
  }

  /** 软删（T1.3 扩展：delete → 置 deletedAt）。 */
  async remove(id: string) {
    await this.get(id);
    return this.prisma.client.topic.delete({ where: { id } });
  }
}
