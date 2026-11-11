import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskQueueService } from '../tasks/queue/queue.service';
import { getSecretCrypto, maskSecret } from './crypto.util';
import { mergeCompliance } from './system.util';
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
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
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
        ],
        note: 'JWT(access+refresh) + argon2 单用户认证；登录查库与首期播种待 PG 环境联调。',
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
          : 'Redis 不可达，队列/Worker 降级（待环境），任务保留 queued 状态。',
      },
      backup: {
        scripts: ['backup:db', 'backup:files', 'backup'],
        cronExample: 'deploy/backup.cron.example',
        manual: 'restore.md',
        note: 'pg_dump 逻辑备份(gzip+轮换) + 文件 rsync 镜像/硬链接快照；真实执行在目标 Linux 服务器（本机已 self-test 验证逻辑）。',
      },
      health: {
        postgres: this.prisma.isConnected ? 'up' : 'unavailable (待环境)',
        redis: this.taskQueue.available ? 'up' : 'unavailable (待环境)',
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
