// T1.10 通知渠道与监控告警纯函数单测（不依赖数据库/网络）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/notification.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import util from '../dist/modules/notification/notification.util.js';
import crypto from '../dist/modules/system/crypto.util.js';

const {
  mergeNotifications,
  encryptChannels,
  decryptChannels,
  maskChannel,
  formatWecomPayload,
  formatDingtalkPayload,
  formatFeishuPayload,
  formatTelegramPayload,
  dingtalkSign,
  feishuSign,
  telegramApiUrl,
  telegramGetUpdatesUrl,
  telegramGetChatUrl,
  telegramChatKindLabel,
  inferTelegramChatKind,
  sortTelegramChats,
  parseTelegramChat,
  extractTelegramChats,
  normalizeTelegramToken,
  normalizeTelegramChatId,
  isValidTelegramToken,
  redactTelegramError,
  mergeSensitiveChannels,
  MASKED_SECRET,
  buildTaskNotifyText,
  buildAlertText,
  countEnabledChannels,
  defaultNotifications,
  CHANNEL_TYPES,
  ALERT_KINDS,
} = util;
const { SecretCrypto } = crypto;

const TEST_KEY = randomBytes(32).toString('hex');

test('mergeNotifications: 过滤非法渠道类型、布尔化 enabled、截断字符串', () => {
  const merged = mergeNotifications(null, {
    channels: [
      { type: 'wecom', enabled: true, webhookUrl: 'https://qyapi.weixin.qq.com?key=abc' },
      { type: 'bogus', enabled: true }, // 非法类型 → 丢弃
      { type: 'email', enabled: 'yes', smtpHost: 'smtp.example.com' }, // enabled 强制布尔
    ],
    forwardKinds: ['task_failed', 'nope'],
  });
  assert.equal(merged.channels.length, 2);
  assert.equal(merged.channels[0].type, 'wecom');
  assert.equal(merged.channels[1].enabled, true);
  assert.equal(merged.forwardKinds.length, 1);
  assert.equal(merged.forwardKinds[0], 'task_failed');
});

test('mergeNotifications: 全空返回默认值', () => {
  assert.deepEqual(mergeNotifications(null, null), defaultNotifications());
});

test('mergeNotifications: 仅保留合法 alert kind', () => {
  const r = mergeNotifications(null, { channels: [], forwardKinds: ['quota', 'unknown_x'] });
  assert.deepEqual(r.forwardKinds, ['quota']);
});

test('encrypt/decryptChannels: 敏感字段往返一致，非敏感原样', () => {
  const c = new SecretCrypto(TEST_KEY);
  const channels = [
    { type: 'wecom', enabled: true, webhookUrl: 'https://qyapi.weixin.qq.com?key=SECRET' },
    { type: 'dingtalk', enabled: true, webhookUrl: 'https://oapi.dingtalk.com?token=T', secret: 'DING_SECRET' },
    { type: 'email', enabled: true, smtpHost: 'smtp.x.com', smtpPassword: 'PW123' },
  ];
  const enc = encryptChannels(channels, c);
  assert.ok(enc[0].webhookUrl.startsWith('enc:'));
  assert.ok(enc[1].secret.startsWith('enc:'));
  assert.ok(enc[2].smtpPassword.startsWith('enc:'));
  const dec = decryptChannels(enc, c);
  assert.equal(dec[0].webhookUrl, 'https://qyapi.weixin.qq.com?key=SECRET');
  assert.equal(dec[1].secret, 'DING_SECRET');
  assert.equal(dec[2].smtpPassword, 'PW123');
  assert.equal(dec[2].smtpHost, 'smtp.x.com');
});

test('maskChannel: 密钥类字段脱敏，webhookUrl 仅显主机', () => {
  const m = maskChannel({
    type: 'wecom',
    enabled: true,
    webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=SECRET',
    secret: 'X',
  });
  assert.equal(m.webhookUrl, 'https://qyapi.weixin.qq.com/***');
  assert.equal(m.secret, '***');

  const mEnc = maskChannel({ type: 'email', enabled: true, webhookUrl: 'enc:abcd', smtpPassword: 'enc:ef' });
  assert.equal(mEnc.webhookUrl, '***(已加密)');
  assert.equal(mEnc.smtpPassword, '***');
});

test('formatWecomPayload / formatDingtalkPayload: 结构正确', () => {
  assert.deepEqual(formatWecomPayload('hi'), { msgtype: 'text', text: { content: 'hi' } });
  assert.deepEqual(formatDingtalkPayload('hi'), { msgtype: 'text', text: { content: 'hi' } });
});

test('dingtalkSign: 同输入稳定、不同密钥结果不同', () => {
  const ts = 1700000000000;
  const a = dingtalkSign('secretA', ts);
  const b = dingtalkSign('secretA', ts);
  const c = dingtalkSign('secretB', ts);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[A-Za-z0-9+/=]+$/);
});

test('buildTaskNotifyText: 成功/失败文案含 ID 与错误', () => {
  const ok = buildTaskNotifyText('success', { id: 't1', taskType: 'TOPIC_GEN' });
  assert.ok(ok.includes('t1') && ok.includes('TOPIC_GEN'));
  const fail = buildTaskNotifyText('failed', { id: 't2', error: 'boom' });
  assert.ok(fail.includes('t2') && fail.includes('boom'));
});

test('buildAlertText: 含标题与详情', () => {
  const t = buildAlertText('backup_failed', 'pg_dump 退出码 1');
  assert.ok(t.includes('备份失败') && t.includes('pg_dump 退出码 1'));
});

test('countEnabledChannels: 仅统计启用', () => {
  assert.equal(
    countEnabledChannels([
      { type: 'wecom', enabled: true },
      { type: 'email', enabled: false },
    ]),
    1,
  );
});

test('CHANNEL_TYPES / ALERT_KINDS 枚举完整', () => {
  assert.deepEqual(CHANNEL_TYPES, ['wecom', 'dingtalk', 'email', 'feishu', 'telegram']);
  assert.ok(ALERT_KINDS.includes('liveness') && ALERT_KINDS.includes('quota'));
});

test('飞书 / Telegram payload 与签名结构正确', () => {
  assert.deepEqual(formatFeishuPayload('hi'), { msg_type: 'text', content: { text: 'hi' } });
  const signed = formatFeishuPayload('hi', { timestampSec: 1700000000, sign: 'SIGN' });
  assert.equal(signed.timestamp, '1700000000');
  assert.equal(signed.sign, 'SIGN');
  assert.deepEqual(formatTelegramPayload('hi', '-100123'), {
    chat_id: '-100123',
    text: 'hi',
    disable_web_page_preview: true,
  });
  assert.ok(telegramApiUrl('123456:ABC-DEF').includes('/bot123456:ABC-DEF/sendMessage'));

  const s1 = feishuSign('sec', 1700000000);
  assert.equal(s1, feishuSign('sec', 1700000000));
  assert.notEqual(s1, feishuSign('sec', 1700000001));
  assert.match(s1, /^[A-Za-z0-9+/=]+$/);
});

test('mergeSensitiveChannels: 脱敏占位 / 留空保持原密文，显式空串清空，新明文覆盖', () => {
  const existing = [
    { type: 'feishu', enabled: true, webhookUrl: 'enc:AAA', secret: 'enc:BBB' },
    { type: 'telegram', enabled: true, botToken: 'enc:CCC', chatId: '-1001' },
  ];
  const kept = mergeSensitiveChannels(existing, [
    { type: 'feishu', enabled: true, webhookUrl: MASKED_SECRET, secret: undefined },
    { type: 'telegram', enabled: true, chatId: '-1002' },
  ]);
  assert.equal(kept[0].webhookUrl, 'enc:AAA');
  assert.equal(kept[0].secret, 'enc:BBB');
  assert.equal(kept[1].botToken, 'enc:CCC');
  assert.equal(kept[1].chatId, '-1002');

  const replaced = mergeSensitiveChannels(existing, [
    { type: 'feishu', enabled: true, webhookUrl: 'https://open.feishu.cn/hook/new', secret: '' },
  ]);
  assert.equal(replaced[0].webhookUrl, 'https://open.feishu.cn/hook/new');
  assert.equal(replaced[0].secret, '');
});

test('encryptChannels 幂等：已加密字段不会二次加密，botToken 往返一致', () => {
  const c = new SecretCrypto(TEST_KEY);
  const one = encryptChannels([{ type: 'telegram', enabled: true, botToken: '123:ABC' }], c);
  assert.ok(one[0].botToken.startsWith('enc:'));
  const twice = encryptChannels(one, c);
  assert.equal(twice[0].botToken, one[0].botToken);
  assert.equal(decryptChannels(twice, c)[0].botToken, '123:ABC');
  assert.equal(maskChannel(one[0]).botToken, MASKED_SECRET);
});

test('extractTelegramChats: 私聊/群/频道去重，取会话名不取消息正文', () => {
  const updates = [
    { update_id: 1, message: { chat: { id: 123456, type: 'private', first_name: '张三', username: 'zhangsan' }, text: '请勿回显这段正文' } },
    { update_id: 2, message: { chat: { id: 123456, type: 'private', first_name: '张三' }, text: '重复会话' } },
    { update_id: 3, my_chat_member: { chat: { id: -1009876543210, type: 'supergroup', title: '运营群' } } },
    { update_id: 4, channel_post: { chat: { id: -100111, type: 'channel', title: '公告频道' } } },
    { update_id: 5, message: { chat: { type: 'private' } } }, // 无 id → 跳过
    { update_id: 6 }, // 无 message → 跳过
  ];
  const chats = extractTelegramChats(updates);
  assert.equal(chats.length, 3);
  assert.deepEqual(chats[0], { id: '123456', type: 'private', label: 'zhangsan' });
  assert.deepEqual(chats[1], { id: '-1009876543210', type: 'supergroup', label: '运营群' });
  assert.deepEqual(chats[2], { id: '-100111', type: 'channel', label: '公告频道' });
  assert.ok(!JSON.stringify(chats).includes('请勿回显'));
  assert.deepEqual(extractTelegramChats(null), []);
  assert.equal(extractTelegramChats(updates, 2).length, 2);
});

test('telegramGetUpdatesUrl: 拼官方端点、保留 token 冒号、limit 限幅', () => {
  assert.equal(
    telegramGetUpdatesUrl('123:ABC-DEF', 50),
    'https://api.telegram.org/bot123:ABC-DEF/getUpdates?limit=50',
  );
  assert.ok(telegramGetUpdatesUrl('t', 999).includes('limit=100'));
  assert.ok(telegramGetUpdatesUrl('t', 0).includes('limit=1'));
});

test('redactTelegramError: token / webhook / 网络错误脱敏', () => {
  const token = '123456:ABC-DEF';
  assert.ok(!redactTelegramError(`bad token ${token}`, token).includes(token));
  assert.match(
    redactTelegramError('bot can’t use getUpdates while webhook is active', token),
    /Webhook/,
  );
  assert.match(redactTelegramError('fetch failed', token), /网络代理/);
});

// ---- 群通知目标识别：确保消息能送达"工作通知群"而不是机器人私聊 ----

test('inferTelegramChatKind: 负数/@ 判群组、正数判私聊、其他 unknown', () => {
  assert.equal(inferTelegramChatKind('-1001234567890'), 'group');
  assert.equal(inferTelegramChatKind('-12345'), 'group');
  assert.equal(inferTelegramChatKind('@work_group'), 'group');
  assert.equal(inferTelegramChatKind('123456789'), 'private');
  assert.equal(inferTelegramChatKind(''), 'unknown');
  assert.equal(inferTelegramChatKind('abc'), 'unknown');
  assert.equal(inferTelegramChatKind(' -10099 '), 'group');
});

test('telegramChatKindLabel: 会话类型中文标签统一', () => {
  assert.equal(telegramChatKindLabel('private'), '私聊');
  assert.equal(telegramChatKindLabel('group'), '群组');
  assert.equal(telegramChatKindLabel('supergroup'), '群组');
  assert.equal(telegramChatKindLabel('channel'), '频道');
  assert.equal(telegramChatKindLabel('weird'), '会话');
});

test('sortTelegramChats: 群组/频道在前、私聊在后，不改原数组', () => {
  const input = [
    { id: '111', type: 'private', label: '张三' },
    { id: '-1002', type: 'supergroup', label: '运营群' },
    { id: '222', type: 'private', label: '李四' },
    { id: '-1001', type: 'channel', label: '公告' },
  ];
  const sorted = sortTelegramChats(input);
  // 先按 rank（群组/频道=0，私聊=1），同类再按 label 排序：
  // 群组「公告」「运营群」在前；私聊「李四」(li) 在「张三」(zhang) 前。
  assert.deepEqual(sorted.map((c) => c.id), ['-1001', '-1002', '222', '111']);
  assert.equal(input[0].id, '111'); // 原数组未被修改
});

test('parseTelegramChat: sendMessage 的 result.chat 与 getChat 的 result 本体都能解析', () => {
  const sendRes = {
    ok: true,
    result: { message_id: 7, chat: { id: -1009876543210, type: 'supergroup', title: '工作通知群' }, text: '正文不外泄' },
  };
  assert.deepEqual(parseTelegramChat(sendRes), {
    id: '-1009876543210',
    type: 'supergroup',
    label: '工作通知群',
  });
  const getRes = { ok: true, result: { id: 555, type: 'private', first_name: '张三', username: 'zs' } };
  assert.deepEqual(parseTelegramChat(getRes), { id: '555', type: 'private', label: 'zs' });
  const getGroupRes = { ok: true, result: { id: -1001, type: 'group', title: '项目群' } };
  assert.deepEqual(parseTelegramChat(getGroupRes), { id: '-1001', type: 'group', label: '项目群' });
  assert.equal(parseTelegramChat({ ok: false, description: 'chat not found' }), null);
  assert.equal(parseTelegramChat(null), null);
  assert.ok(!JSON.stringify(parseTelegramChat(sendRes)).includes('正文'));
});

test('telegramGetChatUrl: 拼官方 getChat 端点、chat_id 做 URL 编码', () => {
  const url = telegramGetChatUrl('123:ABC-DEF', '-1001234567890');
  assert.ok(url.includes('/bot123:ABC-DEF/getChat'));
  assert.ok(url.includes('chat_id=-1001234567890'));
  const at = telegramGetChatUrl('t', '@my_group');
  assert.ok(at.includes('chat_id=%40my_group'));
});
