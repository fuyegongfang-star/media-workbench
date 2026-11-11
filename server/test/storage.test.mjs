// T1.4 纯函数 + 真实落盘单测（不依赖数据库）：用 Node 内置 node --test 运行。
// 运行：node --test server/test/storage.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import util from '../dist/modules/storage/storage.util.js';
import svcMod from '../dist/modules/storage/storage.service.js';

const {
  computeSha256,
  contentAddressablePath,
  detectMediaType,
  sanitizeExt,
  safeJoin,
  isValidChecksum,
  magicToMime,
} = util;
const { StorageService } = svcMod;

// sha256("abc") 已知值，验证哈希实现正确
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

test('computeSha256: 已知向量结果正确', () => {
  assert.equal(computeSha256(Buffer.from('abc')), SHA256_ABC);
});

test('contentAddressablePath: aa/bb/<sha256> 三段结构', () => {
  const p = contentAddressablePath(SHA256_ABC);
  assert.equal(p, `${SHA256_ABC.slice(0, 2)}/${SHA256_ABC.slice(2, 4)}/${SHA256_ABC}`);
});

test('detectMediaType: 扩展名映射正确，未知归 file', () => {
  assert.equal(detectMediaType('a.png'), 'image');
  assert.equal(detectMediaType('b.MP4'), 'video');
  assert.equal(detectMediaType('c.mp3'), 'audio');
  assert.equal(detectMediaType('d.pdf'), 'file');
  assert.equal(detectMediaType('noext'), 'file');
});

test('sanitizeExt: 小写去点，最长 10', () => {
  assert.equal(sanitizeExt('x.JPEG'), 'jpeg');
  assert.equal(sanitizeExt('y'), '');
  assert.equal(sanitizeExt('z.verylongextension'), 'verylongex');
});

test('safeJoin: 阻止路径穿越', () => {
  assert.doesNotThrow(() => safeJoin('/data', 'aa/bb', 'cc'));
  assert.throws(() => safeJoin('/data', '../../etc/passwd'), /路径穿越/);
});

test('isValidChecksum: 仅接受 64 位 hex', () => {
  assert.equal(isValidChecksum(SHA256_ABC), true);
  assert.equal(isValidChecksum('xyz'), false);
  assert.equal(isValidChecksum(SHA256_ABC.slice(0, 10)), false);
});

test('magicToMime: 按文件头识别 PNG/JPEG/MP4/PDF', () => {
  assert.equal(magicToMime(Buffer.from('89504e470d0a1a0a', 'hex')), 'image/png');
  assert.equal(magicToMime(Buffer.from('ffd8ff', 'hex')), 'image/jpeg');
  assert.equal(magicToMime(Buffer.from('000000186674797069736f6d', 'hex')), 'video/mp4');
  assert.equal(magicToMime(Buffer.from('%PDF', 'ascii')), 'application/pdf');
  assert.equal(magicToMime(Buffer.from('hello')), 'application/octet-stream');
});

test('StorageService 端到端：落盘 + 内容寻址去重 + 读回校验和一致', async () => {
  const root = await mkdtemp(join(tmpdir(), 't14-'));
  try {
    const config = { get: (k) => (k === 'STORAGE_ROOT' ? root : undefined) };
    const svc = new StorageService(config);
    await svc.onModuleInit();

    const payload = Buffer.from('自媒体工作台 文件内容 2026');
    const sum1 = await svc.saveBuffer(payload, 'note.txt');
    assert.equal(sum1.checksum, computeSha256(payload));
    assert.equal(sum1.relativePath, contentAddressablePath(sum1.checksum));

    // 再次写入相同内容 → 内容寻址天然去重，不产生第二份
    const sum2 = await svc.saveBuffer(payload, 'note-copy.txt');
    assert.equal(sum2.checksum, sum1.checksum);

    // 按校验和定位存在，且读回内容与原文一致、校验和一致
    const peek = await svc.peekByChecksum(sum1.checksum);
    assert.equal(peek.exists, true);
    const back = await readFile(peek.absolutePath);
    assert.equal(back.toString('utf8'), payload.toString('utf8'));
    assert.equal(computeSha256(back), sum1.checksum);

    // 按校验和流式读取后比对
    const streamed = await new Promise((res, rej) => {
      const chunks = [];
      const rs = svc.openReadStream(sum1.checksum);
      rs.on('data', (c) => chunks.push(c));
      rs.on('end', () => res(Buffer.concat(chunks)));
      rs.on('error', rej);
    });
    assert.equal(streamed.toString('utf8'), payload.toString('utf8'));

    // 嗅探内容类型（此处为文本 → octet-stream）
    const mime = await svc.sniffContentType(sum1.checksum);
    assert.equal(mime, 'application/octet-stream');

    // 非法校验和被拒
    await assert.rejects(() => svc.peekByChecksum('deadbeef'), /非法校验和/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('StorageService 嗅探 PNG：写 PNG 头 → image/png', async () => {
  const root = await mkdtemp(join(tmpdir(), 't14-png-'));
  try {
    const config = { get: (k) => (k === 'STORAGE_ROOT' ? root : undefined) };
    const svc = new StorageService(config);
    await svc.onModuleInit();
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('payload')]);
    const m = await svc.saveBuffer(png, 'pic.png');
    assert.equal(await svc.sniffContentType(m.checksum), 'image/png');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
