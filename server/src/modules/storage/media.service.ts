import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from './storage.service';
import { detectMediaType } from './storage.util';

/** 前端可见的媒体元信息（脱敏，无密钥）。 */
export interface MediaPublic {
  id: string;
  ownerType: string;
  ownerId: string;
  filePath: string;
  checksum: string;
  type: string;
  size: number;
  source: string | null;
  createdById: string | null;
  createdAt: Date;
}

/** 上传结果：无论是否入库都返回；persisted=false 时文件已落盘、DB 记录待环境补写。 */
export interface UploadResult extends MediaPublic {
  persisted: boolean;
}

export interface UploadInput {
  buffer: Buffer;
  originalName?: string;
  ownerType: 'source_material' | 'content_project' | 'owned_account' | 'launch_task';
  ownerId: string;
  userId?: string | null;
  source?: string | null;
}

/** 把 Prisma 记录转为前端可见对象（BigInt size → number）。 */
function toPublic(r: {
  id: string;
  ownerType: string;
  ownerId: string;
  filePath: string;
  checksum: string;
  type: string;
  size: bigint | number | null;
  source: string | null;
  createdById: string | null;
  createdAt: Date;
}): MediaPublic {
  return {
    id: r.id,
    ownerType: r.ownerType,
    ownerId: r.ownerId,
    filePath: r.filePath,
    checksum: r.checksum,
    type: r.type,
    size: r.size == null ? 0 : Number(r.size),
    source: r.source,
    createdById: r.createdById,
    createdAt: r.createdAt,
  };
}

/**
 * 媒体资产服务（T1.4）：编排「落盘（StorageService）+ 元数据入库（MediaAsset）」。
 * 数据库未就绪时仍可落盘并返回 persisted=false，绝不伪造通过；待 PG 可用后由调用方/补写脚本入库。
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** 上传：先落盘（内容寻址 + 校验和），再尝试写入 MediaAsset 元数据。 */
  async upload(input: UploadInput): Promise<UploadResult> {
    const meta = await this.storage.saveBuffer(input.buffer, input.originalName);
    const id = randomUUID();
    const type = detectMediaType(input.originalName);
    const createdAt = new Date();

    if (!this.prisma.isConnected) {
      this.logger.warn('PostgreSQL 未就绪，文件已落盘但 MediaAsset 记录未入库（待环境，不伪造通过）');
      return {
        id,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        filePath: meta.relativePath,
        checksum: meta.checksum,
        type,
        size: meta.size,
        source: input.source ?? input.originalName ?? null,
        createdById: input.userId ?? null,
        createdAt,
        persisted: false,
      };
    }

    const record = await this.prisma.client.mediaAsset.create({
      data: {
        id,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        filePath: meta.relativePath,
        checksum: meta.checksum,
        type,
        size: BigInt(meta.size),
        source: input.source ?? input.originalName ?? null,
        createdById: input.userId ?? null,
      },
    });
    return { ...toPublic(record), persisted: true };
  }

  /** 列表（按 ownerType/ownerId/type 过滤，分页）。DB 未就绪返回空 + persisted=false。 */
  async list(params: {
    ownerType?: string;
    ownerId?: string;
    type?: string;
    take?: number;
    skip?: number;
  }): Promise<{ items: MediaPublic[]; persisted: boolean }> {
    if (!this.prisma.isConnected) {
      return { items: [], persisted: false };
    }
    // 仅把已提供的过滤键加入 where（Prisma 枚举字段不接收 undefined）
    const where: Record<string, unknown> = {};
    if (params.ownerType) where.ownerType = params.ownerType;
    if (params.ownerId) where.ownerId = params.ownerId;
    if (params.type) where.type = params.type;
    const rows = await this.prisma.client.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.take ?? 50,
      skip: params.skip ?? 0,
    });
    return { items: rows.map(toPublic), persisted: true };
  }

  /** 按 id 取元数据（DB 必填项）。 */
  async getById(id: string): Promise<MediaPublic> {
    if (!this.prisma.isConnected) {
      throw new ServiceUnavailableException('数据库未就绪（待环境），无法查询媒体元数据');
    }
    const row = await this.prisma.client.mediaAsset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('媒体记录不存在');
    return toPublic(row);
  }

  /** 按 id 取磁盘绝对路径（供流式响应；软删记录不可见）。 */
  async resolvePathById(id: string): Promise<string> {
    if (!this.prisma.isConnected) {
      throw new ServiceUnavailableException('数据库未就绪（待环境），无法定位媒体文件');
    }
    const row = await this.prisma.client.mediaAsset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('媒体记录不存在');
    return this.storage.resolve(row.filePath);
  }

  /** 按 id 软删（深入设计 §2.2：经 Prisma 扩展转软删，绝不物理删除）。 */
  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    if (!this.prisma.isConnected) {
      throw new ServiceUnavailableException('数据库未就绪（待环境），无法删除媒体记录');
    }
    try {
      await this.prisma.client.mediaAsset.delete({ where: { id } });
      return { id, deleted: true };
    } catch {
      throw new NotFoundException('媒体记录不存在');
    }
  }
}
