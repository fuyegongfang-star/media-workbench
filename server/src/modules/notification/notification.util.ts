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
  | 'task_started'
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
  'task_started',
  'task_success',
  'task_failed',
  'backup_failed',
  'quota',
  'liveness',
  'generic',
];

/**
 * 业务流程环节表：把内部 TaskType 枚举翻译成「第几步 · 业务环节」，让推送一眼看清是哪个工作流。
 * 顺序即内容生产主链路：采集 → 拆解 → 策略 → 选题 → 标题 → 正文 → 检测 → 润色。
 */
export interface TaskStageMeta {
  /** 流程阶段序号（1 起）。 */
  step: number;
  /** 所属大阶段，如「选题调研」「内容创作」。 */
  phase: string;
  /** 环节中文名。 */
  name: string;
  /** 推送用的图标（纯文本渠道同样可读）。 */
  icon: string;
}

export const TASK_STAGES: Record<string, TaskStageMeta> = {
  RADAR_COLLECT: { step: 1, phase: '选题调研', name: '选题雷达采集', icon: '🔍' },
  ANALYSIS_SINGLE: { step: 2, phase: '选题调研', name: '爆款素材拆解', icon: '📊' },
  ANALYSIS_ACCOUNT_SUMMARY: { step: 3, phase: '选题调研', name: '账号策略汇总', icon: '🎯' },
  TOPIC_GEN: { step: 4, phase: '内容创作', name: '选题生成', icon: '💡' },
  TITLE_GEN: { step: 5, phase: '内容创作', name: '标题生成', icon: '✍️' },
  ARTICLE_GEN: { step: 6, phase: '内容创作', name: '正文生成', icon: '📝' },
  TEXT_DETECT: { step: 7, phase: '质检优化', name: 'AI 文本检测', icon: '🛡️' },
  TEXT_POLISH: { step: 8, phase: '质检优化', name: '文本润色', icon: '✨' },
};

const STEP_LABELS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

/** 环节展示名：已知枚举返回「⑤ 标题生成」，未知枚举回落为原值（不吞信息）。 */
export function taskStageLabel(taskType?: string | null): string {
  if (!taskType) return '未分类任务';
  const meta = TASK_STAGES[taskType];
  if (!meta) return taskType;
  return `${STEP_LABELS[meta.step - 1] ?? `${meta.step}.`} ${meta.name}`;
}

/** 环节完整描述：阶段 + 序号 + 名称 + 原枚举，供日志与详情查看。 */
export function taskStageDetail(taskType?: string | null): string {
  if (!taskType) return '未分类任务';
  const meta = TASK_STAGES[taskType];
  if (!meta) return taskType;
  return `${meta.phase} · ${taskStageLabel(taskType)}（${taskType}）`;
}

/** 毫秒耗时格式化：秒级任务显示「12 秒」，长任务显示「1 分 05 秒 / 2 小时 3 分」。 */
export function formatDuration(ms?: number | null): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return '不足 1 秒';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec} 秒`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec ? `${min} 分 ${String(sec).padStart(2, '0')} 秒` : `${min} 分`;
  const hour = Math.floor(min / 60);
  return min % 60 ? `${hour} 小时 ${min % 60} 分` : `${hour} 小时`;
}

/** 上海时区时间串（与前端简报一致），无效输入返回空串。 */
export function formatChinaTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  } catch {
    return d.toISOString();
  }
}

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

/** Telegram 会话类型中文标签（统一 service / 前端文案口径）。 */
export function telegramChatKindLabel(type: string): string {
  if (type === 'private') return '私聊';
  if (type === 'channel') return '频道';
  if (type === 'group' || type === 'supergroup') return '群组';
  return '会话';
}

/**
 * 根据 Chat ID 形态推断目标类型（仅用于前端提示，最终以官方 getChat 为准）：
 * 群组/频道 ID 为负数（-100... 为超级群/频道），私聊为正数，@username 为公开频道/群。
 */
export function inferTelegramChatKind(chatId: string): 'private' | 'group' | 'unknown' {
  const s = String(chatId ?? '').trim();
  if (/^@/.test(s)) return 'group';
  if (/^-\d+$/.test(s)) return 'group';
  if (/^\d+$/.test(s)) return 'private';
  return 'unknown';
}

/** 会话候选排序：群组 / 超级群 / 频道在前，私聊在后，同类按 label 稳定排序。 */
export function sortTelegramChats(chats: TelegramChatCandidate[]): TelegramChatCandidate[] {
  const rank = (t: TelegramChatCandidate['type']) => (t === 'private' ? 1 : 0);
  return [...chats].sort((a, b) => rank(a.type) - rank(b.type) || a.label.localeCompare(b.label));
}

/**
 * 从 sendMessage / getChat 的响应里提取「实际送达会话」。
 * sendMessage 返回 result.chat，getChat 直接返回 result 本体；只保留 id/类型/展示名，绝不回显消息正文。
 */
export function parseTelegramChat(json: unknown): TelegramChatCandidate | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const result = root.result;
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  // sendMessage/getUpdates 消息体：result.chat；getChat：result 本身即 chat 对象
  const chat = (r.chat && typeof r.chat === 'object' ? r.chat : r) as Record<string, unknown>;
  if (typeof chat.id !== 'number' && typeof chat.id !== 'string') return null;
  const id = String(chat.id);
  if (!id) return null;
  const type = TG_CHAT_TYPES.includes(chat.type as (typeof TG_CHAT_TYPES)[number])
    ? (chat.type as TelegramChatCandidate['type'])
    : 'private';
  const name = [chat.first_name, chat.last_name].filter((v) => typeof v === 'string' && v).join(' ');
  const label = String(chat.title ?? chat.username ?? name ?? '').trim() || `会话 ${id}`;
  return { id, type, label };
}

/** getChat 地址：用官方接口校验 Chat ID 是否可达、并取回真实会话名与类型。 */
export function telegramGetChatUrl(botToken: string, chatId: string): string {
  const token = encodeURI(botToken).replace(/%3A/gi, ':');
  return `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`;
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

/** 任务通知的业务上下文（均由通知服务从 DB 关联查出，纯函数只做格式化）。 */
export interface TaskNotifyContext {
  id: string;
  taskType?: string | null;
  /** 业务对象名，如「选题：AI 写作是否值得做」「账号：张三的公众号」。 */
  subject?: string | null;
  /** 结果摘要，如「新增 12 条选题」「采集 38 条 / 主推 6 条」。 */
  result?: string | null;
  /** 任务进入 running 的时间（ISO）。 */
  startedAt?: string | null;
  /** 任务终态时间（ISO）。 */
  finishedAt?: string | null;
  /** 重试次数。 */
  retryCount?: number;
  error?: string | null;
}

/**
 * 构造任务状态推送文案：首行即「状态 + 第几步 + 环节名 + 原枚举」，一眼看清是哪个业务环节。
 * 兼容旧签名（只有 id/taskType/error），新增字段缺省时自动省略，绝不输出空标签行。
 */
export function buildTaskNotifyText(status: string, opts: TaskNotifyContext): string {
  const meta = opts.taskType ? TASK_STAGES[opts.taskType] : undefined;
  const icon = meta?.icon ?? '🔔';
  const stage = taskStageLabel(opts.taskType);
  const type = opts.taskType ? `（${opts.taskType}）` : '';
  const label =
    status === 'success'
      ? '任务完成'
      : status === 'failed'
        ? '任务失败'
        : status === 'running'
          ? '任务开始'
          : `状态变更：${status}`;

  // 首行：状态 + 阶段序号 + 中文环节名 + 内部枚举（保留枚举便于按任务类型筛选/检索）
  const lines = [`${icon} [自媒体工作台] ${label} · ${stage}${type}`];
  if (meta) lines.push(`所属阶段：${meta.phase}`);
  if (opts.subject) lines.push(`业务对象：${String(opts.subject).slice(0, 120)}`);
  if (opts.result) lines.push(`执行结果：${String(opts.result).slice(0, 200)}`);
  if (opts.retryCount && opts.retryCount > 0) lines.push(`重试次数：${opts.retryCount}`);
  const duration = formatDuration(
    opts.startedAt && opts.finishedAt
      ? new Date(opts.finishedAt).getTime() - new Date(opts.startedAt).getTime()
      : null,
  );
  if (duration) lines.push(`${status === 'running' ? '已等待' : '耗时'}：${duration}`);
  const at = formatChinaTime(opts.finishedAt);
  if (at) lines.push(`时间：${at}`);
  lines.push(`任务ID：${opts.id}`);
  if (opts.error) lines.push(`错误：${String(opts.error).slice(0, 300)}`);
  return lines.join('\n');
}

const ALERT_TITLES: Record<string, string> = {
  task_started: '任务开始',
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
