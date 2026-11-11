import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  computeSha256,
  contentAddressablePath,
  isValidChecksum,
  magicToMime,
  safeJoin,
  sanitizeExt,
  type StoredFileMeta,
} from './storage.util';

/**
 * 本地文件存储服务（T1.4）：内容寻址 + sha256 校验和，不依赖数据库即可工作。
 * - 文件写入 STORAGE_ROOT（默认 ./storage）；内容寻址天然去重（相同内容落到同一路径）。
 * - 写入采用「临时文件 + rename」原子替换，避免半截文件。
 * - 路径全部由校验和（hex）构成，用户不可控片段，叠加 safeJoin 防穿越兜底。
 * - 不持有 DB 连接；DB 元数据落库由 MediaService 负责（见 media.service.ts）。
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  readonly root: string;
  readonly maxBytes: number;

  constructor(config: ConfigService) {
    this.root = resolve(process.cwd(), config.get<string>('STORAGE_ROOT') ?? './storage');
    const cfg = Number(config.get<string>('MEDIA_MAX_UPLOAD_BYTES'));
    this.maxBytes = Number.isFinite(cfg) && cfg > 0 ? cfg : 50 * 1024 * 1024;
  }

  /** 启动期确保存储根目录存在。 */
  async onModuleInit(): Promise<void> {
    await this.ensureRoot();
    this.logger.log(`文件存储根目录就绪：${this.root}（上限 ${this.maxBytes} 字节/文件）`);
  }

  /** 确保根目录存在（启动期或在首次写入前调用）。 */
  async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  /** 写入缓冲区：计算校验和、内容寻址落盘（已存在则跳过写入去重）。 */
  async saveBuffer(buffer: Buffer, originalName?: string): Promise<StoredFileMeta> {
    if (!Buffer.isBuffer(buffer)) {
      throw new BadRequestException('无效的文件数据');
    }
    if (buffer.length === 0) {
      throw new BadRequestException('空文件');
    }
    if (buffer.length > this.maxBytes) {
      throw new BadRequestException(`文件超过大小上限 ${this.maxBytes} 字节`);
    }
    const checksum = computeSha256(buffer);
    const relativePath = contentAddressablePath(checksum);
    const abs = safeJoin(this.root, relativePath);
    await mkdir(dirname(abs), { recursive: true });

    try {
      await stat(abs);
      // 相同内容已存在 → 内容寻址天然去重，跳过写入
      this.logger.debug(`内容已存在，跳过写入：${relativePath}`);
    } catch {
      const tmp = `${abs}.tmp-${randomUUID()}`;
      await writeFile(tmp, buffer);
      await rename(tmp, abs); // 原子替换
    }

    return { checksum, relativePath, size: buffer.length, ext: sanitizeExt(originalName) };
  }

  /** 把相对路径解析为受控绝对路径（防穿越），不校验存在性。 */
  resolve(relativePath: string): string {
    return safeJoin(this.root, relativePath);
  }

  /** 按校验和定位绝对路径，返回是否存在 + 路径（供无 DB 时也能服务文件）。 */
  async peekByChecksum(checksum: string): Promise<{ exists: boolean; absolutePath: string }> {
    if (!isValidChecksum(checksum)) {
      throw new BadRequestException('非法校验和');
    }
    const absolutePath = safeJoin(this.root, contentAddressablePath(checksum));
    try {
      await stat(absolutePath);
      return { exists: true, absolutePath };
    } catch {
      return { exists: false, absolutePath };
    }
  }

  /** 读取整文件为 Buffer（用于校验/小文件）。 */
  async read(relativePath: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(relativePath));
    } catch {
      throw new NotFoundException('文件不存在');
    }
  }

  /** 打开只读流（用于大文件流式响应）。 */
  openReadStream(checksum: string): ReadStream {
    if (!isValidChecksum(checksum)) {
      throw new BadRequestException('非法校验和');
    }
    const abs = safeJoin(this.root, contentAddressablePath(checksum));
    return createReadStream(abs);
  }

  /** 按校验和删除磁盘文件（硬删，仅用于本地存储级清理；业务软删走 MediaService）。 */
  async removeByChecksum(checksum: string): Promise<boolean> {
    if (!isValidChecksum(checksum)) {
      throw new BadRequestException('非法校验和');
    }
    try {
      await unlink(safeJoin(this.root, contentAddressablePath(checksum)));
      return true;
    } catch {
      return false;
    }
  }

  /** 依文件头魔数推断 MIME（读取前 16 字节，用于流式响应 Content-Type）。 */
  async sniffContentType(checksum: string): Promise<string> {
    if (!isValidChecksum(checksum)) {
      throw new BadRequestException('非法校验和');
    }
    const abs = safeJoin(this.root, contentAddressablePath(checksum));
    let handle;
    try {
      handle = await open(abs, 'r');
      const buf = Buffer.alloc(16);
      const { bytesRead } = await handle.read(buf, 0, 16, 0);
      return magicToMime(buf.subarray(0, bytesRead));
    } catch {
      return 'application/octet-stream';
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }
}
