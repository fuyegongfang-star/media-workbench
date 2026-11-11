import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthTokenPayload } from '../auth/jwt.constants';
import { CalendarService } from './calendar.service';
import { RescheduleItemDto } from './dto/reschedule-item.dto';

/**
 * 内容日历资源（T4.4）。路由前缀 /calendar，全经 AccessTokenGuard。
 * - GET /api/calendar：按日期范围聚合选题/标题/内容项目/起号任务四类条目（支持 ownedAccountId 过滤）。
 * - PATCH /api/calendar/items/:kind/:id：拖拽改期，回写对应实体的日期字段。
 */
@Controller('calendar')
@UseGuards(AccessTokenGuard)
export class CalendarController {
  constructor(private readonly svc: CalendarService) {}

  /** 日历聚合（from/to 为本地 YYYY-MM-DD，缺省回退默认 60 天窗口）。 */
  @Get()
  getCalendar(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ownedAccountId') ownedAccountId?: string,
    @CurrentUser() user?: AuthTokenPayload,
  ) {
    return this.svc.getCalendar({ from, to, ownedAccountId, userId: user?.sub ?? '' });
  }

  /** 拖拽改期：kind ∈ {topic,title,content,launch}。 */
  @Patch('items/:kind/:id')
  reschedule(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() dto: RescheduleItemDto,
    @CurrentUser() user?: AuthTokenPayload,
  ) {
    return this.svc.reschedule(kind, id, dto.date, user?.sub ?? '');
  }
}
