/**
 * 文件存储纯函数（T1.4）：不依赖 Nest/DB，可单独编译后由 `node --test` 引用。
 * 覆盖：sha256 校验和、内容寻址路径、扩展名净化、类型探测、路径穿越防护。
 */
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';

/** MediaAsset.type 枚举值（与 schema.prisma 保持一致）。 */
export type MediaAssetType = 'image' | 'video' | 'audio' | 'file';

/** 存储落盘后的元信息（相对路径基于内容寻址，天然去重）。 */
export interface StoredFileMeta {
  checksum: string;
  relativePath: string;
  size: number;
  ext: string;
}

/** 计算缓冲区的 sha256 十六进制校验和。 */
export function computeSha256(buffer: Buffer): string {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('computeSha256 期望 Buffer');
  }
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 内容寻址路径：aa/bb/<sha256>（不含扩展名，内容由校验和唯一确定）。
 * 相同内容的文件落到同一路径 → 文件系统层面天然去重。
 */
export function contentAddressablePath(checksum: string): string {
  const c = checksum.toLowerCase();
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c}`;
}

/** 从文件名提取净化后的小写扩展名（不含点，最长 10 字符），无则空串。 */
export function sanitizeExt(filename?: string): string {
  if (!filename || typeof filename !== 'string') return '';
  const idx = filename.lastIndexOf('.');
  if (idx < 0 || idx === filename.length - 1) return '';
  const ext = filename.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  return ext;
}

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'avif', 'tiff']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'flv']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'aiff']);

/** 依据扩展名映射到 MediaAsset.type 枚举；未知一律归为 file。 */
export function detectMediaType(filename?: string): MediaAssetType {
  const ext = sanitizeExt(filename);
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return 'file';
}

/** 净化单段路径片段，去除可破坏路径的字符与开头的点。 */
export function sanitizeSegment(segment: string): string {
  if (typeof segment !== 'string') return '';
  return segment
    .replace(/[\\/<>"|?*:\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
}

/**
 * 在存储根目录内安全拼接路径，禁止路径穿越（../）。
 * 仅依赖内容寻址路径时用户不可控片段，本函数用于从 DB 相对路径/校验和解析绝对路径的兜底防护。
 */
export function safeJoin(storageRoot: string, ...segments: string[]): string {
  const root = resolve(storageRoot);
  const cleaned = segments.map((s) => String(s).replace(/^[/\\]+/, ''));
  const target = resolve(root, ...cleaned);
  const rel = relative(root, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('非法的存储路径：检测到路径穿越');
  }
  return target;
}

/** 校验是否为合法 sha256（64 位十六进制），用于 URL/参数中的校验和。 */
export function isValidChecksum(checksum: string): boolean {
  return typeof checksum === 'string' && /^[a-f0-9]{64}$/.test(checksum);
}

/**
 * 依文件头魔数推断 MIME（DB 无关，用于流式响应 Content-Type）。
 * 仅覆盖常见类型，未知返回 application/octet-stream。
 */
export function magicToMime(buf: Buffer): string {
  if (buf.length >= 8 && buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (buf.length >= 3 && buf.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  if (
    buf.length >= 6 &&
    (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')
  ) {
    return 'image/gif';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  return 'application/octet-stream';
}
