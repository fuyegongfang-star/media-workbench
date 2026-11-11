import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateLaunchPlanDto } from './dto/create-launch-plan.dto';
import { UpdateLaunchPlanDto } from './dto/update-launch-plan.dto';
import { CreateLaunchTaskDto } from './dto/create-launch-task.dto';
import { UpdateLaunchTaskDto } from './dto/update-launch-task.dto';
import { AddImageItemDto } from './dto/add-image-item.dto';
import { UpdateImageItemDto } from './dto/update-image-item.dto';
import { ReorderImageItemsDto } from './dto/reorder-image-items.dto';
import {
  computePlanProgress,
  deriveTaskStatusFromProject,
  nextImageSortOrder,
  PlanProgress,
  reorderImages,
} from './launch.util';

const PLAN_STATUSES = new Set(['draft', 'active', 'paused', 'done']);
const TASK_STATUSES = new Set(['pending', 'in_progress', 'done', 'skipped']);

function toDateOrUndefined(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function coerceMaterialRefs(value: unknown): Prisma.InputJsonValue {
  return Array.isArray(value) ? (value as Prisma.InputJsonValue) : ([] as unknown as Prisma.InputJsonValue);
}

/**
 * 起号计划服务（T4.1 图文起号计划）。
 * - 计划归属：经 ownedAccount.userId 与当前登录用户隔离。
 * - 软删复用 T1.3 扩展：launchPlan.delete 转写为 deletedAt（LaunchPlan 已在 SOFT_DELETE_MODELS）。
 * - LaunchTask 为计划子实体，物理删除（无 deletedAt），删除计划时一并清理其任务。
 * - 任务状态随关联内容项目更新：项目 PUBLISHED/ARCHIVED → 任务 done（deriveTaskStatusFromProject 纯函数，不反向降级）。
 * - 进度统计（computePlanProgress）为 T4.1 明确要求的交付项。
 */
@Injectable()
export class LaunchService {
  private readonly logger = new Logger(LaunchService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============ 计划 ============
  async listPlans(
    userId: string,
    filter: { ownedAccountId?: string; type?: string },
  ) {
    if (filter.ownedAccountId) {
      await this.requireOwnedAccount(userId, filter.ownedAccountId);
    }
    if (filter.type && !['article', 'image'].includes(filter.type)) {
      throw new BadRequestException('非法的 type 过滤值');
    }
    return this.prisma.client.launchPlan.findMany({
      where: {
        ownedAccountId: filter.ownedAccountId,
        ...(filter.type ? { type: filter.type as 'article' | 'image' } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tasks: true } } },
    });
  }

  async createPlan(userId: string, dto: CreateLaunchPlanDto) {
    await this.requireOwnedAccount(userId, dto.ownedAccountId);
    return this.prisma.client.launchPlan.create({
      data: {
        ownedAccountId: dto.ownedAccountId,
        type: dto.type,
        goal: dto.goal,
        start: toDateOrUndefined(dto.start),
        end: toDateOrUndefined(dto.end),
        frequency: dto.frequency,
        status: dto.status ?? 'draft',
      },
    });
  }

  async getPlan(userId: string, id: string) {
    const plan = await this.prisma.client.launchPlan.findFirst({
      where: { id, ownedAccount: { userId } },
      include: { tasks: { orderBy: { createdAt: 'asc' }, include: { imageItems: { orderBy: { sortOrder: 'asc' } } } } },
    });
    if (!plan) throw new NotFoundException('起号计划不存在或不属于当前用户');
    return plan;
  }

  async updatePlan(userId: string, id: string, dto: UpdateLaunchPlanDto) {
    await this.requirePlanOwnedByUser(userId, id);
    const data: Record<string, unknown> = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.goal !== undefined) data.goal = dto.goal;
    if (dto.start !== undefined) data.start = toDateOrUndefined(dto.start);
    if (dto.end !== undefined) data.end = toDateOrUndefined(dto.end);
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.status !== undefined) {
      if (!PLAN_STATUSES.has(dto.status)) throw new BadRequestException('非法的 status 值');
      data.status = dto.status;
    }
    if (Object.keys(data).length === 0) return this.getPlan(userId, id);
    return this.prisma.client.launchPlan.update({ where: { id }, data });
  }

  async deletePlan(userId: string, id: string) {
    await this.requirePlanOwnedByUser(userId, id);
    // 软删计划（扩展转写 deletedAt）+ 物理清理其子任务
    await this.prisma.client.launchPlan.delete({ where: { id } });
    await this.prisma.client.launchTask.deleteMany({ where: { planId: id } });
    return { id, deleted: true };
  }

  // ============ 任务 ============
  async createTask(userId: string, planId: string, dto: CreateLaunchTaskDto) {
    await this.requirePlanOwnedByUser(userId, planId);
    const created = await this.prisma.client.launchTask.create({
      data: {
        planId,
        type: dto.type,
        title: dto.title,
        caption: dto.caption,
        materialRefs: coerceMaterialRefs(dto.materialRefs),
        projectId: dto.projectId,
        scheduledAt: toDateOrUndefined(dto.scheduledAt),
        status: 'pending',
      },
    });
    // 若创建时即关联项目，立即按项目状态推导任务状态
    if (dto.projectId) {
      return this.applyProjectStatus(created.id);
    }
    return created;
  }

  async updateTask(userId: string, taskId: string, dto: UpdateLaunchTaskDto) {
    const task = await this.requireTaskOwnedByUser(userId, taskId);
    const data: Record<string, unknown> = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.caption !== undefined) data.caption = dto.caption;
    if (dto.materialRefs !== undefined) data.materialRefs = coerceMaterialRefs(dto.materialRefs);
    if (dto.projectId !== undefined) data.projectId = dto.projectId; // 允许 null 解除关联
    if (dto.scheduledAt !== undefined) data.scheduledAt = toDateOrUndefined(dto.scheduledAt);
    if (dto.status !== undefined) {
      if (!TASK_STATUSES.has(dto.status)) throw new BadRequestException('非法的 status 值');
      data.status = dto.status;
    }

    const updated = await this.prisma.client.launchTask.update({ where: { id: taskId }, data });

    // 关联了项目（且未手动指定 status）→ 以项目发布状态推导
    if (dto.projectId && dto.status === undefined) {
      return this.applyProjectStatus(taskId);
    }
    return updated;
  }

  async deleteTask(userId: string, taskId: string) {
    await this.requireTaskOwnedByUser(userId, taskId);
    await this.prisma.client.launchTask.delete({ where: { id: taskId } });
    return { id: taskId, deleted: true };
  }

  /**
   * 单任务按关联项目状态推导（T4.1 "状态随项目更新"）。
   * 返回更新后的任务；若未关联项目则保持原状。
   */
  async syncTaskFromProject(userId: string, taskId: string) {
    await this.requireTaskOwnedByUser(userId, taskId);
    return this.applyProjectStatus(taskId);
  }

  /** 计划级对账：遍历任务，凡关联项目者按其发布状态推导，最后返回进度统计。 */
  async syncPlan(userId: string, planId: string): Promise<PlanProgress> {
    await this.requirePlanOwnedByUser(userId, planId);
    const tasks = await this.prisma.client.launchTask.findMany({ where: { planId } });
    for (const t of tasks) {
      if (t.projectId) await this.applyProjectStatus(t.id);
    }
    return this.getPlanProgress(userId, planId);
  }

  async getPlanProgress(userId: string, planId: string): Promise<PlanProgress> {
    await this.requirePlanOwnedByUser(userId, planId);
    const tasks = await this.prisma.client.launchTask.findMany({
      where: { planId },
      select: { status: true, projectId: true },
    });
    return computePlanProgress(tasks);
  }

  // ============ 图片组（T4.2 贴图起号计划） ============
  /** 列出某图片组（任务）的有序图片项。 */
  async listImageItems(userId: string, taskId: string) {
    await this.requireTaskOwnedByUser(userId, taskId);
    return this.prisma.client.launchImageItem.findMany({
      where: { taskId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** 向图片组新增一张图片（取现有最大 sortOrder + 1，或显式指定）。 */
  async addImageItem(userId: string, taskId: string, dto: AddImageItemDto) {
    await this.requireTaskOwnedByUser(userId, taskId);
    const existing = await this.prisma.client.launchImageItem.findMany({
      where: { taskId },
      select: { sortOrder: true },
    });
    const sortOrder = dto.sortOrder ?? nextImageSortOrder(existing.map((e) => e.sortOrder));
    return this.prisma.client.launchImageItem.create({
      data: { taskId, assetId: dto.assetId, caption: dto.caption ?? null, sortOrder },
    });
  }

  /** 更新单张图片的配文或顺序。 */
  async updateImageItem(userId: string, itemId: string, dto: UpdateImageItemDto) {
    await this.requireImageItemOwnedByUser(userId, itemId);
    const data: Record<string, unknown> = {};
    if (dto.caption !== undefined) data.caption = dto.caption;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (Object.keys(data).length === 0) {
      const found = await this.prisma.client.launchImageItem.findFirst({ where: { id: itemId } });
      if (!found) throw new NotFoundException('图片项不存在');
      return found;
    }
    return this.prisma.client.launchImageItem.update({ where: { id: itemId }, data });
  }

  /** 删除一张图片。 */
  async removeImageItem(userId: string, itemId: string) {
    await this.requireImageItemOwnedByUser(userId, itemId);
    await this.prisma.client.launchImageItem.delete({ where: { id: itemId } });
    return { id: itemId, deleted: true };
  }

  /**
   * 拖拽重排：按前端提交顺序回写 sortOrder。
   * 仅信任服务端真实存在的 id（reorderImages 丢弃伪造/多余 id）。
   */
  async reorderImageItems(userId: string, taskId: string, dto: ReorderImageItemsDto) {
    await this.requireTaskOwnedByUser(userId, taskId);
    const existing = await this.prisma.client.launchImageItem.findMany({
      where: { taskId },
      select: { id: true },
    });
    const plan = reorderImages(dto.orderedIds, existing.map((e) => e.id));
    await this.prisma.client.$transaction(
      plan.map((p) =>
        this.prisma.client.launchImageItem.update({ where: { id: p.id }, data: { sortOrder: p.sortOrder } }),
      ),
    );
    return this.prisma.client.launchImageItem.findMany({
      where: { taskId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ============ 内部工具 ============
  /** 按关联项目状态重写任务状态并回写 publishedAt。 */
  private async applyProjectStatus(taskId: string) {
    const task = await this.prisma.client.launchTask.findFirst({ where: { id: taskId } });
    if (!task) throw new NotFoundException('起号任务不存在');
    if (!task.projectId) return task; // 未关联项目，保持原状

    const project = await this.prisma.client.contentProject.findFirst({
      where: { id: task.projectId },
      select: { status: true, publishedAt: true },
    });
    const derived = deriveTaskStatusFromProject(
      { status: task.status, publishedAt: task.publishedAt },
      project ? { status: project.status, publishedAt: project.publishedAt } : null,
    );
    return this.prisma.client.launchTask.update({
      where: { id: taskId },
      data: { status: derived.status, publishedAt: derived.publishedAt },
    });
  }

  private async requireOwnedAccount(userId: string, id: string): Promise<void> {
    const acc = await this.prisma.client.ownedAccount.findFirst({ where: { id, userId } });
    if (!acc) throw new NotFoundException('自有账号不存在或不属于当前用户');
  }

  private async requirePlanOwnedByUser(userId: string, id: string): Promise<void> {
    const plan = await this.prisma.client.launchPlan.findFirst({
      where: { id, ownedAccount: { userId } },
    });
    if (!plan) throw new NotFoundException('起号计划不存在或不属于当前用户');
  }

  private async requireTaskOwnedByUser(userId: string, taskId: string) {
    const task = await this.prisma.client.launchTask.findFirst({
      where: { id: taskId, plan: { ownedAccount: { userId } } },
    });
    if (!task) throw new NotFoundException('起号任务不存在或不属于当前用户');
    return task;
  }

  private async requireImageItemOwnedByUser(userId: string, itemId: string) {
    const item = await this.prisma.client.launchImageItem.findFirst({
      where: { id: itemId, task: { plan: { ownedAccount: { userId } } } },
    });
    if (!item) throw new NotFoundException('图片项不存在或不属于当前用户');
    return item;
  }
}
