import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthTokenPayload } from '../auth/jwt.constants';
import { CreateTaskDto } from './dto/create-task.dto';
import { TasksService } from './tasks.service';
import { TaskStatus, TaskType } from '@prisma/client';

/**
 * 异步任务中心 REST（T1.5 基础）。
 * 除 meta 外均受 AccessTokenGuard 保护；查询走 Prisma 参数绑定（防注入）。
 */
@Controller('tasks')
@UseGuards(AccessTokenGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /** 任务中心元信息（队列可用性、已注册 handler、状态机说明）。 */
  @Get('meta')
  async meta(): Promise<Record<string, unknown>> {
    return this.tasks.meta();
  }

  /** 创建任务并（Redis 可用时）入队。 */
  @Post()
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthTokenPayload) {
    return this.tasks.create(dto, user?.sub);
  }

  /** 列表，可按 status / taskType 过滤。 */
  @Get()
  async list(
    @Query('status') status?: string,
    @Query('taskType') taskType?: string,
  ) {
    const filter: { status?: TaskStatus; taskType?: TaskType } = {};
    if (status && (Object.values(TaskStatus) as string[]).includes(status)) {
      filter.status = status as TaskStatus;
    }
    if (taskType && (Object.values(TaskType) as string[]).includes(taskType)) {
      filter.taskType = taskType as TaskType;
    }
    return this.tasks.list(filter);
  }

  /** 单任务详情。 */
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.tasks.get(id);
  }

  /** 重试：failed/cancelled → queued（retryCount+1），重新入队。 */
  @Post(':id/retry')
  async retry(@Param('id') id: string) {
    return this.tasks.retry(id);
  }

  /** 取消：queued/running → cancelled，并从队列移除待执行 Job。 */
  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.tasks.cancel(id);
  }

  /** 软删（T1.3 软删作用域：delete → 置 deletedAt，绝不物理删除）。 */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const task = await this.tasks.remove(id);
    return { id: task.id, deleted: true };
  }
}
