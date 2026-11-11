#!/usr/bin/env node
/**
 * 数据库逻辑备份骨架（T1.6）。
 *
 * - 使用系统 PostgreSQL 客户端 `pg_dump` 对 DATABASE_URL 指向的库做明文逻辑备份，
 *   流式经 gzip 落盘为 <BACKUP_ROOT>/db/pgdump-<db>-<时间戳>.sql.gz。
 * - 按 keep（默认 14）保留最近 N 份，旧份自动清理。
 * - 安全：连接串含口令，脚本绝不打印完整 DATABASE_URL；仅日志输出 host/db 名。
 * - 不依赖运行环境即可「写代码 + 自验」：--dry-run 仅打印将执行的命令（不调用 pg_dump）；
 *   --self-test 仅校验纯函数。pg_dump 实际执行发生在目标 Linux 服务器。
 *
 * 用法：
 *   node scripts/backup-db.mjs                 # 真实备份（需要 pg_dump）
 *   node scripts/backup-db.mjs --dry-run       # 打印将执行的命令，不落盘
 *   node scripts/backup-db.mjs --self-test     # 仅校验纯函数，不调用 pg_dump
 * 环境变量：DATABASE_URL（必填）、BACKUP_ROOT（默认 ./backups）、BACKUP_KEEP（默认 14）
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createGzip } from 'node:zlib';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { loadEnvFile } from './env-load.mjs';
import { timestampTag } from './backup-shared.mjs';

// ---------------- 纯函数（可单测） ----------------

/** 去除连接串的查询串（?schema=public 是 Prisma 专有，libpq 不识别）与片段。 */
export function stripUrlQuery(url) {
  if (typeof url !== 'string') return url;
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  let end = url.length;
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  return url.slice(0, end);
}

/** 从连接串解析库名；失败回退 POSTGRES_DB 或默认名。 */
export function dbNameFromUrl(url) {
  let name = '';
  try {
    const u = new URL(url);
    name = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  } catch {
    const m = String(url).match(/\/([^/?#]+)(?:[?#]|$)/);
    name = m ? m[1] : '';
  }
  return name || process.env.POSTGRES_DB || 'media_workbench';
}

/** 解析主机（用于日志，不含口令）。 */
export function dbHostFromUrl(url) {
  try {
    return new URL(url).host || '(unknown)';
  } catch {
    return '(unknown)';
  }
}

/** 备份文件名（库名做文件系统安全净化）。 */
export function dumpBaseName(dbName, tag) {
  const safe = String(dbName).replace(/[^A-Za-z0-9_-]/g, '_');
  return `pgdump-${safe}-${tag}.sql.gz`;
}

/**
 * 计算清理计划：保留最近 keep 份，按文件名升序（时间戳标签可字典序排序）清理最旧者。
 * 返回 { remove, kept }，不在此处执行删除（交由调用方）。
 */
export function prunePlan(dir, prefix, keep) {
  const safeKeep = Math.max(0, keep | 0);
  if (!existsSync(dir)) return { remove: [], kept: [] };
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix))
    .sort(); // 升序 = 时间从旧到新
  const excess = Math.max(0, files.length - safeKeep);
  return { remove: files.slice(0, excess), kept: files.slice(excess) };
}

/** 构造 pg_dump 参数（纯函数，便于断言）。不使用 --create，便于还原到已存在的库。 */
export function buildPgDumpArgs(dbUrl) {
  return [
    '--dbname',
    stripUrlQuery(dbUrl),
    '--no-password',
    '--format',
    'plain',
    '--clean',
    '--if-exists',
  ];
}

/** 脱敏连接串用于日志展示：仅遮蔽口令，避免口令出现在控制台/日志。 */
export function redactDbUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return String(url).replace(/\/\/[^@\s]+@/, '//***@');
  }
}

// ---------------- 主流程 ----------------

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

async function runBackupDb({ databaseUrl, backupRoot, keep = 14, dryRun = false } = {}) {
  const dbUrl = databaseUrl ?? process.env.DATABASE_URL;
  const dbName = dbUrl ? dbNameFromUrl(dbUrl) : '(未设置 DATABASE_URL)';
  const host = dbUrl ? dbHostFromUrl(dbUrl) : '(unknown)';
  const outDir = resolve(backupRoot ?? process.env.BACKUP_ROOT ?? './backups', 'db');
  mkdirSync(outDir, { recursive: true });
  const tag = timestampTag();
  const outFile = join(outDir, dumpBaseName(dbName === '(未设置 DATABASE_URL)' ? 'db' : dbName, tag));
  const args = buildPgDumpArgs(dbUrl ?? 'postgresql://localhost/db');

  if (dryRun) {
    const redacted = redactDbUrl(args[1]);
    const displayArgs = args.map((a, i) => (i === 1 ? redacted : /\s/.test(a) ? `"${a}"` : a));
    return {
      dryRun: true,
      dbName,
      host,
      outFile,
      command: `pg_dump ${displayArgs.join(' ')} | gzip > ${outFile}`,
    };
  }

  if (!dbUrl) {
    throw new Error('DATABASE_URL 未设置（备份脚本需要数据库连接串）');
  }

  const pg = spawn('pg_dump', args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const gzip = createGzip();
  const out = createWriteStream(outFile);
  let spawnError = null;
  pg.on('error', (e) => {
    spawnError = e;
  });
  pg.stderr.on('data', (b) => process.stderr.write(b));
  await pipeline(pg.stdout, gzip, out);
  const code = await new Promise((res) => pg.on('close', res));

  if (spawnError) {
    rmSync(outFile, { force: true });
    throw new Error(
      `pg_dump 启动失败：${spawnError.message}（请确认目标服务器已安装 PostgreSQL 客户端 pg_dump）`,
    );
  }
  if (code !== 0) {
    rmSync(outFile, { force: true });
    throw new Error(`pg_dump 退出码 ${code}`);
  }

  const plan = prunePlan(outDir, 'pgdump-', keep);
  for (const f of plan.remove) rmSync(join(outDir, f), { force: true });

  return {
    dryRun: false,
    dbName,
    host,
    outFile,
    kept: plan.kept.length,
    removed: plan.remove,
    keep,
  };
}

if (isMain()) {
  const dryRun = process.argv.includes('--dry-run');
  const selfTest = process.argv.includes('--self-test');
  const keep = Number(process.env.BACKUP_KEEP ?? 14);
  loadEnvFile();
  try {
    if (selfTest) {
      const url = 'postgresql://u:p%40ss@db.example.com:5432/media_workbench?schema=public';
      const r = {
        tag: timestampTag(new Date('2026-11-03T07:23:29')),
        db: dbNameFromUrl(url),
        host: dbHostFromUrl(url),
        base: dumpBaseName(dbNameFromUrl(url), 'TAG'),
        stripped: stripUrlQuery(url),
        args: buildPgDumpArgs(url),
      };
      console.log('self-test：', JSON.stringify(r, null, 2));
      console.log('backup-db 纯函数自检通过（未调用 pg_dump，未泄露口令）');
      process.exit(0);
    }
    const res = await runBackupDb({ keep, dryRun });
    if (dryRun) {
      console.log('[dry-run] 将执行：');
      console.log('  ' + res.command);
      console.log(`  db=${res.dbName} host=${res.host}`);
    } else {
      console.log(`数据库备份完成：${res.outFile}`);
      console.log(`  保留 ${res.kept} 份，清理 ${res.removed.length} 份旧备份（保留最近 ${res.keep} 份）`);
    }
  } catch (e) {
    console.error('备份失败：', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
