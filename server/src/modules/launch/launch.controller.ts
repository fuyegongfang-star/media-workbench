import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { LaunchService } from './launch.service';
import { CreateLaunchPlanDto } from './dto/create-launch-plan.dto';
import { UpdateLaunchPlanDto } from './dto/update-launch-plan.dto';
import { CreateLaunchTaskDto } from './dto/create-launch-task.dto';
import { UpdateLaunchTaskDto } from './dto/update-launch-task.dto';
import { AddImageItemDto } from './dto/add-image-item.dto';
import { UpdateImageItemDto } from './dto/update-image-item.dto';
import { ReorderImageItemsDto } from './dto/reorder-image-items.dto';

/**
 * 起号计划控制器（T4.1 图文起号计划）。
 * 路由前缀由 main.ts 的 API_PREFIX（默认 api）统一加前缀，例如 /api/launch/plans。
 * 全部经 AccessTokenGuard 鉴权；ownedAccountId 仅在服务端校验归属，绝不信任客户端 userId。
 */
@Controller('launch')
@UseGuards(AccessTokenGuard)
export class LaunchController {
  constructor(private readonly svc: LaunchService) {}

  @Get('plans')
  listPlans(
    @Query('ownedAccountId') ownedAccountId: string,
    @Query('type') type: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.svc.listPlans(userId, { ownedAccountId, type });
  }

  @Post('plans')
  createPlan(@Body() dto: CreateLaunchPlanDto, @CurrentUser('sub') userId: string) {
    return this.svc.createPlan(userId, dto);
  }

  @Get('plans/:id')
  getPlan(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    if (!id) throw new Error('缺少 id');
    return this.svc.getPlan(userId, id);
  }

  @Patch('plans/:id')
  updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdateLaunchPlanDto,
    @CurrentUser('sub') userId: string,
  ) {
    if (!id) throw new Error('缺少 id');
    return this.svc.updatePlan(userId, id, dto);
  }

  @Delete('plans/:id')
  deletePlan(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    if (!id) throw new Error('缺少 id');
    return this.svc.deletePlan(userId, id);
  }

  @Post('plans/:id/sync')
  syncPlan(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    if (!id) throw new Error('缺少 id');
    return this.svc.syncPlan(userId, id);
  }

  @Get('plans/:id/progress')
  progress(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    if (!id) throw new Error('缺少 id');
    return this.svc.getPlanProgress(userId, id);
  }

  @Post('plans/:id/tasks')
  createTask(
    @Param('id') id: string,
    @Body() dto: CreateLaunchTaskDto,
    @CurrentUser('sub') userId: string,
  ) {
    if (!id) throw new Error('缺少 id');
    return this.svc.createTask(userId, id, dto);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateLaunchTaskDto,
    @CurrentUser('sub') userId: string,
  ) {
    if (!taskId) throw new Error('缺少 taskId');
    return this.svc.updateTask(userId, taskId, dto);
  }

  @Delete('tasks/:taskId')
  deleteTask(@Param('taskId') taskId: string, @CurrentUser('sub') userId: string) {
    if (!taskId) throw new Error('缺少 taskId');
    return this.svc.deleteTask(userId, taskId);
  }

  @Post('tasks/:taskId/sync')
  syncTask(@Param('taskId') taskId: string, @CurrentUser('sub') userId: string) {
    if (!taskId) throw new Error('缺少 taskId');
    return this.svc.syncTaskFromProject(userId, taskId);
  }

  // ============ 图片组（T4.2 贴图起号计划） ============
  @Get('tasks/:taskId/images')
  listImages(@Param('taskId') taskId: string, @CurrentUser('sub') userId: string) {
    if (!taskId) throw new Error('缺少 taskId');
    return this.svc.listImageItems(userId, taskId);
  }

  @Post('tasks/:taskId/images')
  addImage(
    @Param('taskId') taskId: string,
    @Body() dto: AddImageItemDto,
    @CurrentUser('sub') userId: string,
  ) {
    if (!taskId) throw new Error('缺少 taskId');
    return this.svc.addImageItem(userId, taskId, dto);
  }

  @Patch('tasks/:taskId/images/:itemId')
  updateImage(
    @Param('taskId') taskId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateImageItemDto,
    @CurrentUser('sub') userId: string,
  ) {
    if (!itemId) throw new Error('缺少 itemId');
    return this.svc.updateImageItem(userId, itemId, dto);
  }

  @Delete('tasks/:taskId/images/:itemId')
  removeImage(
    @Param('taskId') taskId: string,
    @Param('itemId') itemId: string,
    @CurrentUser('sub') userId: string,
  ) {
    if (!itemId) throw new Error('缺少 itemId');
    return this.svc.removeImageItem(userId, itemId);
  }

  @Post('tasks/:taskId/images/reorder')
  reorderImages(
    @Param('taskId') taskId: string,
    @Body() dto: ReorderImageItemsDto,
    @CurrentUser('sub') userId: string,
  ) {
    if (!taskId) throw new Error('缺少 taskId');
    return this.svc.reorderImageItems(userId, taskId, dto);
  }
}
