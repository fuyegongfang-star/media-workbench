/**
 * T1.6 备份脚本纯函数 + 原语单测（Node 内置 node:test，不依赖 pg_dump/rsync）。
 * 运行：node --test server/test/backup.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { timestampTag } from '../../scripts/backup-shared.mjs';
import {
  stripUrlQuery,
  dbNameFromUrl,
  dbHostFromUrl,
  dumpBaseName,
  prunePlan,
  redactDbUrl,
} from '../../scripts/backup-db.mjs';
import {
  mirrorNode,
  snapshotNode,
  pruneSnapshots,
} from '../../scripts/backup-files.mjs';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('timestampTag 生成可排序且无分隔符', () => {
  const t = timestampTag(new Date('2026-11-03T07:23:29'));
  assert.equal(t, '20261103T072329');
  assert.match(t, /^\d{8}T\d{6}$/);
});

test('stripUrlQuery 去除查询串与片段', () => {
  assert.equal(
    stripUrlQuery('postgresql://u:p@h:5432/db?schema=public'),
    'postgresql://u:p@h:5432/db',
  );
  assert.equal(stripUrlQuery('postgresql://u:p@h:5432/db#frag'), 'postgresql://u:p@h:5432/db');
  assert.equal(stripUrlQuery('postgresql://u:p@h:5432/db'), 'postgresql://u:p@h:5432/db');
});

test('dbNameFromUrl / dbHostFromUrl 解析且不泄露口令', () => {
  const url = 'postgresql://user:p%40ss@db.example.com:5432/media_workbench?schema=public';
  assert.equal(dbNameFromUrl(url), 'media_workbench');
  assert.equal(dbHostFromUrl(url), 'db.example.com:5432');
});

test('dumpBaseName 净化库名特殊字符', () => {
  assert.equal(dumpBaseName('media_workbench', 'TAG'), 'pgdump-media_workbench-TAG.sql.gz');
  assert.equal(dumpBaseName('weird db/name', 'TAG'), 'pgdump-weird_db_name-TAG.sql.gz');
});

test('redactDbUrl 仅遮蔽口令不泄露', () => {
  assert.equal(
    redactDbUrl('postgresql://user:secret@db:5432/media_workbench'),
    'postgresql://user:***@db:5432/media_workbench',
  );
  assert.equal(
    redactDbUrl('postgresql://user:secret@db:5432/db?schema=public'),
    'postgresql://user:***@db:5432/db?schema=public',
  );
});

test('prunePlan 保留最近 keep 份、按升序清理最旧', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-prune-'));
  for (const n of [
    'pgdump-db-20260101T000000.sql.gz',
    'pgdump-db-20260201T000000.sql.gz',
    'pgdump-db-20260301T000000.sql.gz',
  ]) {
    writeFileSync(join(dir, n), 'x');
  }
  const plan = prunePlan(dir, 'pgdump-', 2);
  assert.equal(plan.remove.length, 1);
  assert.equal(plan.remove[0], 'pgdump-db-20260101T000000.sql.gz');
  assert.equal(plan.kept.length, 2);
  for (const f of plan.remove) rmSync(join(dir, f), { force: true });
  assert.equal(readdirSync(dir).length, 2);
});

test('mirrorNode 全量镜像并同步清理已删文件', () => {
  const base = mkdtempSync(join(tmpdir(), 'mw-mirror-'));
  const src = join(base, 'src');
  const dst = join(base, 'dst');
  mkdirSync(join(src, 'sub'), { recursive: true });
  writeFileSync(join(src, 'sub', 'a.txt'), 'A');
  writeFileSync(join(src, 'b.txt'), 'B');
  mirrorNode(src, dst);
  assert.ok(existsSync(join(dst, 'sub', 'a.txt')));
  assert.ok(existsSync(join(dst, 'b.txt')));
  // 删除源文件后重新镜像 → 目标同步删除
  rmSync(join(src, 'b.txt'));
  mirrorNode(src, dst);
  assert.ok(!existsSync(join(dst, 'b.txt')));
});

test('snapshotNode 深拷贝子目录与文件', () => {
  const base = mkdtempSync(join(tmpdir(), 'mw-snap-'));
  const src = join(base, 's');
  const dst = join(base, 'd');
  mkdirSync(join(src, 'x'), { recursive: true });
  writeFileSync(join(src, 'x', 'f.txt'), 'content');
  snapshotNode(src, dst);
  assert.ok(existsSync(join(dst, 'x', 'f.txt')));
});

test('pruneSnapshots 保留最近 keep 个快照目录', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-snaps-'));
  for (const n of [
    'storage-20260101T000000',
    'storage-20260201T000000',
    'storage-20260301T000000',
  ]) {
    mkdirSync(join(dir, n), { recursive: true });
  }
  const plan = pruneSnapshots(dir, 'storage-', 2);
  assert.equal(plan.remove.length, 1);
  assert.equal(plan.remove[0], 'storage-20260101T000000');
  assert.equal(plan.kept.length, 2);
});
