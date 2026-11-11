import { createHmac } from 'node:crypto';
import { getSecretCrypto, SecretCrypto } from '../system/crypto.util';

/**
 * 通知渠道与监控告警纯函数（T1.10，不依赖数据库/网络，可单测）。
 * - 渠道配置合并/清洗：仅保留合法渠道类型、布尔化 enabled、截断字符串、剔除未知字段（防异常输入）。
 * - 敏感字段加解密：webhookUrl/secret/smtpPassword 以 `enc:` 前缀存密文，读取时解密。
 * - 消息格式化：企业微信 / 钉钉 Webhook payload、钉钉签名、邮件主题、任务与告警文案。
 */

export type NotificationChannelType = 'wecom' | 'dingtalk' | 'email';
export type NotificationAlertKind =
  | 'task_success'
  | 'task_failed'
  | 'backup_failed'
  | 'quota'
  | 'liveness'
  | 'generic';

export const CHANNEL_TYPES: NotificationChannelType[] = ['wecom', 'dingtalk', 'email'];
export const ALERT_KINDS: NotificationAlertKind[] = [
  'task_success',
  'task_failed',
  'backup_failed',
  'quota',
  'liveness',
  'generic',
];

export interface ChannelConfig {
  type: NotificationChannelType;
  enabled: boolean;
  // 企业微信 / 钉钉
  webhookUrl?: string; // 可能含 key，敏感
  secret?: string; // 钉钉签名密钥，敏感
  // 邮件 SMTP
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string; // 敏感
  secure?: boolean; // 隐式 TLS（465）
  from?: string;
  to?: string[];
}

export interface NotificationConfig {
  channels: ChannelConfig[];
  forwardKinds: NotificationAlertKind[];
}

export function defaultNotifications(): NotificationConfig {
  return {
    channels: [],
    forwardKinds: ['task_failed', 'backup_failed', 'liveness', 'quota'],
  };
}

function sanitizeChannel(c: unknown): ChannelConfig | null {
  if (!c || typeof c !== 'object') return null;
  const obj = c as Record<string, unknown>;
  if (typeof obj.type !== 'string' || !CHANNEL_TYPES.includes(obj.type as NotificationChannelType)) {
    return null;
  }
  const ch: ChannelConfig = { type: obj.type as NotificationChannelType, enabled: Boolean(obj.enabled) };
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const webhookUrl = str(obj.webhookUrl, 2000);
  if (webhookUrl !== undefined) ch.webhookUrl = webhookUrl;
  const secret = str(obj.secret, 256);
  if (secret !== undefined) ch.secret = secret;
  const smtpHost = str(obj.smtpHost, 255);
  if (smtpHost !== undefined) ch.smtpHost = smtpHost;
  if (Number.isInteger(obj.smtpPort)) {
    ch.smtpPort = Math.min(65535, Math.max(1, obj.smtpPort as number));
  }
  const smtpUser = str(obj.smtpUser, 255);
  if (smtpUser !== undefined) ch.smtpUser = smtpUser;
  const smtpPassword = str(obj.smtpPassword, 512);
  if (smtpPassword !== undefined) ch.smtpPassword = smtpPassword;
  if (typeof obj.secure === 'boolean') ch.secure = obj.secure;
  const from = str(obj.from, 255);
  if (from !== undefined) ch.from = from;
  if (Array.isArray(obj.to)) {
    ch.to = obj.to.filter((t) => typeof t === 'string').map(String).slice(0, 50);
  }
  return ch;
}

/**
 * 合并通知配置：incoming 优先（全量覆盖），否则沿用 existing，皆空则默认。
 * 仅保留合法渠道类型与告警种类，字符串截断、布尔化，防异常输入污染 Json。
 */
export function mergeNotifications(
  existing: NotificationConfig | null | undefined,
  incoming: NotificationConfig | null | undefined,
): NotificationConfig {
  const src = incoming ?? existing ?? null;
  if (!src) return defaultNotifications();
  const channels = Array.isArray(src.channels)
    ? (src.channels.map(sanitizeChannel).filter(Boolean) as ChannelConfig[])
    : [];
  const forwardKinds = Array.isArray(src.forwardKinds)
    ? (src.forwardKinds.filter((k) => ALERT_KINDS.includes(k as NotificationAlertKind)) as NotificationAlertKind[])
    : defaultNotifications().forwardKinds;
  return { channels, forwardKinds };
}

function safeDecrypt(crypto: SecretCrypto, v: string): string {
  try {
    return crypto.decrypt(v.slice(4));
  } catch {
    return '';
  }
}

/** 加密敏感字段（webhookUrl/secret/smtpPassword），以 `enc:` 前缀标记。 */
export function encryptChannels(channels: ChannelConfig[], crypto: SecretCrypto): ChannelConfig[] {
  return channels.map((c) => {
    const out: ChannelConfig = { ...c };
    if (c.webhookUrl) out.webhookUrl = `enc:${crypto.encrypt(c.webhookUrl)}`;
    if (c.secret) out.secret = `enc:${crypto.encrypt(c.secret)}`;
    if (c.smtpPassword) out.smtpPassword = `enc:${crypto.encrypt(c.smtpPassword)}`;
    return out;
  });
}

/** 解密敏感字段（自动识别 `enc:` 前缀，非密文字段原样返回）。 */
export function decryptChannels(channels: ChannelConfig[], crypto: SecretCrypto): ChannelConfig[] {
  return channels.map((c) => {
    const out: ChannelConfig = { ...c };
    if (c.webhookUrl?.startsWith('enc:')) out.webhookUrl = safeDecrypt(crypto, c.webhookUrl);
    if (c.secret?.startsWith('enc:')) out.secret = safeDecrypt(crypto, c.secret);
    if (c.smtpPassword?.startsWith('enc:')) out.smtpPassword = safeDecrypt(crypto, c.smtpPassword);
    return out;
  });
}

/** Webhook URL 脱敏展示：仅保留协议+主机，路径与 query 打码。 */
export function maskWebhookUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/***`;
  } catch {
    return url.length > 0 ? '***' : '';
  }
}

/** 渠道配置脱敏：密钥类字段置 `***`/已加密标记，webhookUrl 仅显主机，绝不泄露明文。 */
export function maskChannel(c: ChannelConfig): ChannelConfig {
  const out: ChannelConfig = { ...c };
  if (c.webhookUrl) {
    out.webhookUrl = c.webhookUrl.startsWith('enc:') ? '***(已加密)' : maskWebhookUrl(c.webhookUrl);
  }
  if (c.secret) out.secret = '***';
  if (c.smtpPassword) out.smtpPassword = '***';
  return out;
}

export function formatWecomPayload(text: string): Record<string, unknown> {
  return { msgtype: 'text', text: { content: text } };
}

export function formatDingtalkPayload(text: string): Record<string, unknown> {
  return { msgtype: 'text', text: { content: text } };
}

/** 钉钉自定义机器人签名：HMAC-SHA256(timestamp + '\n' + secret) base64（纯函数，可单测）。 */
export function dingtalkSign(secret: string, timestampMs: number): string {
  return createHmac('sha256', secret).update(`${timestampMs}\n${secret}`).digest('base64');
}

export function buildTaskNotifyText(
  status: string,
  opts: { id: string; taskType?: string | null; error?: string | null },
): string {
  const label =
    status === 'success' ? '任务完成' : status === 'failed' ? '任务失败' : `状态变更：${status}`;
  const type = opts.taskType ? `（${opts.taskType}）` : '';
  let msg = `[自媒体工作台] ${label}${type}\n任务ID：${opts.id}`;
  if (opts.error) msg += `\n错误：${String(opts.error).slice(0, 300)}`;
  return msg;
}

const ALERT_TITLES: Record<string, string> = {
  task_success: '任务完成',
  task_failed: '任务失败',
  backup_failed: '备份失败',
  quota: '配额预警',
  liveness: '服务存活告警',
  generic: '系统通知',
};

export function buildAlertText(kind: NotificationAlertKind, detail?: string): string {
  const title = ALERT_TITLES[kind] ?? kind;
  let msg = `[自媒体工作台] 告警：${title}`;
  if (detail) msg += `\n${String(detail).slice(0, 800)}`;
  return msg;
}

export function formatEmailSubject(kind: NotificationAlertKind): string {
  return `[自媒体工作台] ${ALERT_TITLES[kind] ?? kind}`;
}

export function countEnabledChannels(channels: ChannelConfig[]): number {
  return channels.filter((c) => c.enabled).length;
}
