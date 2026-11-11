import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Task, TaskStatus, TaskType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskQueueService } from './queue/queue.service';
import { TaskHandlerRegistry } from './worker/task-handler.registry';
import { TasksEventBus, TASK_EVENT_UPDATED } from './tasks.event-bus';
import { canTransition, nextStatus, type TaskEvent } from './task-state-machine';
import { CreateTaskDto } from './dto/create-task.dto';

/**
 * 异步任务中心服务（T1.5 基础）。
 * - CRUD + 入队（jobId=taskId 幂等）+ 状态机流转 + 事件广播（SSE）。
 * - DB 未就绪时创建/查询将如实失败（不伪造）；Redis 不可用时 enqueue 返回 false，任务保留 queued（待环境）。
 * - 查询/写入一律走 Prisma 参数绑定（防注入）；payload 经白名单 DTO 校验。
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: TaskQueueService,
    private readonly handlers: TaskHandlerRegistry,
    private readonly bus: TasksEventBus,
    private readonly config: ConfigService,
  ) {}

  /** 创建任务并（Redis 可用时）入队。返回是否成功 dispatch。 */
  async create(dto: CreateTaskDto, userId?: string): Promise<{ task: Task; dispatched: boolean }> {
    const task = await this.prisma.client.task.create({
      data: {
        taskType: dto.taskType,
        objectType: dto.objectType,
        objectId: dto.objectId,
        payload: (dto.payload ?? null) as Prisma.InputJsonValue,
        createdById: userId ?? null,
      },
    });
    const dispatched = await this.queue.enqueue(task.id);
    this.emit(task.id, task.status);
    return { task, dispatched };
  }

  async list(filter?: { status?: TaskStatus; taskType?: TaskType }): Promise<Task[]> {
    return this.prisma.client.task.findMany({
      where: filter ?? {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(id: string): Promise<Task> {
    const task = await this.prisma.client.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`任务不存在：${id}`);
    return task;
  }

  async cancel(id: string): Promise<Task> {
    const task = await this.get(id);
    if (!canTransition(task.status, 'cancel')) {
      throw new BadRequestException(`当前状态 ${task.status} 不可取消`);
    }
    await this.queue.removeJob(id);
    return this.applyTransition(id, 'cancel');
  }

  async retry(id: string): Promise<{ task: Task; dispatched: boolean }> {
    const task = await this.get(id);
    if (!canTransition(task.status, 'retry')) {
      throw new BadRequestException(`当前状态 ${task.status} 不可重试`);
    }
    const updated = await this.applyTransition(id, 'retry'); // failed/cancelled → queued, retryCount+1
    const dispatched = await this.queue.enqueue(id); // jobId=id 幂等去重
    return { task: updated, dispatched };
  }

  /** 软删（T1.3 软删作用域：delete → 置 deletedAt，绝不物理删除）。 */
  async remove(id: string): Promise<Task> {
    return this.prisma.client.task.delete({ where: { id } });
  }

  /** 任务中心元信息（供前端 system/tasks 页渲染）。 */
  async meta(): Promise<Record<string, unknown>> {
    return {
      queueAvailable: this.queue.available,
      registeredHandlers: this.handlers.registered,
      stateMachine: 'queued → running → success | failed | cancelled；retry 由 failed/cancelled 回 queued',
      taskTypes: Object.values(TaskType),
      serverTime: new Date().toISOString(),
    };
  }

  // ---- Worker 调用入口 ----

  /** Worker 消费 job 后执行：状态流转 + 分发 handler。未注册 handler 如实置 failed。 */
  async processTask(taskId: string): Promise<void> {
    const task = await this.prisma.client.task.findUnique({ where: { id: taskId } });
    if (!task) return;
    if (task.status !== 'queued' && task.status !== 'running') return;
    try {
      await this.applyTransition(taskId, 'start'); // queued → running
      const handler = this.handlers.get(task.taskType);
      if (!handler) {
        throw new Error(`未注册处理器：${task.taskType}（Phase 2/3 待实现）`);
      }
      await handler(task.payload);
      await this.applyTransition(taskId, 'succeed'); // running → success
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.failTask(taskId, msg);
    }
  }

  // ---- 状态机内部 ----

  private async applyTransition(id: string, event: TaskEvent): Promise<Task> {
    const current = (await this.get(id)).status;
    if (!canTransition(current, event)) {
      throw new BadRequestException(`非法状态流转：${current} 不能执行 ${event}`);
    }
    const next = nextStatus(current, event);
    const data: Prisma.TaskUpdateInput = { status: next };
    if (event === 'retry') data.retryCount = { increment: 1 };
    const updated = await this.prisma.client.task.update({ where: { id }, data });
    this.emit(id, next);
    return updated;
  }

  private async failTask(id: string, errorMsg: string): Promise<void> {
    await this.prisma.client.task.update({
      where: { id },
      data: { status: 'failed', error: errorMsg },
    });
    this.emit(id, 'failed');
  }

  private emit(id: string, status: TaskStatus): void {
    this.bus.emit(TASK_EVENT_UPDATED, { id, status, at: new Date().toISOString() });
  }
}
