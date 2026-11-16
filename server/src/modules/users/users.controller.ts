import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  ResetPasswordDto,
} from './dto/user.dto';

/**
 * 用户管理（T6.4）：仅 owner/admin 可访问。
 * - 列表 / 建号 / 改角色 / 禁用启用 / 重置口令 / 软删。
 * - 所有视图不含 passwordHash；护栏在 service 层（不能删自己、不能降级最后一个 owner）。
 */
@Controller('users')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('owner', 'admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list().then((items) => ({ items }));
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id/role')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.users.updateRole(id, dto, actorId);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.users.updateStatus(id, dto, actorId);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.users.remove(id, actorId);
  }
}
