import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PublishStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { getSecretCrypto } from '../../system/crypto.util';
import { SITE_CONFIG_ID } from '../../system/system.service';
import { WeChatPublishProvider } from './wechat.provider';
import {
  buildWechatArticle,
  validateScheduledAt,
} from './wechat-publish.util';

export interface PublishState {
  status: string | null;
  publishStatus: PublishStatus | null;
  externalMediaId: string | null;
  externalUrl: string | null;
  publishError: string | null;
  scheduledAt: string | null;
  publishTaskId: string | null;
}

export interface SyncDraftResult {
  projectId: string;
  mediaId: string;
  publishStatus: PublishStatus;
}

export interface SubmitResult {
  projectId: string;
  publishStatus: PublishStatus;
  articleUrl?: string;
  pending?: boolean;
  publishId?: string;
}

export interface MassResult {
  projectId: string;
  publishStatus: PublishStatus;
  msgId: string;
  scheduledAt?: string | null;
}

function formatWechatSchedule(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/**
 * 公众号发布执行服务（T3.9）。
 * - 凭据经 SiteConfig（AES-256-GCM 加密的 AppID + AppSecret）解密取出，内存仅用不落日志。
 * - 草稿箱同步(add_draft) / 发布(freepublish submit+get) / 群发(mass sendall，可选定时) 三步，回写 media_id 与文章链接到 ContentProject。
 * - 状态守卫：仅审核通过(APPROVED)或已发布态可发起发布；正文须有已保存版本。
 * - 全部走 Prisma 参数绑定；无 DB / 无凭据时抛清晰错误（对应「待环境：未配置公众号资质」）。
 */
@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);
  private readonly provider: WeChatPublishProvider;

  constructor(
    private readonly prisma: PrismaService,
    provider?: WeChatPublishProvider,
  ) {
    this.provider = provider ?? new WeChatPublishProvider();
  }

  /** 读取并解密公众号凭据（AppID + AppSecret）；缺失则抛清晰错误。 */
  private async resolveCredentials(): Promise<{ appId: string; appSecret: string }> {
    if (!this.prisma.isConnected) {
      throw new Error('公众号发布失败：数据库未连接（待 PG 环境）');
    }
    const row = await this.prisma.client.siteConfig.findUnique({ where: { id: SITE_CONFIG_ID } });
    const appIdEnc = row?.defaultWechatAppIdEncrypted;
    const appSecretEnc = row?.defaultWechatAppSecretEncrypted;
    if (!appIdEnc || !appSecretEnc) {
      throw new Error('未配置公众号 AppID / AppSecret（请在系统设置中填写并经加密入库）');
    }
    let appId = '';
    let appSecret = '';
    try {
      appId = getSecretCrypto().decrypt(appIdEnc);
      appSecret = getSecretCrypto().decrypt(appSecretEnc);
    } catch (e) {
      throw new Error(`公众号凭据解密失败（请确认 APP_MASTER_KEY 与入库时一致）：${(e as Error).message}`);
    }
    if (!appId || !appSecret) {
      throw new Error('公众号凭据解密后为空，请重新在系统设置中配置');
    }
    return { appId, appSecret };
  }

  /** 取发布所需的内容项目 + 正文 + 标题。 */
  private async loadForPublish(projectId: string) {
    const p = await this.prisma.client.contentProject.findUnique({
      where: { id: projectId },
      include: {
        currentVersion: { select: { id: true, content: true } },
        selectedTitle: { select: { id: true, text: true } },
        topic: { select: { id: true, title: true } },
      },
    });
    if (!p) throw new NotFoundException(`内容项目不存在：${projectId}`);
    const content =
      p.currentVersion?.content ?? (typeof p.workingContent === 'string' ? p.workingContent : '');
    if (!content.trim()) {
      throw new BadRequestException('请先保存至少一个版本（或填写正文）再发布');
    }
    const title =
      (p.selectedTitle?.text || p.topic?.title || '').toString().trim() || '未命名文章';
    return { project: p, content, title };
  }

  /** T3.9 步骤一：同步草稿箱（add_draft）→ 回写 media_id，状态 DRAFT_SYNCED。 */
  async syncDraft(projectId: string, userId?: string): Promise<SyncDraftResult> {
    const { project, content, title } = await this.loadForPublish(projectId);
    if (!['APPROVED', 'PUBLISHED'].includes(project.status)) {
      throw new BadRequestException('仅审核通过（APPROVED）或已发布态可同步草稿箱，请先完成审核通过');
    }
    const { appId, appSecret } = await this.resolveCredentials();
    const token = await this.provider.getAccessToken(appId, appSecret);
    const article = buildWechatArticle({ title, contentMd: content });
    const { mediaId } = await this.provider.addDraft(token, [article]);
    const updated = await this.prisma.client.contentProject.update({
      where: { id: projectId },
      data: {
        externalMediaId: mediaId,
        publishStatus: 'DRAFT_SYNCED',
        publishError: null,
        scheduledAt: null,
      },
    });
    this.logger.log(`内容项目 ${projectId} 已同步草稿箱（media_id=${mediaId}）`);
    return { projectId, mediaId, publishStatus: updated.publishStatus! };
  }

  /** T3.9 步骤二：正式发布（freepublish submit + 轮询 get 拿 article_url）→ 回写链接，状态 PUBLISHED。 */
  async submitPublish(projectId: string, userId?: string): Promise<SubmitResult> {
    const project = await this.prisma.client.contentProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`内容项目不存在：${projectId}`);
    if (!project.externalMediaId) {
      throw new BadRequestException('请先「同步草稿箱」拿到 media_id 再发布');
    }
    if (!['APPROVED', 'PUBLISHED', 'DRAFT_SYNCED'].includes(project.status) && project.publishStatus !== 'DRAFT_SYNCED') {
      throw new BadRequestException('当前状态不允许发布，请先同步草稿箱并通过审核');
    }
    const { appId, appSecret } = await this.resolveCredentials();
    const token = await this.provider.getAccessToken(appId, appSecret);
    const { publishId } = await this.provider.freepublishSubmit(token, project.externalMediaId);

    // 轮询发布状态（微信为异步），最多 6 次，间隔 1s。
    let articleUrl: string | undefined;
    let finalStatus = 'PUBLISHING';
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await this.provider.freepublishGet(token, publishId);
      finalStatus = r.status;
      if (r.status === 'SUCCESS' || r.articleUrl) {
        articleUrl = r.articleUrl;
        break;
      }
      if (attempt < 5) await new Promise((res) => setTimeout(res, 1000));
    }

    if (articleUrl) {
      const updated = await this.prisma.client.contentProject.update({
        where: { id: projectId },
        data: {
          externalUrl: articleUrl,
          publishStatus: 'PUBLISHED',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishError: null,
          publishTaskId: publishId,
        },
      });
      this.logger.log(`内容项目 ${projectId} 已发布（article_url=${articleUrl}）`);
      return { projectId, publishStatus: updated.publishStatus!, articleUrl };
    }

    // 仍发布中：保留 publishTaskId 供前端轮询。
    await this.prisma.client.contentProject.update({
      where: { id: projectId },
      data: { publishTaskId: publishId, publishStatus: 'DRAFT_SYNCED' },
    });
    return { projectId, publishStatus: 'DRAFT_SYNCED', pending: true, publishId };
  }

  /** T3.9 步骤三：群发（mass sendall），可选定时 → 回写 msg_id / 定时状态。 */
  async massSend(
    projectId: string,
    opts: { scheduleTime?: string } = {},
    userId?: string,
  ): Promise<MassResult> {
    const project = await this.prisma.client.contentProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`内容项目不存在：${projectId}`);
    if (!project.externalMediaId) {
      throw new BadRequestException('请先「同步草稿箱」拿到 media_id 再群发');
    }
    if (!['APPROVED', 'PUBLISHED', 'DRAFT_SYNCED'].includes(project.status) && project.publishStatus !== 'DRAFT_SYNCED') {
      throw new BadRequestException('当前状态不允许群发，请先同步草稿箱并通过审核');
    }

    let scheduleTime: string | undefined;
    let scheduledAt: Date | undefined;
    if (opts.scheduleTime) {
      const v = validateScheduledAt(opts.scheduleTime);
      if (!v.ok) throw new BadRequestException(v.error);
      scheduledAt = v.date;
      scheduleTime = formatWechatSchedule(v.date!);
    }

    const { appId, appSecret } = await this.resolveCredentials();
    const token = await this.provider.getAccessToken(appId, appSecret);
    const { msgId } = await this.provider.massSendAll(token, project.externalMediaId, { scheduleTime });

    const publishStatus: PublishStatus = scheduleTime ? 'SCHEDULED' : 'PUBLISHED';
    const data: Record<string, unknown> = {
      publishTaskId: msgId,
      publishStatus,
      publishError: null,
    };
    if (scheduleTime) {
      data.scheduledAt = scheduledAt;
    } else {
      data.status = 'PUBLISHED';
      data.publishedAt = new Date();
    }
    const updated = await this.prisma.client.contentProject.update({ where: { id: projectId }, data });
    this.logger.log(
      `内容项目 ${projectId} 已提交群发（msg_id=${msgId}${scheduleTime ? ` 定时=${scheduleTime}` : ''}）`,
    );
    return {
      projectId,
      publishStatus: updated.publishStatus!,
      msgId,
      scheduledAt: updated.scheduledAt ? updated.scheduledAt.toISOString() : null,
    };
  }

  /** 读取内容项目当前发布状态（供前端展示）。 */
  async getPublishState(projectId: string): Promise<PublishState> {
    const p = await this.prisma.client.contentProject.findUnique({ where: { id: projectId } });
    if (!p) throw new NotFoundException(`内容项目不存在：${projectId}`);
    return {
      status: p.status,
      publishStatus: p.publishStatus,
      externalMediaId: p.externalMediaId,
      externalUrl: p.externalUrl,
      publishError: p.publishError,
      scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
      publishTaskId: p.publishTaskId,
    };
  }
}
