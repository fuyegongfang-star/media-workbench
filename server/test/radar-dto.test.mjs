// 雷达 DTO 白名单校验回归测试：确保新增配置项不会被全局 ValidationPipe(forbidNonWhitelisted) 拒绝。
// 运行：node --test server/test/radar-dto.test.mjs（需先 npm run build）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import cv from 'class-validator';
import ct from 'class-transformer';
import nestCommon from '@nestjs/common';
import dto from '../dist/modules/radar/dto/radar-config.dto.js';

const { validate } = cv;
const { plainToInstance } = ct;
const { ValidationPipe } = nestCommon;

const { RadarConfigDto } = dto;

// 模拟 main.ts 的全局管道：whitelist + forbidNonWhitelisted + transform
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

test('RadarConfigDto: 带 accountDedupeDays 的完整前端配置应通过白名单校验（回归：曾缺失该字段导致 400）', async () => {
  const body = {
    niches: [{ name: 'AI', enabled: true, keywords: ['AI'] }],
    sources: { toutiao: true, youtube_account: true },
    output: { totalItems: 20, featuredItems: 5, titlesPerItem: 3, saveToLibrary: true },
    schedule: { enabled: false, time: '08:00', timezone: 'Asia/Shanghai' },
    monitoredAccounts: { x: ['elonmusk'], youtube: ['@MrBeast'] },
    accountDedupeDays: 7,
  };
  const errors = await validate(plainToInstance(RadarConfigDto, body));
  assert.equal(errors.length, 0, `不应有校验错误：${JSON.stringify(errors.map((e) => e.property))}`);
  const transformed = await pipe.transform(body, { type: 'body', metatype: RadarConfigDto });
  assert.equal(transformed.accountDedupeDays, 7);
});

test('RadarConfigDto: accountDedupeDays 越界被拒、缺省通过', async () => {
  const bad = plainToInstance(RadarConfigDto, { accountDedupeDays: 999 });
  const errs = await validate(bad);
  assert.ok(errs.some((e) => e.property === 'accountDedupeDays'), '999 应被 @Max(90) 拒绝');
  const neg = plainToInstance(RadarConfigDto, { accountDedupeDays: -1 });
  assert.ok((await validate(neg)).some((e) => e.property === 'accountDedupeDays'), '-1 应被 @Min(0) 拒绝');
  assert.equal((await validate(plainToInstance(RadarConfigDto, {}))).length, 0, '缺省字段应通过');
});
