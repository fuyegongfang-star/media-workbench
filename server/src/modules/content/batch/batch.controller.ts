import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthTokenPayload } from '../../auth/jwt.constants';
import { BatchDto } from './batch.dto';
import { BatchService, type BatchResult } from './batch.service';
import { validateBatchRequest } from './batch.util';

/**
 * T4.5 批量操作端点。
 * 路由前缀 /content（与 /topics、/content-projects 不冲突），全经 AccessTokenGuard。
 * 单一入口 POST /api/content/batch，请求体经 class-validator 白名单校验后再做纯函数二次校验。
 */
@Controller('content')
@UseGuards(AccessTokenGuard)
export class BatchController {
  constructor(private readonly batch: BatchService) {}

  @Post('batch')
  async runBatch(@Body() dto: BatchDto, @CurrentUser() user?: AuthTokenPayload): Promise<BatchResult> {
    const v = validateBatchRequest(dto);
    if (!v.ok) {
      throw new BadRequestException(v.error);
    }
    // 业务错误（部分失败）由 service 逐条捕获，返回结构化结果，不抛 500。
    return this.batch.runBatch(v.data!, user?.sub);
  }
}
