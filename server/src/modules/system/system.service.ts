import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskQueueService } from '../tasks/queue/queue.service';
import { getSecretCrypto, maskSecret } from './crypto.util';
import { mergeCompliance } from './system.util';
import { mergeSeo, publicSeo, type SiteSeoConfig } from './seo.util';
import { type NotificationConfig, countEnabledChannels, defaultNotifications, mergeNotifications } from '../notification/notification.util';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

/** 站点设置单例行固定 id（强制单例，避免多行）。 */
export const SITE_CONFIG_ID = '00000000-0000-0000-0000-000000000001';

export interface SiteSettingsView {
  siteName: string;
  siteDesc: string | null;
  defaultWechatAppIdMasked: string;
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
  compliance: Record<string, unknown>;
  allowRegistration: boolean; // T6.4 自助注册开关
  seo: SiteSeoConfig; // T6.7 品牌 / TDK / SEO·GEO / 页脚
  updatedAt: string | null;
}

/**
 * 公开站点元信息（T6.7）：未登录首页渲染标题、Logo、页脚所需。
 * 只含可公开字段，绝不含凭据、供应商、用户、状态等任何内部信息。
 */
export interface PublicSiteView {
  siteName: string;
  siteDesc: string | null;
  seo: SiteSeoConfig;
  updatedAt: string | null;
}

/**
 * 系统设置服务（T1.8）：站点设置单例（基础信息 / 默认公众号 AppID 加密 / 合规开关）+ 状态总览。
 * - AppID 经 §3.1 AES-256-GCM 加密入库，读取时仅返回脱敏串；日志绝不打印明文。
 * - 写库全部走 Prisma 参数绑定（防注入）；合规开关经 mergeCompliance 清洗（防异常 Json）。
 * - 状态总览聚合认证/任务中心/备份/健康（只读非敏感），此前前端空白的根因即缺此接入。
 */
@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskQueue: TaskQueueService,
  ) {}

  private async loadRow() {
    return this.prisma.client.siteConfig.findUnique({ where: { id: SITE_CONFIG_ID } });
  }

  async getSettings(): Promise<SiteSettingsView> {
    const row = await this.loadRow();
    const appIdEnc = row?.defaultWechatAppIdEncrypted ?? '';
    const appSecretEnc = row?.defaultWechatAppSecretEncrypted ?? '';
    return {
      siteName: row?.siteName ?? '自媒体工作台',
      siteDesc: row?.siteDesc ?? null,
      defaultWechatAppIdMasked: appIdEnc ? maskSecret(this.decryptSafe(appIdEnc)) : '',
      appIdConfigured: Boolean(appIdEnc),
      appSecretConfigured: Boolean(appSecretEnc),
      compliance: (row?.compliance as Record<string, unknown>) ?? {},
      allowRegistration: Boolean(row?.allowRegistration),
      seo: publicSeo(row?.seoConfig as Record<string, unknown> | null),
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  /** 公开只读：未登录首页拉取品牌 / TDK / 页脚配置（无 Guard、无敏感字段）。 */
  async getPublicSettings(): Promise<PublicSiteView> {
    try {
      const row = await this.loadRow();
      return {
        siteName: row?.siteName ?? '自媒体工作台',
        siteDesc: row?.siteDesc ?? null,
        seo: publicSeo(row?.seoConfig as Record<string, unknown> | null),
        updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      };
    } catch {
      // DB 不可达 / 迁移未执行时不影响公开首页：回落到 index.html 静态基线。
      this.logger.warn('公开站点元信息读取失败，回落到内置默认值');
      return {
        siteName: '自媒体工作台',
        siteDesc: null,
        seo: publicSeo(null),
        updatedAt: null,
      };
    }
  }

  private decryptSafe(cipher: string): string {
    try {
      return getSecretCrypto().decrypt(cipher);
    } catch {
      return '';
    }
  }

  async upsertSettings(dto: UpdateSystemSettingsDto): Promise<SiteSettingsView> {
    const existing = await this.prisma.client.siteConfig.findUnique({
      where: { id: SITE_CONFIG_ID },
    });

    const compliance = mergeCompliance(
      existing?.compliance as Record<string, unknown> | null,
      dto.compliance,
    );
    const seoConfig = mergeSeo(
      existing?.seoConfig as Record<string, unknown> | null,
      dto.seo,
    );

    // AppID：传 undefined 保持原值；传空串清空；传非空明文则加密入库。
    let appIdEnc: string | null = existing?.defaultWechatAppIdEncrypted ?? null;
    if (dto.defaultWechatAppId !== undefined) {
      appIdEnc = dto.defaultWechatAppId
        ? getSecretCrypto().encrypt(dto.defaultWechatAppId)
        : null;
    }

    // T3.9 AppSecret：与 AppID 同策略（仅加密存储，日志绝不打印明文）。
    let appSecretEnc: string | null = existing?.defaultWechatAppSecretEncrypted ?? null;
    if (dto.defaultWechatAppSecret !== undefined) {
      appSecretEnc = dto.defaultWechatAppSecret
        ? getSecretCrypto().encrypt(dto.defaultWechatAppSecret)
        : null;
    }

    const data = {
      siteName: dto.siteName ?? existing?.siteName ?? '自媒体工作台',
      siteDesc: dto.siteDesc !== undefined ? dto.siteDesc : existing?.siteDesc,
      defaultWechatAppIdEncrypted: appIdEnc,
      defaultWechatAppSecretEncrypted: appSecretEnc,
      compliance: compliance as Prisma.InputJsonValue,
      allowRegistration:
        dto.allowRegistration !== undefined
          ? dto.allowRegistration
          : Boolean(existing?.allowRegistration),
      seoConfig: seoConfig as unknown as Prisma.InputJsonValue,
    };

    await this.prisma.client.siteConfig.upsert({
      where: { id: SITE_CONFIG_ID },
      create: { id: SITE_CONFIG_ID, ...data },
      update: data,
    });

    this.logger.log('站点设置已更新（AppID 已加密入库，日志不含明文）');
    return this.getSettings();
  }

  /** 系统设置页状态总览：聚合认证 / 任务中心 / 备份 / 健康 / 通知，均为只读非敏感信息。 */
  async getStatus(): Promise<Record<string, unknown>> {
    let notifCfg: NotificationConfig = { channels: [], forwardKinds: defaultNotifications().forwardKinds };
    if (this.prisma.isConnected) {
      try {
        const row = await this.loadRow();
        notifCfg = mergeNotifications(undefined, (row?.notifications as never) ?? undefined);
      } catch {
        /* 降级：无 DB 时使用默认空配置 */
      }
    }
    const enabledNotif = countEnabledChannels(notifCfg.channels);
    return {
      auth: {
        implemented: [
          'POST /api/auth/login',
          'POST /api/auth/refresh',
          'GET /api/auth/me',
          'POST /api/auth/register',
          'GET /api/auth/registration-status',
          'POST /api/auth/change-password',
          'GET/POST/PATCH/DELETE /api/users (仅 owner/admin)',
        ],
        note: 'JWT(access+refresh) + argon2；自助注册可开关，用户管理含角色/禁用/改密/软删。',
      },
      tasks: {
        implemented: [
          'POST /api/tasks',
          'GET /api/tasks',
          'GET /api/tasks/:id',
          'POST /api/tasks/:id/retry',
          'POST /api/tasks/:id/cancel',
          'DELETE /api/tasks/:id',
          'GET /api/tasks/stream',
        ],
        queueAvailable: this.taskQueue.available,
        note: this.taskQueue.available
          ? 'BullMQ 队列与 Worker 在线，异步任务可入队消费。'
          : 'Redis 不可达，队列与 Worker 已降级，任务保留 queued 状态，恢复连接后继续处理。',
      },
      backup: {
        scripts: ['backup:db', 'backup:files', 'backup'],
        cronExample: 'deploy/backup.cron.example',
        manual: 'restore.md',
        note: 'pg_dump 逻辑备份（gzip + 轮换）与文件 rsync 镜像/硬链接快照；按部署文档配置定时备份与恢复流程。',
      },
      health: {
        postgres: this.prisma.isConnected ? 'up' : 'unavailable',
        redis: this.taskQueue.available ? 'up' : 'unavailable',
      },
      notifications: {
        enabledChannels: enabledNotif,
        totalChannels: notifCfg.channels.length,
        forwardKinds: notifCfg.forwardKinds,
        note:
          enabledNotif > 0
            ? '已配置通知渠道（企业微信/钉钉/邮件），任务成功/失败与监控告警将推送。'
            : '尚未配置启用任何通知渠道；敏感字段经 AES-256-GCM 加密入库。',
      },
    };
  }
}
