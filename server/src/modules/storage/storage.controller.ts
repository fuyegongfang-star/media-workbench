import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthTokenPayload } from '../auth/jwt.constants';
import { MediaService } from './media.service';
import { StorageService } from './storage.service';
import { isValidChecksum } from './storage.util';
import { UploadMediaDto } from './dto/upload-media.dto';

/** multer 内存存储返回的上传文件（默认 storage 即 MemoryStorage，含 buffer）。 */
interface UploadedMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * 文件存储模块控制器（T1.4）：上传 / 列表 / 元数据 / 流式服务 / 软删。
 * - 上传需 access 令牌（AccessTokenGuard）。
 * - 流式服务支持两种定位：按 id（需 DB）与按校验和（DB 无关，便于本地验证与内容寻址去重复用）。
 * - 文件内容寻址 + sha256，DB 未就绪时上传仍可落盘并返回 persisted:false（不伪造通过）。
 */
@Controller('media')
export class StorageController {
  constructor(
    private readonly media: MediaService,
    private readonly storage: StorageService,
  ) {}

  /** 上传：multipart field=file + 表单字段 ownerType/ownerId。返回校验和与落盘路径。 */
  @Post()
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: UploadedMulterFile,
    @Body() dto: UploadMediaDto,
    @CurrentUser('sub') userId: string,
  ) {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('缺少上传文件（multipart field=file）');
    }
    return this.media.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      ownerType: dto.ownerType,
      ownerId: dto.ownerId,
      userId,
      source: dto.source,
    });
  }

  /** 列表：按 ownerType/ownerId/type 过滤分页。DB 未就绪返回空 + persisted:false。 */
  @Get()
  @UseGuards(AccessTokenGuard)
  list(
    @Query('ownerType') ownerType?: string,
    @Query('ownerId') ownerId?: string,
    @Query('type') type?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.media.list({
      ownerType,
      ownerId,
      type,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  /** 元数据：按 id 查询（需 DB）。 */
  @Get(':id')
  @UseGuards(AccessTokenGuard)
  getById(@Param('id') id: string) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.media.getById(id);
  }

  /** 流式服务：按 id（需 DB 定位 filePath）。 */
  @Get(':id/file')
  @UseGuards(AccessTokenGuard)
  async serveById(@Param('id') id: string): Promise<StreamableFile> {
    if (!id) throw new BadRequestException('缺少 id');
    const abs = await this.media.resolvePathById(id);
    const checksum = abs.split(/[/\\]/).pop() as string;
    const mime = await this.storage.sniffContentType(checksum);
    return new StreamableFile(this.storage.openReadStream(checksum), {
      type: mime,
      disposition: `inline; filename="${checksum}"`,
    });
  }

  /** 流式服务：按校验和（DB 无关，内容寻址）。便于本地验证与去重复用。 */
  @Get('file/:checksum')
  async serveByChecksum(@Param('checksum') checksum: string): Promise<StreamableFile> {
    if (!isValidChecksum(checksum)) {
      throw new BadRequestException('非法校验和（需 64 位 hex）');
    }
    const { exists } = await this.storage.peekByChecksum(checksum);
    if (!exists) {
      throw new BadRequestException('文件不存在');
    }
    const mime = await this.storage.sniffContentType(checksum);
    return new StreamableFile(this.storage.openReadStream(checksum), {
      type: mime,
      disposition: `inline; filename="${checksum}"`,
    });
  }

  /** 删除：按 id 软删（需 DB）。 */
  @Delete(':id')
  @UseGuards(AccessTokenGuard)
  remove(@Param('id') id: string) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.media.remove(id);
  }
}
