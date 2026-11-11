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
import { AccessTokenGuard } from '../../auth/guards/access-token.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthTokenPayload } from '../../auth/jwt.constants';
import { TitleCandidateService } from './title-candidate.service';
import { CreateTitleCandidateDto, UpdateTitleCandidateDto } from './title-candidate.dto';
import { GenerateTitlesDto } from '../generation/dto/generate.dto';
import { TopicTitleGenerateService } from '../generation/topic-title-generate.service';

/**
 * 标题候选资源：集合嵌套在选题下（/topics/:topicId/titles），便于上下文绑定；
 * 单项操作同路径下按 titleId 定位。全部经 AccessTokenGuard。
 */
@Controller('topics')
@UseGuards(AccessTokenGuard)
export class TitleCandidateController {
  constructor(
    private readonly svc: TitleCandidateService,
    private readonly gen: TopicTitleGenerateService,
  ) {}

  /** 某选题下的标题候选列表（需令牌）。 */
  @Get(':topicId/titles')
  listByTopic(@Param('topicId') topicId: string) {
    return this.svc.listByTopic(topicId);
  }

  /** 新建标题候选（需令牌）。 */
  @Post(':topicId/titles')
  create(
    @Param('topicId') topicId: string,
    @Body() dto: CreateTitleCandidateDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    void user;
    return this.svc.create(topicId, dto);
  }

  /** 触发标题生成（TITLE_GEN，异步任务，返回 taskId；需令牌）。 */
  @Post(':topicId/titles/generate')
  generate(
    @Param('topicId') topicId: string,
    @Body() dto: GenerateTitlesDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.gen.generateTitles({ topicId, count: dto.count }, user?.sub);
  }

  /** 标题候选明细（需令牌）。 */
  @Get(':topicId/titles/:titleId')
  get(@Param('titleId') titleId: string) {
    return this.svc.get(titleId);
  }

  /** 更新标题候选（需令牌）。 */
  @Patch(':topicId/titles/:titleId')
  update(@Param('titleId') titleId: string, @Body() dto: UpdateTitleCandidateDto) {
    return this.svc.update(titleId, dto);
  }

  /** 删除标题候选（物理删除，需令牌）。 */
  @Delete(':topicId/titles/:titleId')
  remove(@Param('titleId') titleId: string) {
    return this.svc.remove(titleId);
  }

  /** 选中某标题（互斥置 selected，需令牌）。 */
  @Post(':topicId/titles/:titleId/select')
  select(@Param('titleId') titleId: string) {
    return this.svc.select(titleId);
  }
}
