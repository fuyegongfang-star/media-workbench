// T1.8 系统设置纯函数单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/system.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import crypto from '../dist/modules/system/crypto.util.js';
import util from '../dist/modules/system/system.util.js';

const { SecretCrypto, maskSecret, getSecretCrypto } = crypto;
const { mergeCompliance, DEFAULT_COMPLIANCE } = util;

const TEST_KEY = randomBytes(32).toString('hex');

test('SecretCrypto: 往返加密/解密一致，且相同明文每次密文不同', () => {
  const c = new SecretCrypto(TEST_KEY);
  const plain = 'wxabcdefghijklmn1234567890';
  const e1 = c.encrypt(plain);
  const e2 = c.encrypt(plain);
  assert.notEqual(e1, e2); // 随机 IV
  assert.equal(c.decrypt(e1), plain);
  assert.equal(c.decrypt(e2), plain);
});

test('SecretCrypto: 空明文返回空串（表示未配置）', () => {
  const c = new SecretCrypto(TEST_KEY);
  assert.equal(c.encrypt(''), '');
  assert.equal(c.decrypt(''), '');
});

test('SecretCrypto: 错误主密钥长度抛错', () => {
  assert.throws(() => new SecretCrypto('tooshort'), /64 位 hex/);
});

test('getSecretCrypto: 缺失/占位主密钥在调用时抛错（不阻断启动）', () => {
  const saved = process.env.APP_MASTER_KEY;
  delete process.env.APP_MASTER_KEY;
  try {
    assert.throws(() => getSecretCrypto(), /APP_MASTER_KEY 未配置/);
  } finally {
    if (saved !== undefined) process.env.APP_MASTER_KEY = saved;
  }
});

test('maskSecret: 保留前缀3+尾4，中间打码', () => {
  assert.equal(maskSecret('wxabcdefghijklmn'), 'wxa****klmn');
  assert.equal(maskSecret(''), '');
  assert.equal(maskSecret('short'), '****');
});

test('mergeCompliance: 默认 → 已存 → 入参 覆盖，且忽略非布尔', () => {
  const r = mergeCompliance({ autoSaveEnabled: false }, { strictReview: true, junk: 'x' });
  assert.equal(r.aiDisclosureRequired, true); // 默认
  assert.equal(r.autoSaveEnabled, false); // 已存覆盖默认
  assert.equal(r.strictReview, true); // 入参覆盖
  assert.equal(r.junk, undefined); // 非布尔忽略
  assert.deepEqual(r, { aiDisclosureRequired: true, autoSaveEnabled: false, strictReview: true });
});

test('mergeCompliance: 全空返回默认', () => {
  assert.deepEqual(mergeCompliance(null, null), DEFAULT_COMPLIANCE);
});
