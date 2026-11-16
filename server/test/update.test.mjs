/**
 * 在线更新（T6.5）单测：纯函数 + UpdateService 的文件协议。
 * 不触网、不依赖 PG/Redis/docker；用临时目录模拟共享 storage 卷。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import util from '../dist/modules/system/update.util.js';
import { UpdateService } from '../dist/modules/system/update.service.js';

const {
  parseJsonSafe, normalizeStatus, normalizeCheck, normalizePhase,
  isHeartbeatFresh, tailLines, canTrigger, HEARTBEAT_MAX_AGE_SEC,
} = util;

const NOW = 1_700_000_000;

async function makeService() {
  const root = await mkdtemp(join(tmpdir(), 'mw-update-'));
  const config = { get: () => root };
  const svc = new UpdateService(config);
  return { root, svc, dir: join(root, 'update') };
}

// ---------- 纯函数 ----------

test('parseJsonSafe: 合法对象 / 坏 JSON / null / 数组均安全降级', () => {
  assert.deepEqual(parseJsonSafe('{"a":1}'), { a: 1 });
  assert.equal(parseJsonSafe('{bad'), null);
  assert.equal(parseJsonSafe(null), null);
  assert.equal(parseJsonSafe(''), null);
  assert.equal(parseJsonSafe('[1,2]'), null);
  assert.equal(parseJsonSafe('null'), null);
});

test('isHeartbeatFresh: 新鲜通过、过期/缺失/异常时间拒绝', () => {
  assert.equal(isHeartbeatFresh({ ts: NOW - 5 }, NOW), true);
  assert.equal(isHeartbeatFresh({ ts: NOW - HEARTBEAT_MAX_AGE_SEC }, NOW), true);
  assert.equal(isHeartbeatFresh({ ts: NOW - HEARTBEAT_MAX_AGE_SEC - 1 }, NOW), false);
  assert.equal(isHeartbeatFresh(null, NOW), false);
  assert.equal(isHeartbeatFresh({}, NOW), false);
  assert.equal(isHeartbeatFresh({ ts: NOW + 99999 }, NOW), false);
  assert.equal(isHeartbeatFresh({ ts: NOW - 30 }, NOW, 60), true);
});

test('normalizeStatus: 缺文件时降级 unknown，字段逐个兜底', () => {
  const empty = normalizeStatus(null);
  assert.equal(empty.phase, 'unknown');
  assert.equal(empty.currentCommit, '');
  assert.match(empty.message, /未检测到/);
  const full = normalizeStatus({
    phase: 'success', type: 'apply', requestId: 'r1', message: 'ok',
    currentCommit: 'abc123', remoteCommit: 'def456',
    startedAt: 't1', finishedAt: 't2', updatedAt: 't3',
  });
  assert.equal(full.phase, 'success');
  assert.equal(full.currentCommit, 'abc123');
  assert.equal(full.remoteCommit, 'def456');
  assert.equal(normalizePhase('weird'), 'unknown');
  assert.equal(normalizePhase('running'), 'running');
});

test('normalizeCheck: 数字/布尔字段类型兜底，非对象返回 null', () => {
  assert.equal(normalizeCheck(null), null);
  const c = normalizeCheck({
    checkedAt: 't', localCommit: 'a', remoteCommit: 'b',
    behindBy: 3, aheadBy: 0, upToDate: false, branch: 'main', error: '',
  });
  assert.equal(c.behindBy, 3);
  assert.equal(c.upToDate, false);
  const bad = normalizeCheck({ behindBy: 'NaN', aheadBy: null, upToDate: 'false' });
  assert.equal(bad.behindBy, 0);
  assert.equal(bad.aheadBy, 0);
  assert.equal(bad.upToDate, false);
});

test('tailLines: 去空行、按行尾截取、超长安全', () => {
  assert.deepEqual(tailLines('a\nb\nc', 2), ['b', 'c']);
  assert.deepEqual(tailLines('a\n\n b \n', 5), ['a', ' b']);
  assert.deepEqual(tailLines(null, 10), []);
  assert.deepEqual(tailLines('only', 0), ['only']);
});

test('canTrigger: 无心跳 503 文案 / running 冲突 / 空闲放行', () => {
  assert.equal(canTrigger('idle', false).ok, false);
  assert.match(canTrigger('idle', false).reason, /未运行/);
  assert.equal(canTrigger('running', true).ok, false);
  assert.match(canTrigger('running', true).reason, /正在执行/);
  assert.equal(canTrigger('success', true).ok, true);
  assert.equal(canTrigger('unknown', true).ok, true);
});

// ---------- Service：文件协议 ----------

test('getStatus: 空状态目录 → 不可用 + unknown + 空日志', async () => {
  const { svc, root } = await makeService();
  try {
    const s = await svc.getStatus();
    assert.equal(s.available, false);
    assert.equal(s.phase, 'unknown');
    assert.equal(s.check, null);
    assert.deepEqual(s.log, []);
    assert.ok(s.serverTime);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('getStatus: 心跳+状态+检查+日志正确合并', async () => {
  const { svc, root, dir } = await makeService();
  try {
    await mkdir(dir, { recursive: true });
    const now = Math.floor(Date.now() / 1000);
    await writeFile(join(dir, 'heartbeat.json'), JSON.stringify({ ts: now }));
    await writeFile(join(dir, 'status.json'), JSON.stringify({
      phase: 'success', type: 'apply', message: '更新完成', currentCommit: 'aaa111',
    }));
    await writeFile(join(dir, 'check.json'), JSON.stringify({
      checkedAt: 't', localCommit: 'a', remoteCommit: 'b',
      behindBy: 0, aheadBy: 0, upToDate: true, branch: 'main', error: '',
    }));
    await writeFile(join(dir, 'log.txt'), 'line1\nline2\nline3\n');
    const s = await svc.getStatus();
    assert.equal(s.available, true);
    assert.equal(s.phase, 'success');
    assert.equal(s.currentCommit, 'aaa111');
    assert.equal(s.check.upToDate, true);
    assert.deepEqual(s.log, ['line1', 'line2', 'line3']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trigger: updater 未运行时拒绝，不写请求文件', async () => {
  const { svc, root, dir } = await makeService();
  try {
    await assert.rejects(
      () => svc.trigger('check', 'admin'),
      (e) => e?.getStatus?.() === 503,
    );
    const raw = await readFile(join(dir, 'request.json'), 'utf8').catch(() => null);
    assert.equal(raw, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trigger: 存活时原子写 request.json，字段齐全且无 tmp 残留', async () => {
  const { svc, root, dir } = await makeService();
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'heartbeat.json'), JSON.stringify({ ts: Math.floor(Date.now() / 1000) }));
    await writeFile(join(dir, 'status.json'), JSON.stringify({ phase: 'idle' }));

    const res = await svc.trigger('check', 'admin');
    assert.equal(res.accepted, true);
    assert.match(res.requestId, /^[0-9a-f-]{36}$/);

    const payload = JSON.parse(await readFile(join(dir, 'request.json'), 'utf8'));
    assert.equal(payload.id, res.requestId);
    assert.equal(payload.type, 'check');
    assert.equal(payload.requestedBy, 'admin');
    assert.ok(payload.requestedAt);

    const { readdir } = await import('node:fs/promises');
    const files = await readdir(dir);
    assert.equal(files.some((f) => f.endsWith('.tmp')), false, '不应残留 tmp 文件');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trigger: running 中重复提交被拦截（check 与 apply 共用锁）', async () => {
  const { svc, root, dir } = await makeService();
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'heartbeat.json'), JSON.stringify({ ts: Math.floor(Date.now() / 1000) }));
    await writeFile(join(dir, 'status.json'), JSON.stringify({ phase: 'running', type: 'apply' }));
    await assert.rejects(
      () => svc.trigger('apply', 'admin'),
      (e) => e?.getStatus?.() === 409,
    );
    const raw = await readFile(join(dir, 'request.json'), 'utf8').catch(() => null);
    assert.equal(raw, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trigger: 坏状态文件不阻断请求（防御式解析）', async () => {
  const { svc, root, dir } = await makeService();
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'heartbeat.json'), '{broken');
    await writeFile(join(dir, 'status.json'), '{also-broken');
    await assert.rejects(
      () => svc.trigger('check', 'admin'),
      (e) => e?.getStatus?.() === 503,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
