import { Controller, Get, Sse, UseGuards } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { fromEvent, map, Observable } from 'rxjs';
import { TasksEventBus, TASK_EVENT_UPDATED } from './tasks.event-bus';

/**
 * 任务状态实时推送（深入设计 §4.4：P0 用 SSE，比轮询更省）。
 * Worker 每次状态变更经 TasksEventBus 广播，此处订阅并推送 `data: {json}`。
 * 受 AccessTokenGuard 保护。
 */
@Controller('tasks')
@UseGuards(AccessTokenGuard)
export class TasksSseController {
  constructor(private readonly bus: TasksEventBus) {}

  @Get('stream')
  @Sse()
  stream(): Observable<MessageEvent> {
    return fromEvent(this.bus, TASK_EVENT_UPDATED).pipe(
      map((payload) => ({ data: JSON.stringify(payload) }) as MessageEvent),
    );
  }
}
