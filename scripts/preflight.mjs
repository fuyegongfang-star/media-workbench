#!/usr/bin/env node
/**
 * 上线前自检（零依赖，可在服务器部署前本地/远端直接跑）。
 * 用法：
 *   node scripts/preflight.mjs                         # 检查仓库根 .env
 *   node scripts/preflight.mjs --file deploy/.env.prod.example   # 检查指定模板
 * 只打印「键名 + 问题描述」，绝不回显任何密钥/口令的值。
 * 退出码：0 = 无 FAIL；1 = 存在 FAIL（不允许上线）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(process.cwd());
const argIdx = process.argv.indexOf('--file');
const envPath = argIdx >= 0 ? resolve(root, process.argv[argIdx + 1]) : resolve(root, '.env');

let pass = 0;
const warns = [];
const fails = [];
const ok = (msg) => { pass++; console.log(`[PASS] ${msg}`); };
const warn = (msg) => { warns.push(msg); console.log(`[WARN] ${msg}`); };
const fail = (msg) => { fails.push(msg); console.log(`[FAIL] ${msg}`); };

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.length >= 2 && ((val[0] === '"' && val.at(-1) === '"') || (val[0] === "'" && val.at(-1) === "'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const isPlaceholder = (v) => !v || v.trim() === '' || v.includes('<');

console.log(`=== 上线前自检 ===\n目标文件：${envPath}\n`);

// ---------- 1. 部署资产完整性 ----------
const assets = [
  'Dockerfile', '.dockerignore', 'docker-compose.prod.yml',
  'deploy/nginx.conf', 'deploy/entrypoint.sh', 'deploy/.env.prod.example',
  'server/prisma/migrations/migration_lock.toml',
  'server/dist/main.js', 'web/dist/index.html',
];
for (const rel of assets) {
  if (existsSync(resolve(root, rel))) ok(`资产存在 ${rel}`);
  else fail(`资产缺失 ${rel}（镜像构建或启动会失败）`);
}

const migRoot = resolve(root, 'server/prisma/migrations');
if (existsSync(migRoot)) {
  const dirs = readdirSync(migRoot).filter((d) => statSync(join(migRoot, d)).isDirectory());
  const sqlCount = dirs.filter((d) => existsSync(join(migRoot, d, 'migration.sql'))).length;
  if (sqlCount > 0) ok(`迁移目录 ${dirs.length} 个，含 migration.sql ${sqlCount} 个`);
  else fail('迁移目录内没有任何 migration.sql');
  if (sqlCount !== dirs.length) fail(`有 ${dirs.length - sqlCount} 个迁移目录缺少 migration.sql`);
} else fail('缺少 server/prisma/migrations 目录');

// ---------- 2. 环境变量 ----------
if (!existsSync(envPath)) {
  fail(`找不到环境文件 ${envPath}；请 cp deploy/.env.prod.example .env 并填写真实值`);
} else {
  const env = parseEnv(readFileSync(envPath, 'utf8'));
  const required = [
    'DATABASE_URL', 'APP_MASTER_KEY', 'JWT_SECRET', 'POSTGRES_USER',
    'POSTGRES_PASSWORD', 'INITIAL_USERNAME', 'INITIAL_PASSWORD',
  ];
  for (const key of required) {
    if (isPlaceholder(env[key])) fail(`${key} 未填写或仍是 <...> 占位符（启动期 env.validation 会拒绝）`);
    else ok(`${key} 已填写`);
  }

  // 主密钥必须是 64 位 hex（AES-256）
  if (!isPlaceholder(env.APP_MASTER_KEY)) {
    if (/^[0-9a-fA-F]{64}$/.test(env.APP_MASTER_KEY)) ok('APP_MASTER_KEY 为 64 位 hex');
    else fail('APP_MASTER_KEY 必须是 64 位十六进制字符串（32 字节）');
  }
  if (!isPlaceholder(env.JWT_SECRET) && env.JWT_SECRET.length < 16) fail('JWT_SECRET 过短（建议 ≥ 32 字符）');
  if (!isPlaceholder(env.INITIAL_PASSWORD) && env.INITIAL_PASSWORD.length < 8) fail('INITIAL_PASSWORD 过短（≥ 8 位）');

  // 容器编排相关
  if (env.HOST === '0.0.0.0') ok('HOST=0.0.0.0（容器内可访问）');
  else fail(`HOST=${env.HOST || '(未设置)'}，容器内默认 127.0.0.1 会导致 nginx 502`);
  if (env.NODE_ENV === 'production') ok('NODE_ENV=production');
  else warn('NODE_ENV 不是 production');

  const origin = env.CORS_ORIGIN || '';
  if (!origin || /localhost|127\.0\.0\.1|your-domain/.test(origin)) fail('CORS_ORIGIN 仍是开发地址/示例域名，需改成真实域名');
  else ok('CORS_ORIGIN 为真实域名');

  // 数据库连接串
  const url = env.DATABASE_URL || '';
  if (!/^postgresql:\/\//.test(url)) fail('DATABASE_URL 必须以 postgresql:// 开头');
  else {
    const m = /^postgresql:\/\/([^:]+):([^@]*)@([^:/]+)(?::(\d+))?\/([^?]+)/.exec(url);
    if (!m) fail('DATABASE_URL 格式无法解析（应为 user:password@host:port/db）');
    else {
      if (m[3] === 'postgres') ok('DATABASE_URL 主机为 compose 服务名 postgres');
      else fail(`DATABASE_URL 主机是 "${m[3]}"，容器内应为 postgres（localhost 连不上）`);
      const urlPwd = decodeURIComponent(m[2]);
      if (!isPlaceholder(env.POSTGRES_PASSWORD)) {
        if (urlPwd === env.POSTGRES_PASSWORD) ok('DATABASE_URL 口令与 POSTGRES_PASSWORD 一致');
        else fail('DATABASE_URL 里的口令与 POSTGRES_PASSWORD 不一致（应用会连不上库）');
      }
    }
  }

  if (env.REDIS_HOST === 'redis') ok('REDIS_HOST=redis（compose 服务名）');
  else fail(`REDIS_HOST=${env.REDIS_HOST || '(未设置)'}，容器内应为 redis`);

  // Redis 口令含占位符会导致「服务端设了密码、客户端跳过密码」而连不上
  if ((env.REDIS_PASSWORD || '').includes('<')) fail('REDIS_PASSWORD 含 <...> 占位符：请留空或填真实值，否则队列连不上');
  else if (env.REDIS_PASSWORD) ok('REDIS_PASSWORD 已设置（客户端会读取）');
  else warn('REDIS_PASSWORD 为空：Redis 未设密码，仅 compose 内网可达，确认未把 6379 暴露公网');

  // 可选但影响 AI 闭环
  for (const key of ['LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL']) {
    if (isPlaceholder(env[key])) warn(`${key} 未配置：AI 拆解/创作/检测会失败（服务仍可启动）`);
    else ok(`${key} 已配置`);
  }
}

console.log(`\n=== 汇总：PASS ${pass} / WARN ${warns.length} / FAIL ${fails.length} ===`);
if (fails.length) {
  console.log('结论：❌ 尚不具备上线条件，请先修复上面所有 FAIL。');
  process.exit(1);
}
console.log('结论：✅ 静态检查通过。注意：本脚本不连数据库，20+ 个迁移与真实联调仍需首次上线时按 deploy/README.md 核验。');
