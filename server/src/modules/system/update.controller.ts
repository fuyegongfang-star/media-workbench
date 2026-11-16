import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { UpdateService } from './update.service';

/**
 * 在线更新端点（T6.5）。
 * - GET  /api/system/update/status：轮询当前状态 / 版本 / 日志（登录可读）
 * - POST /api/system/update/check ：检查 GitHub 上的新提交（登录可用）
 * - POST /api/system/update/apply ：拉取代码并重建 api/web（**仅 owner**，高危操作）
 *
 * 这里只投递请求文件，不执行任何命令；真正的重建在独立 updater 容器里跑，
 * 因此 api 被重建时请求不会丢失、也不需要给 api 容器挂 docker.sock。
 */
@Controller('system/update')
export class UpdateController {
  constructor(private readonly svc: UpdateService) {}

  @Get('status')
  @UseGuards(AccessTokenGuard)
  status() {
    return this.svc.getStatus();
  }

  @Post('check')
  @UseGuards(AccessTokenGuard)
  check(@CurrentUser('username') username: string) {
    return this.svc.trigger('check', username ?? 'unknown');
  }

  @Post('apply')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner')
  apply(@CurrentUser('username') username: string) {
    return this.svc.trigger('apply', username ?? 'unknown');
  }
}
