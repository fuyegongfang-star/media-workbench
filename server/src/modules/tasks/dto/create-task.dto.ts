import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TaskType } from '@prisma/client';

/** 创建异步任务入参（AccessTokenGuard 保护，createdBy 由 @CurrentUser 注入）。 */
export class CreateTaskDto {
  @IsEnum(TaskType)
  taskType!: TaskType;

  @IsString()
  @MaxLength(64)
  objectType!: string;

  @IsString()
  @MaxLength(64)
  objectId!: string;

  /** 轻量上下文快照（Json）。Job 仅存 taskId，Worker 按 id 取回（深入设计 §4.2）。 */
  @IsOptional()
  payload?: Record<string, unknown>;
}
