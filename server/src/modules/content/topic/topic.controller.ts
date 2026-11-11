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
import { AccessTokenGuard } from '../../auth/guards/access-token.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthTokenPayload } from '../../auth/jwt.constants';
import { TopicService } from './topic.service';
import { CreateTopicDto, UpdateTopicDto } from './topic.dto';
import { GenerateTopicsDto } from '../generation/dto/generate.dto';
import { TopicTitleGenerateService } from '../generation/topic-title-generate.service';

@Controller('topics')
@UseGuards(AccessTokenGuard)
export class TopicController {
  constructor(
    private readonly svc: TopicService,
    private readonly gen: TopicTitleGenerateService,
  ) {}

  /** 选题列表（可按 strategyId / analysisId / status 过滤，需令牌）。 */
  @Get()
  list(
    @Query('strategyId') strategyId?: string,
    @Query('analysisId') analysisId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.list({ strategyId, analysisId, status });
  }

  /** 新建选题（需令牌）。 */
  @Post()
  create(@Body() dto: CreateTopicDto, @CurrentUser() user: AuthTokenPayload) {
    return this.svc.create(dto, user?.sub);
  }

  /** 触发选题生成（TOPIC_GEN，异步任务，返回 taskId；需令牌）。 */
  @Post('generate')
  generate(@Body() dto: GenerateTopicsDto, @CurrentUser() user: AuthTokenPayload) {
    return this.gen.generateTopics(
      { strategyId: dto.strategyId, analysisId: dto.analysisId, count: dto.count },
      user?.sub,
    );
  }

  /** 选题明细（需令牌）。 */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  /** 更新选题（需令牌）。 */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTopicDto) {
    return this.svc.update(id, dto);
  }

  /** 删除选题（软删，需令牌）。 */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
