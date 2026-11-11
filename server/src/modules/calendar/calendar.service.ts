import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type CalendarItem,
  type CalendarKind,
  dateToKey,
  makeCalendarItem,
  normalizeCalendarQuery,
  validateRescheduleDate,
} from './calendar.util';

/**
 * 内容日历服务（T4.4）。
 * - getCalendar：跨「选题/标题/内容项目/起号任务」四类实体，按日期锚点聚合为统一条目，
 *   支持日期范围与（可选）自有账号过滤；归属校验经 ownedAccount.userId 隔离。
 * - reschedule：拖拽改期，按 kind 回写到对应实体的日期字段（topic.plannedAt /
 *   contentProject.plannedPublishAt / launchTask.scheduledAt；标题改期联动父选题 plannedAt）。
 * 全部走 Prisma 参数绑定（防注入）；密钥不经此路径。
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCalendar(input: {
    from?: string;
    to?: string;
    userId: string;
    ownedAccountId?: string;
  }): Promise<{ items: CalendarItem[]; range: { from: string; to: string } }> {
    const { from: fromDate, to: toExclusive } = normalizeCalendarQuery({ from: input.from, to: input.to });
    const { userId, ownedAccountId } = input;

    // 账号名映射（选题/内容项目/起号任务共用）
    const accounts = await this.prisma.client.ownedAccount.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const accountName = new Map<string, string>(accounts.map((a) => [a.id, a.name]));

    const [topics, titles, projects, tasks] = await Promise.all([
      this.prisma.client.topic.findMany({
        where: this.topicWhere(fromDate, toExclusive, userId, ownedAccountId),
        include: { strategy: { select: { ownedAccountId: true } } },
      }),
      this.prisma.client.titleCandidate.findMany({
        where: this.titleWhere(fromDate, toExclusive, userId, ownedAccountId),
        include: { topic: { select: { plannedAt: true, strategy: { select: { ownedAccountId: true } } } } },
      }),
      this.prisma.client.contentProject.findMany({
        where: this.projectWhere(fromDate, toExclusive, userId, ownedAccountId),
        include: {
          ownedAccount: { select: { name: true } },
          topic: { select: { title: true } },
          selectedTitle: { select: { text: true } },
        },
      }),
      this.prisma.client.launchTask.findMany({
        where: this.launchWhere(fromDate, toExclusive, userId, ownedAccountId),
        include: { plan: { select: { ownedAccountId: true } } },
      }),
    ]);

    const items: CalendarItem[] = [];

    for (const t of topics) {
      items.push(
        makeCalendarItem(
          'topic',
          t.id,
          t.title,
          t.status,
          t.plannedAt,
          (t.strategy?.ownedAccountId && accountName.get(t.strategy.ownedAccountId)) || null,
        ),
      );
    }

    for (const c of titles) {
      items.push(
        makeCalendarItem(
          'title',
          c.id,
          c.text,
          c.status,
          c.topic?.plannedAt ?? null,
          (c.topic?.strategy?.ownedAccountId && accountName.get(c.topic.strategy.ownedAccountId)) || null,
        ),
      );
    }

    for (const p of projects) {
      const title = p.selectedTitle?.text ?? p.topic?.title ?? '未命名内容项目';
      items.push(
        makeCalendarItem('content', p.id, title, p.status, p.plannedPublishAt, p.ownedAccount?.name ?? null),
      );
    }

    for (const tk of tasks) {
      items.push(
        makeCalendarItem(
          'launch',
          tk.id,
          tk.title ?? '起号任务',
          tk.status,
          tk.scheduledAt,
          (tk.plan?.ownedAccountId && accountName.get(tk.plan.ownedAccountId)) || null,
        ),
      );
    }

    return {
      items,
      range: { from: dateToKey(fromDate), to: dateToKey(toExclusive) },
    };
  }

  /** 拖拽改期：按 kind 回写日期字段，并做归属校验。返回更新后的统一条目。 */
  async reschedule(
    kind: string,
    id: string,
    date: string,
    userId: string,
  ): Promise<CalendarItem> {
    const v = validateRescheduleDate(date);
    if (!v.ok || !v.value) throw new BadRequestException(v.error);
    const target = v.value;

    switch (kind as CalendarKind) {
      case 'topic': {
        await this.requireTopic(id, userId);
        const updated = await this.prisma.client.topic.update({
          where: { id },
          data: { plannedAt: target },
          include: { strategy: { select: { ownedAccountId: true } } },
        });
        const accName = updated.strategy?.ownedAccountId
          ? await this.accountNameFor(updated.strategy.ownedAccountId, userId)
          : null;
        return makeCalendarItem(
          'topic',
          updated.id,
          updated.title,
          updated.status,
          updated.plannedAt,
          accName,
        );
      }
      case 'content': {
        await this.requireContentProject(id, userId);
        const updated = await this.prisma.client.contentProject.update({
          where: { id },
          data: { plannedPublishAt: target },
          include: {
            ownedAccount: { select: { name: true } },
            topic: { select: { title: true } },
            selectedTitle: { select: { text: true } },
          },
        });
        return makeCalendarItem(
          'content',
          updated.id,
          updated.selectedTitle?.text ?? updated.topic?.title ?? '未命名内容项目',
          updated.status,
          updated.plannedPublishAt,
          updated.ownedAccount?.name ?? null,
        );
      }
      case 'launch': {
        await this.requireLaunchTask(id, userId);
        const updated = await this.prisma.client.launchTask.update({
          where: { id },
          data: { scheduledAt: target },
          include: { plan: { select: { ownedAccountId: true } } },
        });
        const accName = updated.plan?.ownedAccountId
          ? await this.accountNameFor(updated.plan.ownedAccountId, userId)
          : null;
        return makeCalendarItem(
          'launch',
          updated.id,
          updated.title ?? '起号任务',
          updated.status,
          updated.scheduledAt,
          accName,
        );
      }
      case 'title': {
        // 标题无独立日期，拖拽联动父选题 plannedAt（整簇移动）
        const title = await this.requireTitle(id, userId);
        if (!title.topicId) throw new BadRequestException('该标题未关联选题，无法排期');
        const updatedTopic = await this.prisma.client.topic.update({
          where: { id: title.topicId },
          data: { plannedAt: target },
          include: { strategy: { select: { ownedAccountId: true } } },
        });
        const accName = updatedTopic.strategy?.ownedAccountId
          ? await this.accountNameFor(updatedTopic.strategy.ownedAccountId, userId)
          : null;
        return makeCalendarItem(
          'title',
          title.id,
          title.text,
          title.status,
          updatedTopic.plannedAt,
          accName,
        );
      }
      default:
        throw new BadRequestException('非法的日历项类型');
    }
  }

  // ============ 内部：归属校验 + 日期范围 where ============

  private async accountNameFor(ownedAccountId: string, userId: string): Promise<string | null> {
    const acc = await this.prisma.client.ownedAccount.findFirst({
      where: { id: ownedAccountId, userId },
      select: { name: true },
    });
    return acc?.name ?? null;
  }

  private topicWhere(
    from: Date,
    to: Date,
    userId: string,
    ownedAccountId?: string,
  ): Prisma.TopicWhereInput {
    const w: Prisma.TopicWhereInput = { plannedAt: { not: null, gte: from, lt: to } };
    if (ownedAccountId) w.strategy = { ownedAccountId };
    else w.strategy = { ownedAccount: { userId } };
    return w;
  }

  private titleWhere(
    from: Date,
    to: Date,
    userId: string,
    ownedAccountId?: string,
  ): Prisma.TitleCandidateWhereInput {
    const base: Prisma.TitleCandidateWhereInput = {
      topic: { plannedAt: { not: null, gte: from, lt: to } },
    };
    if (ownedAccountId) base.topic = { ...(base.topic as object), strategy: { ownedAccountId } } as Prisma.TitleCandidateWhereInput['topic'];
    else base.topic = { ...(base.topic as object), strategy: { ownedAccount: { userId } } } as Prisma.TitleCandidateWhereInput['topic'];
    return base;
  }

  private projectWhere(
    from: Date,
    to: Date,
    userId: string,
    ownedAccountId?: string,
  ): Prisma.ContentProjectWhereInput {
    const w: Prisma.ContentProjectWhereInput = { plannedPublishAt: { not: null, gte: from, lt: to } };
    if (ownedAccountId) w.ownedAccountId = ownedAccountId;
    else w.ownedAccount = { userId };
    return w;
  }

  private launchWhere(
    from: Date,
    to: Date,
    userId: string,
    ownedAccountId?: string,
  ): Prisma.LaunchTaskWhereInput {
    const w: Prisma.LaunchTaskWhereInput = { scheduledAt: { not: null, gte: from, lt: to } };
    if (ownedAccountId) w.plan = { ownedAccountId };
    else w.plan = { ownedAccount: { userId } };
    return w;
  }

  private async requireTopic(id: string, userId: string) {
    const t = await this.prisma.client.topic.findFirst({
      where: { id, strategy: { ownedAccount: { userId } } },
    });
    if (!t) throw new NotFoundException('选题不存在或不属于当前用户');
    return t;
  }

  private async requireContentProject(id: string, userId: string) {
    const p = await this.prisma.client.contentProject.findFirst({
      where: { id, ownedAccount: { userId } },
    });
    if (!p) throw new NotFoundException('内容项目不存在或不属于当前用户');
    return p;
  }

  private async requireLaunchTask(id: string, userId: string) {
    const t = await this.prisma.client.launchTask.findFirst({
      where: { id, plan: { ownedAccount: { userId } } },
    });
    if (!t) throw new NotFoundException('起号任务不存在或不属于当前用户');
    return t;
  }

  private async requireTitle(id: string, userId: string) {
    const c = await this.prisma.client.titleCandidate.findFirst({
      where: { id, topic: { strategy: { ownedAccount: { userId } } } },
    });
    if (!c) throw new NotFoundException('标题不存在或不属于当前用户');
    return c;
  }
}
