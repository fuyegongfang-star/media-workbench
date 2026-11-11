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
  dingtalkSign,
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
  assert.deepEqual(CHANNEL_TYPES, ['wecom', 'dingtalk', 'email']);
  assert.ok(ALERT_KINDS.includes('liveness') && ALERT_KINDS.includes('quota'));
});
