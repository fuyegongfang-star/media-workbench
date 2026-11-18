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
  MASKED_SECRET,
  buildAlertText,
  buildTaskNotifyText,
  decryptChannels,
  dingtalkSign,
  encryptChannels,
  extractTelegramChats,
  feishuSign,
  formatDingtalkPayload,
  formatEmailSubject,
  formatFeishuPayload,
  formatTelegramPayload,
  formatWecomPayload,
  maskChannel,
  mergeNotifications,
  mergeSensitiveChannels,
  redactTelegramError,
  telegramApiUrl,
  telegramGetUpdatesUrl,
  type TelegramChatCandidate,
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

  /**
   * 获取机器人当前能收到的会话 ID（Chat ID）。
   * 用户只需先在 Telegram 里给机器人发一条消息 / 把它拉进群；Token 用表单明文或已保存的解密值。
   * 不写库、不回显 Token、不返回消息正文；错误全部脱敏。
   */
  /**
   * 用表单当前填写的 Token/Chat ID 直发一条测试消息，绕过「已保存→解密」链路。
   * 目的：当用户保存后测试报 400 时，能直接暴露 Telegram 官方原始 description，快速定位。
   * Token 仅在本次请求内存使用，错误与日志均脱敏。
   */
  async probeTelegram(input: {
    botToken?: string;
    chatId?: string;
    text?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const token = String(input.botToken ?? '').trim();
    const chatId = String(input.chatId ?? '').trim();
    if (!token || !chatId) {
      return { ok: false, error: '请先填写 Bot Token 和 Chat ID 再测试。' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const text = String(input.text ?? '').trim() || `[自媒体工作台] 连通性测试 @ ${new Date().toISOString()}`;
      const res = await fetch(telegramApiUrl(token), {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formatTelegramPayload(text, chatId)),
      });
      const body = (await res.text()).slice(0, 20_000);
      let description = '';
      try {
        const parsed = JSON.parse(body) as { description?: string };
        if (typeof parsed.description === 'string') description = parsed.description;
      } catch {
        // 非 JSON 响应忽略
      }
      if (!res.ok || description) {
        return { ok: false, error: `HTTP ${res.status}${description ? ` · ${description}` : ''}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: redactTelegramError(e, token) };
    } finally {
      clearTimeout(timer);
    }
  }

  async listTelegramChats(plainToken?: string): Promise<{
    ok: boolean;
    chats: TelegramChatCandidate[];
    error?: string;
    hint?: string;
  }> {
    let token = String(plainToken ?? '').trim();
    if (!token || token === MASKED_SECRET || token.startsWith('enc:')) {
      const cfg = await this.loadSendConfig();
      token = cfg.channels.find((c) => c.type === 'telegram')?.botToken ?? '';
    }
    token = token.trim();
    if (!token) {
      return {
        ok: false,
        chats: [],
        error: '请先填写 Bot Token（或先在下方保存 Telegram 配置）再获取会话 ID。',
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(telegramGetUpdatesUrl(token), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const body = (await res.text()).slice(0, 200_000);
      if (!res.ok) {
        let desc = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(body) as { description?: string };
          if (typeof parsed.description === 'string' && parsed.description) desc = parsed.description;
        } catch {
          // 非 JSON 响应则保留 HTTP 状态
        }
        return { ok: false, chats: [], error: redactTelegramError(desc, token) };
      }
      const json = JSON.parse(body) as { ok?: boolean; result?: unknown[]; description?: string };
      if (!json.ok || !Array.isArray(json.result)) {
        return {
          ok: false,
          chats: [],
          error: redactTelegramError(json.description ?? 'Telegram 返回格式异常', token),
        };
      }
      const chats = extractTelegramChats(json.result);
      if (!chats.length) {
        return {
          ok: false,
          chats: [],
          error: '还没有检测到会话。',
          hint: '先在 Telegram 里给机器人发一条消息（或把它拉进群），再点一次「获取会话 ID」。',
        };
      }
      return { ok: true, chats };
    } catch (e) {
      return { ok: false, chats: [], error: redactTelegramError(e, token) };
    } finally {
      clearTimeout(timer);
    }
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
      if (ch.type === 'feishu') {
        if (!ch.webhookUrl) return { type: ch.type, ok: false, error: '缺少 webhookUrl' };
        let payload = formatFeishuPayload(text);
        if (ch.secret) {
          const ts = Math.floor(Date.now() / 1000);
          payload = formatFeishuPayload(text, { timestampSec: ts, sign: feishuSign(ch.secret, ts) });
        }
        const res = await fetch(ch.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return { type: ch.type, ok: false, error: `HTTP ${res.status}` };
        const data = (await res.json().catch(() => ({}))) as {
          code?: number;
          StatusCode?: number;
          msg?: string;
        };
        const code = data.code ?? data.StatusCode;
        if (typeof code === 'number' && code !== 0) {
          return { type: ch.type, ok: false, error: `code ${code}${data.msg ? ` ${data.msg}` : ''}` };
        }
        return { type: ch.type, ok: true };
      }
      if (ch.type === 'telegram') {
        if (!ch.botToken || !ch.chatId) return { type: ch.type, ok: false, error: '缺少 Bot Token 或 Chat ID' };
        const res = await fetch(telegramApiUrl(ch.botToken), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formatTelegramPayload(text, ch.chatId)),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
        if (!res.ok || data.ok === false) {
          const detail = data.description ? ` ${data.description}` : '';
          return { type: ch.type, ok: false, error: `HTTP ${res.status}${detail}` };
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
    // 前端只拿到脱敏串：未改动的密钥字段（留空 / `***`）沿用库里的密文，避免把占位串写成真凭据。
    let existingChannels: ChannelConfig[] = [];
    try {
      const row = await this.prisma.client.siteConfig.findUnique({ where: { id: SITE_CONFIG_ID } });
      existingChannels = mergeNotifications(undefined, row?.notifications as NotificationConfig | undefined).channels;
    } catch {
      existingChannels = [];
    }
    const keptChannels = mergeSensitiveChannels(existingChannels, merged.channels);
    let encryptedChannels = keptChannels;
    try {
      encryptedChannels = encryptChannels(keptChannels, getSecretCrypto());
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
    // 返回脱敏视图，绝不把本次提交的明文回显给前端。
    return { channels: keptChannels.map(maskChannel), forwardKinds: merged.forwardKinds };
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
