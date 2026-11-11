import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PublishService } from '../publish/publish.service';
import {
  STATUS_OPTIONS,
  type BatchRequest,
  type BatchType,
  planTagPatch,
  normalizeTags,
} from './batch.util';

export interface BatchItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchItemResult[];
}

/**
 * T4.5 批量操作服务。
 * 支持三类对象（topic / title / project）的四种动作：
 * - setStatus：批量状态变更（受各类型枚举约束）。
 * - tag：批量打标签（add / remove / replace）。
 * - delete：批量删除（topic/project 软删经 T1.3 扩展；title 为叶子实体硬删）。
 * - publish：批量发布（project 仅，走 T3.9 发布链路：同步草稿箱 + 正式发布）。
 * 逐条执行、单条失败不阻断整批；全部走 Prisma 参数绑定（防注入），密钥不落日志。
 */
@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publish: PublishService,
  ) {}

  async runBatch(req: BatchRequest, userId?: string): Promise<BatchResult> {
    const results: BatchItemResult[] = [];
    for (const id of req.ids) {
      try {
        await this.applyOne(req, id, userId);
        results.push({ id, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`批量 ${req.type}/${req.action} 失败 ${id}: ${msg}`);
        results.push({ id, ok: false, error: msg.slice(0, 200) });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { total: results.length, succeeded, failed: results.length - succeeded, results };
  }

  private async applyOne(req: BatchRequest, id: string, userId?: string): Promise<void> {
    switch (req.type) {
      case 'topic':
        return this.applyTopic(req, id);
      case 'title':
        return this.applyTitle(req, id);
      case 'project':
        return this.applyProject(req, id, userId);
    }
  }

  // ---------- Topic ----------
  private async applyTopic(req: BatchRequest, id: string): Promise<void> {
    if (req.action === 'delete') {
      await this.prisma.client.topic.delete({ where: { id } }); // T1.3 软删作用域
      return;
    }
    if (req.action === 'setStatus') {
      assertStatus(req.type, req.status);
      await this.prisma.client.topic.update({ where: { id }, data: { status: req.status as Prisma.TopicUpdateInput['status'] } });
      return;
    }
    if (req.action === 'tag') {
      const cur = await this.prisma.client.topic.findUnique({ where: { id }, select: { tags: true } });
      if (!cur) throw new Error('选题不存在');
      const next = planTagPatch(normalizeTags(cur.tags), req.tagMode ?? 'add', req.tags ?? []);
      await this.prisma.client.topic.update({ where: { id }, data: { tags: next as Prisma.InputJsonValue } });
      return;
    }
    throw new Error(`topic 不支持动作 ${req.action}`);
  }

  // ---------- TitleCandidate ----------
  private async applyTitle(req: BatchRequest, id: string): Promise<void> {
    if (req.action === 'delete') {
      await this.prisma.client.titleCandidate.delete({ where: { id } }); // 叶子实体硬删
      return;
    }
    if (req.action === 'setStatus') {
      assertStatus(req.type, req.status);
      await this.prisma.client.titleCandidate.update({
        where: { id },
        data: { status: req.status as Prisma.TitleCandidateUpdateInput['status'] },
      });
      return;
    }
    if (req.action === 'tag') {
      const cur = await this.prisma.client.titleCandidate.findUnique({ where: { id }, select: { tags: true } });
      if (!cur) throw new Error('标题候选不存在');
      const next = planTagPatch(normalizeTags(cur.tags), req.tagMode ?? 'add', req.tags ?? []);
      await this.prisma.client.titleCandidate.update({ where: { id }, data: { tags: next as Prisma.InputJsonValue } });
      return;
    }
    throw new Error(`title 不支持动作 ${req.action}`);
  }

  // ---------- ContentProject ----------
  private async applyProject(req: BatchRequest, id: string, userId?: string): Promise<void> {
    if (req.action === 'delete') {
      await this.prisma.client.contentProject.delete({ where: { id } }); // T1.3 软删作用域
      return;
    }
    if (req.action === 'setStatus') {
      assertStatus(req.type, req.status);
      await this.prisma.client.contentProject.update({
        where: { id },
        data: { status: req.status as Prisma.ContentProjectUpdateInput['status'] },
      });
      return;
    }
    if (req.action === 'tag') {
      const cur = await this.prisma.client.contentProject.findUnique({ where: { id }, select: { tags: true } });
      if (!cur) throw new Error('内容项目不存在');
      const next = planTagPatch(cur.tags ?? [], req.tagMode ?? 'add', req.tags ?? []); // content_projects.tags 为 String[]
      await this.prisma.client.contentProject.update({ where: { id }, data: { tags: { set: next } } });
      return;
    }
    if (req.action === 'publish') {
      // T3.9 发布链路：同步草稿箱 → 正式发布（需审核通过态 + 已保存版本 + 公众号凭据）。
      await this.publish.syncDraft(id, userId);
      await this.publish.submitPublish(id, userId);
      return;
    }
    throw new Error(`project 不支持动作 ${req.action}`);
  }
}

function assertStatus(type: BatchType, status?: string): void {
  if (!status || !STATUS_OPTIONS[type].includes(status)) {
    throw new Error(`状态 ${status ?? '空'} 不被 ${type} 支持`);
  }
}
