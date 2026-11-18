import { createHmac } from 'node:crypto';
import { getSecretCrypto, SecretCrypto } from '../system/crypto.util';

/**
 * 通知渠道与监控告警纯函数（T1.10，不依赖数据库/网络，可单测）。
 * - 渠道配置合并/清洗：仅保留合法渠道类型、布尔化 enabled、截断字符串、剔除未知字段（防异常输入）。
 * - 敏感字段加解密：webhookUrl/secret/smtpPassword 以 `enc:` 前缀存密文，读取时解密。
 * - 消息格式化：企业微信 / 钉钉 / 飞书 Webhook payload、钉钉与飞书签名、Telegram Bot payload、邮件主题、任务与告警文案。
 */

export type NotificationChannelType = 'wecom' | 'dingtalk' | 'email' | 'feishu' | 'telegram';
export type NotificationAlertKind =
  | 'task_success'
  | 'task_failed'
  | 'backup_failed'
  | 'quota'
  | 'liveness'
  | 'generic';

export const CHANNEL_TYPES: NotificationChannelType[] = ['wecom', 'dingtalk', 'email', 'feishu', 'telegram'];
/** 前端回填给输入框的脱敏占位；保存时视为「保持原值」，绝不把占位串写进库。 */
export const MASKED_SECRET = '***';
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
  // 企业微信 / 钉钉 / 飞书
  webhookUrl?: string; // 可能含 key，敏感
  secret?: string; // 钉钉 / 飞书签名密钥，敏感
  // Telegram Bot
  botToken?: string; // BotFather 签发的 token，敏感
  chatId?: string; // 目标会话 id（不加密）
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
  const botToken = str(obj.botToken, 512);
  if (botToken !== undefined) ch.botToken = botToken;
  const chatId = str(obj.chatId, 128);
  if (chatId !== undefined) ch.chatId = chatId;
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

/**
 * 保存时保留未修改的敏感字段：
 * 前端只拿到脱敏串，输入框留空/回显 `***` 都表示「保持原值」；显式传空串才是清空。
 * 已加密的 `enc:` 值原样沿用，避免二次加密导致密钥不可用。
 */
export function mergeSensitiveChannels(existing: ChannelConfig[], incoming: ChannelConfig[]): ChannelConfig[] {
  const byType = new Map(existing.map((c) => [c.type, c]));
  const keys = ['webhookUrl', 'secret', 'smtpPassword', 'botToken'] as const;
  return incoming.map((ch) => {
    const old = byType.get(ch.type);
    if (!old) return ch;
    const out: ChannelConfig = { ...ch };
    for (const key of keys) {
      const value = out[key];
      if (value === undefined || String(value).startsWith(MASKED_SECRET) || String(value).startsWith('enc:')) {
        if (old[key] !== undefined) out[key] = old[key];
        else delete out[key];
      } else if (value === '') {
        out[key] = ''; // 显式清空
      }
    }
    return out;
  });
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
    const enc = (v: string) => (v.startsWith('enc:') ? v : `enc:${crypto.encrypt(v)}`);
    if (c.webhookUrl) out.webhookUrl = enc(c.webhookUrl);
    if (c.secret) out.secret = enc(c.secret);
    if (c.smtpPassword) out.smtpPassword = enc(c.smtpPassword);
    if (c.botToken) out.botToken = enc(c.botToken);
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
    if (c.botToken?.startsWith('enc:')) out.botToken = safeDecrypt(crypto, c.botToken);
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
  if (c.smtpPassword) out.smtpPassword = MASKED_SECRET;
  if (c.botToken) out.botToken = MASKED_SECRET;
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

/** 飞书自定义机器人签名：HMAC-SHA256，key 与待签串均为 `${timestamp}\n${secret}`，消息为空。 */
export function feishuSign(secret: string, timestampSec: number): string {
  const key = `${timestampSec}\n${secret}`;
  return createHmac('sha256', key).update('').digest('base64');
}

/** 飞书 text 消息；启用签名校验时附带 timestamp / sign。 */
export function formatFeishuPayload(
  text: string,
  opts?: { timestampSec?: number; sign?: string },
): Record<string, unknown> {
  return {
    msg_type: 'text',
    content: { text },
    ...(opts?.sign ? { timestamp: String(opts.timestampSec ?? ''), sign: opts.sign } : {}),
  };
}

/** Telegram Bot sendMessage；chat_id 支持数字、@channel 或频道 id。 */
export function formatTelegramPayload(text: string, chatId: string): Record<string, unknown> {
  return { chat_id: chatId, text, disable_web_page_preview: true };
}

/**
 * 清洗用户粘贴的 Telegram Bot Token。
 * 常见误填：整段 getUpdates URL、bot 前缀、首尾空格。统一归一到 `<botId>:<35位密钥>`。
 * 只做字符串变换，不校验真伪、不写日志。
 */
export function normalizeTelegramToken(input: string): string {
  let s = String(input ?? '').trim();
  // 情形：粘贴了整段 API URL，如 https://api.telegram.org/bot<token>/getUpdates
  const fromUrl = s.match(/\/bot(\d{6,}:[A-Za-z0-9_-]{10,})/i);
  if (fromUrl) s = fromUrl[1];
  // 情形：手工补了 bot 前缀
  if (/^bot\d+:/i.test(s)) s = s.slice(3);
  return s.trim();
}

/** 标准 Telegram token 形态：数字 botId + 冒号 + 35 位密钥。 */
export function isValidTelegramToken(input: string): boolean {
  return /^\d{6,}:[A-Za-z0-9_-]{35}$/.test(normalizeTelegramToken(input));
}

/**
 * 清洗 Chat ID：接受纯数字、@username、或误粘的 `chat.id=123` / JSON 片段。
 * 数字会话（私聊 / 群组 / 频道）优先抽纯数字，避免带空格导致 400 chat not found。
 */
export function normalizeTelegramChatId(input: string): string {
  const s = String(input ?? '').trim();
  const numeric = s.match(/-?\d{5,}/);
  if (numeric) return numeric[0];
  return s.replace(/^@/, '').trim();
}

/** token 中可能含冒号，需原样拼进 URL path；只做基础合法性检查，不写日志。 */
export function telegramApiUrl(botToken: string): string {
  const clean = normalizeTelegramToken(botToken);
  return `https://api.telegram.org/bot${encodeURI(clean).replace(/%3A/gi, ':')}/sendMessage`;
}

/** 读取会话候选用的 getUpdates 地址；不带 offset，避免消费/确认服务端的更新队列。 */
export function telegramGetUpdatesUrl(botToken: string, limit = 50): string {
  const token = encodeURI(botToken).replace(/%3A/gi, ':');
  return `https://api.telegram.org/bot${token}/getUpdates?limit=${Math.max(1, Math.min(100, Math.trunc(limit)))}`;
}

export interface TelegramChatCandidate {
  id: string;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  label: string;
}

const TG_CHAT_TYPES = ['private', 'group', 'supergroup', 'channel'] as const;

/**
 * 从 Telegram getUpdates 结果里提取可发送的会话 ID。
 * 只回 id / 类型 / 展示名，绝不回消息正文，避免把用户聊天内容带进后台。
 * 支持私聊文字、编辑消息、频道帖子，以及「把机器人拉进群」产生的 my_chat_member。
 */
export function extractTelegramChats(updates: unknown[], max = 20): TelegramChatCandidate[] {
  if (!Array.isArray(updates)) return [];
  const out: TelegramChatCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of updates) {
    if (!raw || typeof raw !== 'object') continue;
    const update = raw as Record<string, unknown>;
    const holders = [
      update.message,
      update.edited_message,
      update.channel_post,
      update.edited_channel_post,
      update.my_chat_member,
    ];
    for (const holder of holders) {
      if (!holder || typeof holder !== 'object') continue;
      const chat = (holder as Record<string, unknown>).chat;
      if (!chat || typeof chat !== 'object') continue;
      const c = chat as Record<string, unknown>;
      if (typeof c.id !== 'number' && typeof c.id !== 'string') continue;
      const id = String(c.id);
      if (!id || seen.has(id)) continue;
      const type = TG_CHAT_TYPES.includes(c.type as (typeof TG_CHAT_TYPES)[number])
        ? (c.type as TelegramChatCandidate['type'])
        : 'private';
      const name = [c.first_name, c.last_name].filter((v) => typeof v === 'string' && v).join(' ');
      const label =
        String(c.title ?? c.username ?? name ?? '').trim() || `会话 ${id}`;
      seen.add(id);
      out.push({ id, type, label });
      if (out.length >= Math.max(1, max)) return out;
    }
  }
  return out;
}

/** getUpdates 错误文案脱敏：token 与 URL 绝不外泄。 */
export function redactTelegramError(error: unknown, token: string): string {
  let msg = error instanceof Error ? error.message : String(error ?? '未知错误');
  if (token) msg = msg.split(token).join('***');
  msg = msg.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***:***');
  if (/webhook/i.test(msg)) {
    return '机器人处于 Webhook 模式，getUpdates 不可用。请先用 setWebhook 空参数解除 Webhook，或改用普通 Bot。';
  }
  if (/timed?\s*out|abort/i.test(msg)) return '请求 Telegram 超时，请稍后重试。';
  if (/fetch failed|network|ENOTFOUND|ECONNRESET/i.test(msg)) return '无法连接 Telegram 服务，请检查服务器网络代理。';
  return msg.slice(0, 300);
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
