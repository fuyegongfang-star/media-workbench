import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTitleCandidateDto, UpdateTitleCandidateDto } from './title-candidate.dto';

/**
 * 标题候选 CRUD（T3.1）。
 * - 叶子实体：TitleCandidate 不在 T1.3 SOFT_DELETE_MODELS，remove 为物理删除（深入设计：叶子实体允许硬删）。
 * - selected 互斥：select 时清空同选题下其它候选的 selected（同一时刻仅一个选中）。
 * - 查询/写入一律走 Prisma 参数绑定（防注入）。
 */
@Injectable()
export class TitleCandidateService {
  private readonly logger = new Logger(TitleCandidateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(topicId: string, dto: CreateTitleCandidateDto) {
    const topic = await this.prisma.client.topic.findUnique({ where: { id: topicId } });
    if (!topic) throw new NotFoundException(`选题不存在：${topicId}`);
    const text = dto.text?.trim();
    if (!text) throw new BadRequestException('标题文案不能为空');
    return this.prisma.client.titleCandidate.create({
      data: {
        topicId,
        text,
        basis: dto.basis ?? null,
        score: dto.score ?? null,
        tags: (dto.tags ?? []) as Prisma.InputJsonValue,
        selected: false,
        status: dto.status ?? 'draft',
      },
    });
  }

  async listByTopic(topicId: string) {
    return this.prisma.client.titleCandidate.findMany({
      where: { topicId },
      orderBy: [{ selected: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
  }

  async get(id: string) {
    const t = await this.prisma.client.titleCandidate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`标题候选不存在：${id}`);
    return t;
  }

  async update(id: string, dto: UpdateTitleCandidateDto) {
    await this.get(id);
    const data: Prisma.TitleCandidateUpdateInput = {};
    if (dto.text !== undefined) data.text = dto.text;
    if (dto.basis !== undefined) data.basis = dto.basis;
    if (dto.score !== undefined) data.score = dto.score;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.tags !== undefined) data.tags = dto.tags as Prisma.InputJsonValue;
    return this.prisma.client.titleCandidate.update({ where: { id }, data });
  }

  /** 物理删除（叶子实体允许硬删）。 */
  async remove(id: string) {
    await this.get(id);
    return this.prisma.client.titleCandidate.delete({ where: { id } });
  }

  /** 选中某标题：置 selected=true，并清空同选题下其它候选（互斥）。 */
  async select(id: string) {
    const target = await this.get(id);
    await this.prisma.client.titleCandidate.updateMany({
      where: { topicId: target.topicId, id: { not: id } },
      data: { selected: false },
    });
    return this.prisma.client.titleCandidate.update({
      where: { id },
      data: { selected: true, status: target.status === 'rejected' ? 'draft' : target.status },
    });
  }
}
