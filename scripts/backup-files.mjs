#!/usr/bin/env node
/**
 * 存储文件备份骨架（T1.6）。
 *
 * 策略（优选到降级）：
 *   1) 最新镜像 <BACKUP_ROOT>/storage-latest/ 用 rsync -a --delete 与 STORAGE_ROOT 同步；
 *   2) 每次运行对 latest 拍一份时间戳快照到 <BACKUP_ROOT>/storage-snapshots/storage-<时间戳>/：
 *      - 优先 cp -al 硬链接（同文件系统，几乎零额外空间）；
 *      - 不可用时回退 Node 原生深拷贝；
 *   3) 按 keep（默认 14）保留最近 N 个快照，旧快照目录清理。
 *   rsync/cp 不可用时（如本机 Windows），整套回退 Node 原生「先清空再 cpSync」镜像 + 深拷贝快照，
 *   因此可在本机用 --self-test 真实验证镜像与轮换逻辑，无需 rsync。
 *
 * 安全：仅复制用户文件，不涉及密钥；STORAGE_ROOT 来自环境变量，路径不做用户拼接。
 *
 * 用法：
 *   node scripts/backup-files.mjs               # 真实备份（优先 rsync）
 *   node scripts/backup-files.mjs --force-node  # 强制 Node 原生（禁用 rsync/hardlink）
 *   node scripts/backup-files.mjs --dry-run     # 打印计划，不落盘
 *   node scripts/backup-files.mjs --self-test   # 临时目录真实验证镜像+快照轮换
 * 环境变量：STORAGE_ROOT（默认 ./storage）、BACKUP_ROOT（默认 ./backups）、BACKUP_KEEP（默认 14）
 */
import { spawnSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  cpSync,
  statSync,
  writeFileSync,
  mkdtempSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadEnvFile } from './env-load.mjs';
import { timestampTag } from './backup-shared.mjs';

// ---------------- 纯函数 / 可测原语 ----------------

/** 探测 rsync 是否在 PATH 中（Windows 用 where，其余用 command -v）。 */
export function hasRsync() {
  const r = spawnSync(
    process.platform === 'win32' ? 'where' : 'command',
    process.platform === 'win32' ? ['rsync'] : ['-v', 'rsync'],
    { stdio: 'ignore' },
  );
  return r.status === 0;
}

/** Node 原生全量镜像：先清空目标再递归拷贝（保证删除的文件被同步移除）。 */
export function mirrorNode(src, dst) {
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  if (existsSync(src)) cpSync(src, dst, { recursive: true });
}

/** rsync 镜像（带 --delete 同步删除）。 */
export function mirrorRsync(src, dst) {
  mkdirSync(dst, { recursive: true });
  const r = spawnSync('rsync', ['-a', '--delete', `${src}/`, `${dst}/`], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`rsync 退出码 ${r.status}`);
}

/** Node 原生深拷贝快照。 */
export function snapshotNode(src, dst) {
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dirname(dst), { recursive: true });
  if (existsSync(src)) cpSync(src, dst, { recursive: true });
}

/** 硬链接快照（cp -al），同文件系统近乎零成本；失败返回 false。 */
export function snapshotHardlink(src, dst) {
  mkdirSync(dirname(dst), { recursive: true });
  const r = spawnSync('cp', ['-al', `${src}/.`, `${dst}/`], { stdio: 'inherit' });
  return r.status === 0;
}

/**
 * 清理快照目录：保留最近 keep 个（按目录名升序 = 时间从旧到新）。
 * 直接执行删除，返回 { remove, kept }。
 */
export function pruneSnapshots(dir, prefix, keep) {
  const safeKeep = Math.max(0, keep | 0);
  if (!existsSync(dir)) return { remove: [], kept: [] };
  const dirs = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && statSync(join(dir, f)).isDirectory())
    .sort();
  const excess = Math.max(0, dirs.length - safeKeep);
  const remove = dirs.slice(0, excess);
  const kept = dirs.slice(excess);
  for (const d of remove) rmSync(join(dir, d), { recursive: true, force: true });
  return { remove, kept };
}

// ---------------- 主流程 ----------------

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

export async function runBackupFiles({
  storageRoot,
  backupRoot,
  keep = 14,
  forceNode = false,
  dryRun = false,
} = {}) {
  const src = resolve(storageRoot ?? process.env.STORAGE_ROOT ?? './storage');
  const root = resolve(backupRoot ?? process.env.BACKUP_ROOT ?? './backups');
  const latestDir = join(root, 'storage-latest');
  const snapDir = join(root, 'storage-snapshots');
  const tag = timestampTag();
  const snapPath = join(snapDir, `storage-${tag}`);
  const useRsync = !forceNode && hasRsync();

  if (dryRun) {
    return { dryRun: true, src, latestDir, snapPath, strategy: useRsync ? 'rsync' : 'node-native', keep };
  }

  mkdirSync(latestDir, { recursive: true });
  mkdirSync(snapDir, { recursive: true });

  if (useRsync) {
    mirrorRsync(src, latestDir);
  } else {
    mirrorNode(src, latestDir);
  }

  let snapshotStrategy = 'node-native';
  if (!forceNode && snapshotHardlink(latestDir, snapPath)) {
    snapshotStrategy = 'hardlink';
  } else {
    snapshotNode(latestDir, snapPath);
  }

  const plan = pruneSnapshots(snapDir, 'storage-', keep);

  return {
    dryRun: false,
    src,
    latestDir,
    snapPath,
    strategy: useRsync ? 'rsync' : 'node-native',
    snapshotStrategy,
    kept: plan.kept.length,
    removed: plan.remove,
    keep,
  };
}

if (isMain()) {
  const dryRun = process.argv.includes('--dry-run');
  const selfTest = process.argv.includes('--self-test');
  const forceNode = process.argv.includes('--force-node');
  const keep = Number(process.env.BACKUP_KEEP ?? 14);
  loadEnvFile();
  try {
    if (selfTest) {
      const tmp = mkdtempSync(join(tmpdir(), 'mw-bak-')); // 本机真实验证（强制 Node 原生）
      const src = join(tmp, 'storage');
      const bk = join(tmp, 'backups');
      mkdirSync(join(src, 'a'), { recursive: true });
      writeFileSync(join(src, 'a', 'x.txt'), 'hello');

      const r1 = await runBackupFiles({ storageRoot: src, backupRoot: bk, keep: 1, forceNode: true });
      writeFileSync(join(src, 'a', 'y.txt'), 'world');
      await runBackupFiles({ storageRoot: src, backupRoot: bk, keep: 1, forceNode: true });
      // 最新镜像应含新增文件 y.txt
      if (!existsSync(join(bk, 'storage-latest', 'a', 'y.txt'))) {
        throw new Error('latest 镜像未包含新增文件');
      }
      // 第三轮后 keep=1 应只剩 1 个快照
      writeFileSync(join(src, 'a', 'z.txt'), '!');
      const r3 = await runBackupFiles({ storageRoot: src, backupRoot: bk, keep: 1, forceNode: true });
      const snapCount = readdirSync(join(bk, 'storage-snapshots')).filter((f) =>
        f.startsWith('storage-'),
      ).length;
      if (snapCount !== 1) throw new Error(`保留快照数应为 1，实际 ${snapCount}`);
      console.log(
        `backup-files 自检通过：镜像+快照轮换(keep=1)正确；最新镜像含 y.txt；旧快照已清理至 ${r3.kept} 份`,
      );
      process.exit(0);
    }
    const res = await runBackupFiles({ keep, forceNode, dryRun });
    if (dryRun) {
      console.log('[dry-run] 文件备份计划：');
      console.log(`  src=${res.src}`);
      console.log(`  latest=${res.latestDir}`);
      console.log(`  snapshot=${res.snapPath}`);
      console.log(`  strategy=${res.strategy} keep=${res.keep}`);
    } else {
      console.log(`文件备份完成（镜像 ${res.strategy}，快照 ${res.snapshotStrategy}）：`);
      console.log(`  最新镜像：${res.latestDir}`);
      console.log(`  本次快照：${res.snapPath}`);
      console.log(`  保留 ${res.kept} 份快照，清理 ${res.removed.length} 份旧快照（保留最近 ${res.keep} 份）`);
    }
  } catch (e) {
    console.error('文件备份失败：', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
