import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccountService } from './account.service';
import { CreateOwnedAccountDto } from './dto/create-owned-account.dto';
import { UpdateOwnedAccountDto } from './dto/update-owned-account.dto';
import { CreateReferenceAccountDto } from './dto/create-reference-account.dto';
import { UpdateReferenceAccountDto } from './dto/update-reference-account.dto';
import { CreateAccountStrategyDto } from './dto/create-account-strategy.dto';
import { UpdateAccountStrategyDto } from './dto/update-account-strategy.dto';
import { BindStrategyDto } from './dto/bind-strategy.dto';

/**
 * 账号与策略控制器（T1.7）：三类资源的 CRUD，全部经 AccessTokenGuard 鉴权。
 * 路由前缀由 main.ts 的 API_PREFIX（默认 api）统一加前缀，例如 /api/owned-accounts。
 */
@Controller('owned-accounts')
@UseGuards(AccessTokenGuard)
export class OwnedAccountController {
  constructor(private readonly svc: AccountService) {}

  @Post()
  create(@Body() dto: CreateOwnedAccountDto, @CurrentUser('sub') userId: string) {
    return this.svc.createOwnedAccount(userId, dto);
  }

  @Get()
  list(@Query('status') status: string, @CurrentUser('sub') userId: string) {
    return this.svc.listOwnedAccounts(userId, status);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.svc.getOwnedAccount(userId, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOwnedAccountDto,
    @CurrentUser('sub') userId: string,
  ) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.svc.updateOwnedAccount(userId, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.svc.deleteOwnedAccount(userId, id);
  }

  @Post(':id/bind-strategy')
  bindStrategy(
    @Param('id') id: string,
    @Body() dto: BindStrategyDto,
    @CurrentUser('sub') userId: string,
  ) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.svc.bindStrategyToAccount(userId, id, dto.strategyId ?? null);
  }
}

@Controller('reference-accounts')
@UseGuards(AccessTokenGuard)
export class ReferenceAccountController {
  constructor(private readonly svc: AccountService) {}

  @Post()
  create(@Body() dto: CreateReferenceAccountDto) {
    return this.svc.createReferenceAccount(dto);
  }

  @Get()
  list(@Query('platform') platform: string, @Query('q') q: string) {
    return this.svc.listReferenceAccounts(platform, q);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.svc.getReferenceAccount(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReferenceAccountDto) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.svc.updateReferenceAccount(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.svc.deleteReferenceAccount(id);
  }
}

@Controller('strategies')
@UseGuards(AccessTokenGuard)
export class StrategyController {
  constructor(private readonly svc: AccountService) {}

  @Post()
  create(@Body() dto: CreateAccountStrategyDto, @CurrentUser('sub') userId: string) {
    return this.svc.createStrategy(userId, dto);
  }

  @Get()
  list(@Query('ownedAccountId') ownedAccountId: string, @CurrentUser('sub') userId: string) {
    if (!ownedAccountId) throw new BadRequestException('list 需提供 ownedAccountId');
    return this.svc.listStrategies(userId, ownedAccountId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.svc.getStrategy(userId, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountStrategyDto,
    @CurrentUser('sub') userId: string,
  ) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.svc.updateStrategy(userId, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    if (!id) throw new BadRequestException('缺少 id');
    return this.svc.deleteStrategy(userId, id);
  }
}
