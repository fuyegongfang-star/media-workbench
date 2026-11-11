/**
 * 极简 .env 加载器（仅供备份/恢复等独立脚本在 cron 下取到环境变量使用）。
 * - 仅在变量尚未存在于 process.env 时填充，绝不覆盖已有环境变量。
 * - 不做任何密钥回显；解析后的变量不含明文口令日志风险（调用方自行保证不打印）。
 * - 与 NestJS 的 @nestjs/config 互不干扰（应用侧不依赖本文件）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvFile(path = resolve(process.cwd(), '.env')) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf8');
  const parsed = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
      parsed[key] = value;
    }
  }
  return parsed;
}
