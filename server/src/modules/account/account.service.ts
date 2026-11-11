import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { nextStrategyVersion } from './account.util';
import { CreateOwnedAccountDto } from './dto/create-owned-account.dto';
import { UpdateOwnedAccountDto } from './dto/update-owned-account.dto';
import { CreateReferenceAccountDto } from './dto/create-reference-account.dto';
import { UpdateReferenceAccountDto } from './dto/update-reference-account.dto';
import { CreateAccountStrategyDto } from './dto/create-account-strategy.dto';
import { UpdateAccountStrategyDto } from './dto/update-account-strategy.dto';

const OWNED_ACCOUNT_STATUS = new Set(['active', 'paused', 'archived']);
const REFERENCE_PLATFORM_FILTER = new Set(['wechat']);

/**
 * 账号与策略服务（T1.7 基础 CRUD）。
 * - OwnedAccount 按当前用户 userId 隔离；ReferenceAccount 为全局参考。
 * - 软删复用 T1.3 扩展：调用 prisma.client.<model>.delete 即转写为 deletedAt 软删，
 *   list/findFirst 自动注入 deletedAt:null，绝不物理删除。
 * - 所有写库操作经 Prisma 参数绑定（防注入）；Json 字段经 IsPrismaJson 校验（防异常输入）。
 * - 密钥/口令不在此模块出现；审计由扩展拦截器自动写入 AuditEvent（不记明文）。
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============ OwnedAccount ============
  async createOwnedAccount(userId: string, dto: CreateOwnedAccountDto) {
    return this.prisma.client.ownedAccount.create({
      data: {
        userId,
        platform: dto.platform ?? 'wechat',
        name: dto.name,
        position: (dto.position ?? {}) as object,
        audience: (dto.audience ?? {}) as object,
        columns: (dto.columns ?? {}) as object,
        status: dto.status ?? 'active',
      },
    });
  }

  async listOwnedAccounts(userId: string, status?: string) {
    if (status && !OWNED_ACCOUNT_STATUS.has(status)) {
      throw new BadRequestException('非法的 status 过滤值');
    }
    return this.prisma.client.ownedAccount.findMany({
      where: { userId, ...(status ? { status: status as 'active' | 'paused' | 'archived' } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOwnedAccount(userId: string, id: string) {
    const acc = await this.prisma.client.ownedAccount.findFirst({ where: { id, userId } });
    if (!acc) throw new NotFoundException('自有账号不存在或不属于当前用户');
    return acc;
  }

  async updateOwnedAccount(userId: string, id: string, dto: UpdateOwnedAccountDto) {
    await this.requireOwnedAccount(userId, id);
    const data: Record<string, unknown> = {};
    if (dto.platform !== undefined) data.platform = dto.platform;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.position !== undefined) data.position = dto.position as object;
    if (dto.audience !== undefined) data.audience = dto.audience as object;
    if (dto.columns !== undefined) data.columns = dto.columns as object;
    if (dto.status !== undefined) data.status = dto.status;
    if (Object.keys(data).length === 0) return this.getOwnedAccount(userId, id);
    return this.prisma.client.ownedAccount.update({ where: { id }, data });
  }

  async deleteOwnedAccount(userId: string, id: string) {
    await this.requireOwnedAccount(userId, id);
    // delete 经 T1.3 扩展转写为软删（deletedAt），绝不物理删除
    await this.prisma.client.ownedAccount.delete({ where: { id, userId } });
    return { id, deleted: true };
  }

  // ============ ReferenceAccount ============
  async createReferenceAccount(dto: CreateReferenceAccountDto) {
    return this.prisma.client.referenceAccount.create({
      data: {
        platform: dto.platform ?? 'wechat',
        name: dto.name,
        homepageUrl: dto.homepageUrl,
        domain: dto.domain,
        note: dto.note,
      },
    });
  }

  async listReferenceAccounts(platform?: string, q?: string) {
    if (platform && !REFERENCE_PLATFORM_FILTER.has(platform)) {
      throw new BadRequestException('非法的 platform 过滤值');
    }
    return this.prisma.client.referenceAccount.findMany({
      where: {
        ...(platform ? { platform: platform as 'wechat' } : {}),
        ...(q ? { name: { contains: q } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReferenceAccount(id: string) {
    const acc = await this.prisma.client.referenceAccount.findFirst({ where: { id } });
    if (!acc) throw new NotFoundException('对标账号不存在');
    return acc;
  }

  async updateReferenceAccount(id: string, dto: UpdateReferenceAccountDto) {
    await this.requireReferenceAccount(id);
    const data: Record<string, unknown> = {};
    if (dto.platform !== undefined) data.platform = dto.platform;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.homepageUrl !== undefined) data.homepageUrl = dto.homepageUrl;
    if (dto.domain !== undefined) data.domain = dto.domain;
    if (dto.note !== undefined) data.note = dto.note;
    if (Object.keys(data).length === 0) return this.getReferenceAccount(id);
    return this.prisma.client.referenceAccount.update({ where: { id }, data });
  }

  async deleteReferenceAccount(id: string) {
    await this.requireReferenceAccount(id);
    await this.prisma.client.referenceAccount.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ============ AccountStrategy ============
  async createStrategy(userId: string, dto: CreateAccountStrategyDto) {
    // 校验归属的自有账号属于当前用户
    await this.requireOwnedAccount(userId, dto.ownedAccountId);

    const existing = await this.prisma.client.accountStrategy.findMany({
      where: { ownedAccountId: dto.ownedAccountId },
      select: { version: true },
    });
    const version = dto.version ?? nextStrategyVersion(existing.map((e) => e.version));

    const created = await this.prisma.client.accountStrategy.create({
      data: {
        ownedAccountId: dto.ownedAccountId,
        version,
        status: dto.status ?? 'draft',
        position: (dto.position ?? {}) as object,
        audience: (dto.audience ?? {}) as object,
        pillars: (dto.pillars ?? {}) as object,
        titlePref: (dto.titlePref ?? {}) as object,
        structure: (dto.structure ?? {}) as object,
        tone: (dto.tone ?? {}) as object,
        boundaries: (dto.boundaries ?? {}) as object,
        sourceAnalysisIds: (dto.sourceAnalysisIds ?? []) as Prisma.InputJsonValue,
      },
    });

    return created;
  }

  async listStrategies(userId: string, ownedAccountId: string) {
    await this.requireOwnedAccount(userId, ownedAccountId);
    return this.prisma.client.accountStrategy.findMany({
      where: { ownedAccountId },
      orderBy: { version: 'desc' },
    });
  }

  async getStrategy(userId: string, id: string) {
    const s = await this.prisma.client.accountStrategy.findFirst({
      where: { id, ownedAccount: { userId } },
    });
    if (!s) throw new NotFoundException('策略版本不存在或不属于当前用户');
    return s;
  }

  async updateStrategy(userId: string, id: string, dto: UpdateAccountStrategyDto) {
    const current = await this.getStrategy(userId, id);

    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.position !== undefined) data.position = dto.position as object;
    if (dto.audience !== undefined) data.audience = dto.audience as object;
    if (dto.pillars !== undefined) data.pillars = dto.pillars as object;
    if (dto.titlePref !== undefined) data.titlePref = dto.titlePref as object;
    if (dto.structure !== undefined) data.structure = dto.structure as object;
    if (dto.tone !== undefined) data.tone = dto.tone as object;
    if (dto.boundaries !== undefined) data.boundaries = dto.boundaries as object;
    if (dto.sourceAnalysisIds !== undefined) {
      data.sourceAnalysisIds = dto.sourceAnalysisIds as Prisma.InputJsonValue;
    }

    return this.prisma.client.accountStrategy.update({ where: { id }, data });
  }

  async deleteStrategy(userId: string, id: string) {
    const current = await this.getStrategy(userId, id);
    // 软删（扩展转写 deletedAt）；若它正是该账号的默认策略，顺手清空外键指向，避免悬空默认
    if (current.isDefault) {
      await this.prisma.client.ownedAccount.update({
        where: { id: current.ownedAccountId },
        data: { defaultStrategyVersionId: null },
      });
    }
    await this.prisma.client.accountStrategy.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * 将某策略版本原子绑定为自有账号的当前默认策略（T2.5）。
   * - 校验账号归属当前用户、策略归属该账号且未软删。
   * - 同步 isDefault：目标置 true、同账号其它清 false；并写 OwnedAccount.defaultStrategyVersionId。
   *   两处在同一事务内完成，保证一致（T3.2 内容项目将继承此绑定）。
   * - strategyId 为 null/undefined 表示解绑：清外键 + 清该账号全部 isDefault。
   */
  async bindStrategyToAccount(
    userId: string,
    ownedAccountId: string,
    strategyId: string | null,
  ): Promise<Record<string, unknown>> {
    await this.requireOwnedAccount(userId, ownedAccountId);

    if (strategyId !== null && typeof strategyId !== 'string') {
      throw new BadRequestException('strategyId 必须为字符串或 null');
    }

    // 解绑
    if (strategyId === null) {
      const cur = await this.prisma.client.ownedAccount.findFirst({
        where: { id: ownedAccountId },
        select: { defaultStrategyVersionId: true },
      });
      await this.prisma.client.ownedAccount.update({
        where: { id: ownedAccountId },
        data: { defaultStrategyVersionId: null },
      });
      if (cur?.defaultStrategyVersionId) {
        await this.prisma.client.accountStrategy.updateMany({
          where: { ownedAccountId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return this.getOwnedAccount(userId, ownedAccountId);
    }

    // 绑定：校验策略归属 + 未删除
    const strat = await this.prisma.client.accountStrategy.findFirst({
      where: { id: strategyId, ownedAccountId, deletedAt: null },
      select: { id: true },
    });
    if (!strat) throw new NotFoundException('策略版本不存在、不属于该账号或已删除');

    await this.prisma.client.$transaction([
      // 清同账号其它默认
      this.prisma.client.accountStrategy.updateMany({
        where: { ownedAccountId, id: { not: strategyId }, isDefault: true },
        data: { isDefault: false },
      }),
      // 目标置默认
      this.prisma.client.accountStrategy.update({
        where: { id: strategyId },
        data: { isDefault: true },
      }),
      // 账号外键绑定
      this.prisma.client.ownedAccount.update({
        where: { id: ownedAccountId },
        data: { defaultStrategyVersionId: strategyId },
      }),
    ]);

    return this.getOwnedAccount(userId, ownedAccountId);
  }

  // ============ 内部工具 ============
  private async requireOwnedAccount(userId: string, id: string): Promise<void> {
    const acc = await this.prisma.client.ownedAccount.findFirst({ where: { id, userId } });
    if (!acc) throw new NotFoundException('自有账号不存在或不属于当前用户');
  }

  private async requireReferenceAccount(id: string): Promise<void> {
    const acc = await this.prisma.client.referenceAccount.findFirst({ where: { id } });
    if (!acc) throw new NotFoundException('对标账号不存在');
  }
}
