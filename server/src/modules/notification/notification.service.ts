import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskQueueService } from '../tasks/queue/queue.service';
import { TasksEventBus, TASK_EVENT_UPDATED } from '../tasks/tasks.event-bus';
import { getSecretCrypto } from '../system/crypto.util';
import { SITE_CONFIG_ID } from '../system/system.service';
import {
  type ChannelConfig,
  type NotificationAlertKind,
  type NotificationChannelType,
  type NotificationConfig,
  buildAlertText,
  buildTaskNotifyText,
  decryptChannels,
  dingtalkSign,
  encryptChannels,
  formatDingtalkPayload,
  formatEmailSubject,
  formatWecomPayload,
  maskChannel,
  mergeNotifications,
} from './notification.util';
import { type UpsertNotificationChannelsDto } from './dto/notification.dto';

export interface SendResult {
  type: NotificationChannelType;
  ok: boolean;
  error?: string;
}

/**
 * 通知服务（T1.10）：通知渠道与监控告警。
 * - 订阅任务中心事件总线：任务 success/failed 触发对应渠道推送（仅这两态，避免噪声）。
 * - sendAlert：监控告警入口（备份失败 / 配额预警 / 服务存活）。
 * - 渠道发送：企业微信/钉钉走 Webhook（fetch），邮件走 SMTP（nodemailer）；全部 best-effort，
 *   DB/密钥缺失时安全降级，绝不伪造"已送达"。
 * - 敏感字段（webhookUrl/secret/smtpPassword）入库前经 AES-256-GCM 加密（`enc:` 前缀），日志绝不回显明文。
 */
@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private livenessLastAlertAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskQueue: TaskQueueService,
    private readonly bus: TasksEventBus,
  ) {}

  onModuleInit(): void {
    this.bus.on(TASK_EVENT_UPDATED, (e: { id: string; status: string; at: string }) => {
      void this.handleTaskEvent(e).catch((err) =>
        this.logger.warn(
          `任务事件通知处理失败（已降级）：${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    });
    this.logger.log('通知服务已挂载任务事件总线（任务成功/失败将触发渠道推送）');
  }

  /** 读取并解密渠道配置（无 DB / 无主密钥时安全降级为默认空配置）。 */
  private async loadSendConfig(): Promise<NotificationConfig> {
    if (!this.prisma.isConnected) return { channels: [], forwardKinds: [] };
    try {
      const row = await this.prisma.client.siteConfig.findUnique({ where: { id: SITE_CONFIG_ID } });
      const raw = (row?.notifications as NotificationConfig | undefined) ?? undefined;
      const merged = mergeNotifications(undefined, raw);
      let channels = merged.channels;
      try {
        channels = decryptChannels(merged.channels, getSecretCrypto());
      } catch {
        channels = []; // 主密钥未配置：放弃解密，避免明文外泄
      }
      return { channels, forwardKinds: merged.forwardKinds };
    } catch {
      return { channels: [], forwardKinds: [] };
    }
  }

  /** 读取配置（用于展示，敏感字段保持加密态并脱敏）。 */
  private async loadViewConfig(): Promise<NotificationConfig> {
    if (!this.prisma.isConnected) return { channels: [], forwardKinds: defaultKinds() };
    try {
      const row = await this.prisma.client.siteConfig.findUnique({ where: { id: SITE_CONFIG_ID } });
      const raw = (row?.notifications as NotificationConfig | undefined) ?? undefined;
      return mergeNotifications(undefined, raw);
    } catch {
      return { channels: [], forwardKinds: defaultKinds() };
    }
  }

  private async findChannel(type: NotificationChannelType): Promise<ChannelConfig | null> {
    const cfg = await this.loadSendConfig();
    return cfg.channels.find((c) => c.type === type && c.enabled) ?? null;
  }

  /** 向所有启用的渠道推送（按 forwardKinds 过滤告警类型）。 */
  async notifyAll(text: string, kind?: NotificationAlertKind): Promise<SendResult[]> {
    const cfg = await this.loadSendConfig();
    if (kind && !cfg.forwardKinds.includes(kind)) return []; // 该类型未勾选转发，跳过
    const targets = cfg.channels.filter((c) => c.enabled);
    if (targets.length === 0) {
      this.logger.debug('无启用通知渠道，跳过推送');
      return [];
    }
    const results: SendResult[] = [];
    for (const ch of targets) {
      results.push(await this.sendChannel(ch, text));
    }
    const failed = results.filter((r) => !r.ok).length;
    this.logger.log(`通知推送完成：成功 ${results.length - failed}/共 ${results.length}`);
    return results;
  }

  /** 单渠道发送（best-effort，异常计入 error，不抛出）。 */
  async sendChannel(ch: ChannelConfig, text: string): Promise<SendResult> {
    try {
      if (ch.type === 'wecom') {
        if (!ch.webhookUrl) return { type: ch.type, ok: false, error: '缺少 webhookUrl' };
        const res = await fetch(ch.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formatWecomPayload(text)),
        });
        if (!res.ok) return { type: ch.type, ok: false, error: `HTTP ${res.status}` };
        const data = (await res.json().catch(() => ({}))) as { errcode?: number };
        if (data?.errcode && data.errcode !== 0) {
          return { type: ch.type, ok: false, error: `errcode ${data.errcode}` };
        }
        return { type: ch.type, ok: true };
      }
      if (ch.type === 'dingtalk') {
        if (!ch.webhookUrl) return { type: ch.type, ok: false, error: '缺少 webhookUrl' };
        let url = ch.webhookUrl;
        if (ch.secret) {
          const ts = Date.now();
          const sign = encodeURIComponent(dingtalkSign(ch.secret, ts));
          url += `${url.includes('?') ? '&' : '?'}timestamp=${ts}&sign=${sign}`;
        }
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formatDingtalkPayload(text)),
        });
        if (!res.ok) return { type: ch.type, ok: false, error: `HTTP ${res.status}` };
        const data = (await res.json().catch(() => ({}))) as { errcode?: number };
        if (data?.errcode && data.errcode !== 0) {
          return { type: ch.type, ok: false, error: `errcode ${data.errcode}` };
        }
        return { type: ch.type, ok: true };
      }
      if (ch.type === 'email') {
        return this.sendEmail(ch, text);
      }
      return { type: ch.type, ok: false, error: '不支持的渠道类型' };
    } catch (err) {
      return { type: ch.type, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async sendEmail(ch: ChannelConfig, text: string): Promise<SendResult> {
    if (!ch.smtpHost) return { type: 'email', ok: false, error: '缺少 smtpHost' };
    try {
      const transport = nodemailer.createTransport({
        host: ch.smtpHost,
        port: ch.smtpPort ?? 465,
        secure: ch.secure ?? true,
        auth: ch.smtpUser ? { user: ch.smtpUser, pass: ch.smtpPassword ?? '' } : undefined,
      });
      await transport.sendMail({
        from: ch.from ?? ch.smtpUser,
        to: (ch.to ?? []).join(','),
        subject: formatEmailSubject('generic'),
        text,
      });
      return { type: 'email', ok: true };
    } catch (err) {
      return { type: 'email', ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 任务中心事件 → 通知（仅 success/failed 触发；DB 可用时附带任务类型与错误）。 */
  async handleTaskEvent(e: { id: string; status: string; at: string }): Promise<void> {
    if (e.status !== 'success' && e.status !== 'failed') return;
    let taskType: string | null = null;
    let error: string | null = null;
    if (this.prisma.isConnected) {
      try {
        const task = await this.prisma.client.task.findUnique({ where: { id: e.id } });
        taskType = task?.taskType ?? null;
        error = task?.error ?? null;
      } catch {
        /* 降级：仅用 id 通知 */
      }
    }
    const text = buildTaskNotifyText(e.status, { id: e.id, taskType, error });
    await this.notifyAll(text, e.status === 'success' ? 'task_success' : 'task_failed');
  }

  /** 监控告警入口（备份失败 / 配额 / 存活等）。 */
  async sendAlert(kind: NotificationAlertKind, detail?: string): Promise<SendResult[]> {
    const text = buildAlertText(kind, detail);
    return this.notifyAll(text, kind);
  }

  /** 存活探测：PostgreSQL / Redis 任一不可用则发 liveness 告警（30 分钟节流）。 */
  async runLivenessCheck(): Promise<{ postgres: boolean; redis: boolean; alerted: boolean }> {
    const postgres = this.prisma.isConnected;
    const redis = this.taskQueue.available;
    const down = !postgres || !redis;
    let alerted = false;
    if (down) {
      const now = Date.now();
      if (now - this.livenessLastAlertAt > 30 * 60 * 1000) {
        this.livenessLastAlertAt = now;
        const detail = `postgres=${postgres ? 'up' : 'down'} redis=${redis ? 'up' : 'down'}`;
        await this.sendAlert('liveness', detail);
        alerted = true;
      }
    } else {
      this.livenessLastAlertAt = 0;
    }
    return { postgres, redis, alerted };
  }

  // ---- REST 支撑 ----

  async getChannelsView(): Promise<NotificationConfig> {
    const cfg = await this.loadViewConfig();
    return { channels: cfg.channels.map(maskChannel), forwardKinds: cfg.forwardKinds };
  }

  async upsertChannels(dto: UpsertNotificationChannelsDto): Promise<NotificationConfig> {
    const merged = mergeNotifications(undefined, {
      channels: dto.channels as unknown as ChannelConfig[],
      forwardKinds: dto.forwardKinds ?? defaultKinds(),
    });
    let encryptedChannels = merged.channels;
    try {
      encryptedChannels = encryptChannels(merged.channels, getSecretCrypto());
    } catch {
      encryptedChannels = []; // 主密钥未配置则清空密钥类字段，避免明文入库
    }
    const notifications = { channels: encryptedChannels, forwardKinds: merged.forwardKinds };
    await this.prisma.client.siteConfig.upsert({
      where: { id: SITE_CONFIG_ID },
      create: { id: SITE_CONFIG_ID, notifications: notifications as unknown as Prisma.InputJsonValue },
      update: { notifications: notifications as unknown as Prisma.InputJsonValue },
    });
    this.logger.log('通知渠道配置已保存（敏感字段经 AES-256-GCM 加密入库，日志不含明文）');
    return { channels: merged.channels.map(maskChannel), forwardKinds: merged.forwardKinds };
  }

  async testChannel(type: NotificationChannelType, text?: string): Promise<SendResult> {
    const ch = await this.findChannel(type);
    if (!ch) return { type, ok: false, error: '该渠道未启用或未配置' };
    return this.sendChannel(ch, text ?? `[自媒体工作台] 测试通知 @ ${new Date().toISOString()}`);
  }

  async status(): Promise<Record<string, unknown>> {
    const cfg = await this.loadViewConfig();
    const enabled = cfg.channels.filter((c) => c.enabled).length;
    return {
      enabledChannels: enabled,
      totalChannels: cfg.channels.length,
      forwardKinds: cfg.forwardKinds,
      note:
        enabled > 0
          ? '已配置通知渠道，任务成功/失败与监控告警将推送。'
          : '尚未配置启用任何通知渠道；企业微信/钉钉 Webhook 与邮件 SMTP 均经 AES 加密入库。',
    };
  }
}

function defaultKinds(): NotificationAlertKind[] {
  return ['task_failed', 'backup_failed', 'liveness', 'quota'];
}
