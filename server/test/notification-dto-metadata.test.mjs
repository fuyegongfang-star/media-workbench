// 回归测试：通知控制器必须把 DTO 作为「值」导入。
// 背景：曾把 DTO 写成 `import { type XxxDto }`，编译后 design:paramtypes 变成 Function，
// 全局 ValidationPipe(forbidNonWhitelisted) 会拒绝所有请求字段 → 保存/测试全部 HTTP 400。
// 运行：node --test server/test/notification-dto-metadata.test.mjs（需先 npm run build）
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import nestCommon from '@nestjs/common';
import cv from 'class-validator';
import ct from 'class-transformer';
import { NotificationController } from '../dist/modules/notification/notification.controller.js';
import {
  SendAlertDto,
  SendTestDto,
  TelegramChatsDto,
  TelegramProbeDto,
  UpsertNotificationChannelsDto,
} from '../dist/modules/notification/dto/notification.dto.js';

const { ValidationPipe } = nestCommon;
const { validate } = cv;
const { plainToInstance } = ct;

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

const bodyCases = [
  ['upsert', UpsertNotificationChannelsDto],
  ['test', SendTestDto],
  ['telegramChats', TelegramChatsDto],
  ['telegramProbe', TelegramProbeDto],
  ['alert', SendAlertDto],
];

for (const [method, Dto] of bodyCases) {
  test(`NotificationController.${method} 的 Body DTO 元数据是真实类（不是 Function）`, () => {
    const params = Reflect.getMetadata('design:paramtypes', NotificationController.prototype, method);
    assert.ok(Array.isArray(params) && params.length > 0, '应存在 design:paramtypes 元数据');
    assert.equal(params[0], Dto, '必须是 DTO 类本身，否则 ValidationPipe 白名单会拒绝所有字段');
    assert.notEqual(params[0], Function, 'type-only import 会被擦除为 Function，属于回归 bug');
  });
}

test('TelegramProbeDto：合法表单体通过白名单校验（回归：曾整表 400）', async () => {
  const body = { botToken: `1234567890:${'A'.repeat(35)}`, chatId: '9120045106' };
  assert.equal(
    (await validate(plainToInstance(TelegramProbeDto, body))).length,
    0,
    '合法 Token/Chat ID 不应产生校验错误',
  );
  const out = await pipe.transform(body, { type: 'body', metatype: TelegramProbeDto });
  assert.equal(out.chatId, body.chatId);
  assert.equal(out.botToken, body.botToken);
});

test('TelegramProbeDto：多余字段仍被 forbidNonWhitelisted 拒绝（安全边界不放松）', async () => {
  let message = '';
  try {
    await pipe.transform(
      { botToken: 'x', chatId: '1', injected: true },
      { type: 'body', metatype: TelegramProbeDto },
    );
  } catch (error) {
    const response = (error).getResponse?.();
    message = Array.isArray(response?.message) ? response.message.join('；') : String(response?.message ?? '');
  }
  assert.match(message, /property injected should not exist/, '白名单仍应拒绝未知字段');
});
