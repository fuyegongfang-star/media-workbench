import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthTokenPayload } from '../../auth/jwt.constants';
import { PublishService } from './publish.service';
import { MassSendDto } from './publish.dto';

/**
 * 公众号发布执行控制器（T3.9）。
 * 挂载于 /content-projects，全经 AccessTokenGuard。
 * - POST :id/publish/sync-draft  → 草稿箱同步（add_draft），回写 media_id
 * - POST :id/publish/submit       → 正式发布（freepublish），回写 article_url
 * - POST :id/publish/mass         → 群发（可定时），回写 msg_id / 定时状态
 * - GET  :id/publish/state        → 读取当前发布状态
 */
@Controller('content-projects')
@UseGuards(AccessTokenGuard)
export class PublishController {
  constructor(private readonly svc: PublishService) {}

  @Post(':id/publish/sync-draft')
  syncDraft(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    return this.svc.syncDraft(id, user?.sub);
  }

  @Post(':id/publish/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    return this.svc.submitPublish(id, user?.sub);
  }

  @Post(':id/publish/mass')
  mass(
    @Param('id') id: string,
    @Body() dto: MassSendDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.svc.massSend(id, { scheduleTime: dto.scheduleTime }, user?.sub);
  }

  @Get(':id/publish/state')
  state(@Param('id') id: string) {
    return this.svc.getPublishState(id);
  }
}
