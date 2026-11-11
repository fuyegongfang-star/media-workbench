import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthTokenPayload } from '../../auth/jwt.constants';
import { ContentProjectService } from './content-project.service';
import { TextReviewService } from '../detection/text-review.service';
import { PolishService } from '../polish/polish.service';
import { ComplianceService } from '../compliance/compliance.service';
import { CreateFromTitleDto, ComplianceCheckDto, DetectVersionDto, GenerateProjectDto, PolishProjectDto, RecordPublicationDto, ReviewDecisionDto, SaveVersionDto, SendBackReviewDto, SubmitForReviewDto, UpdateContentProjectDto, UpdateReviewChecklistDto } from './content-project.dto';

/**
 * 内容项目资源（T3.2 起）。
 * 路由前缀 /content-projects，全经 AccessTokenGuard。
 * T3.2 核心端点：POST /api/content-projects（选中标题一键建项目）。
 */
@Controller('content-projects')
@UseGuards(AccessTokenGuard)
export class ContentProjectController {
  constructor(
    private readonly svc: ContentProjectService,
    private readonly textReview: TextReviewService,
    private readonly polish: PolishService,
    private readonly compliance: ComplianceService,
  ) {}

  /** T3.2：选中标题一键建内容项目（自动继承账号/策略/选题/标题 + 快照分析摘要与提示词模板版本）。 */
  @Post()
  createFromTitle(@Body() dto: CreateFromTitleDto, @CurrentUser() user: AuthTokenPayload) {
    return this.svc.createFromTitle(dto.titleCandidateId, user?.sub, dto.platform);
  }

  /** 内容项目列表（可按 ownedAccountId / status 过滤）。 */
  @Get()
  list(@Query('ownedAccountId') ownedAccountId?: string, @Query('status') status?: string) {
    return this.svc.list({ ownedAccountId, status });
  }

  /** 内容项目明细（含账号/选题/标题/策略版本投影）。 */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  /** T3.5：生成运行记录列表（供查看 ARTICLE_GEN 状态/结果）。 */
  @Get(':id/generation-runs')
  listGenerationRuns(@Param('id') id: string) {
    return this.svc.listGenerationRuns(id);
  }

  /** T3.3 创作上下文面板：返回继承的「依据」（账户/标题/选题/策略/分析摘要/提示词模板版本）。 */
  @Get(':id/context')
  getContext(@Param('id') id: string) {
    return this.svc.getContext(id);
  }

  /** T5.2 刷新上下文快照：重新从当前「标题/选题/策略/分析」定格，并指向当前平台最新启用模板。 */
  @Post(':id/refresh-context')
  refreshContext(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    return this.svc.refreshContext(id, user?.sub);
  }

  /** T3.3 AI 操作入口：触发生成/续写/改写/压缩/扩写（ARTICLE_GEN 异步任务，T3.5 注册处理器）。 */
  @Post(':id/generate')
  generate(
    @Param('id') id: string,
    @Body() dto: GenerateProjectDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.svc.generate(id, dto.stage, dto.model, user?.sub);
  }

  /** 更新内容项目（自动保存 workingContent / 状态流转）。 */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContentProjectDto) {
    return this.svc.update(id, dto);
  }

  /** 删除内容项目（软删）。 */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  // ============ T3.8 复制/导出 + 发布信息录入 + AI 生成标识声明入口 ============

  /** T3.8 导出内容项目为规范 Markdown（front-matter + 正文 + AI 声明页脚）；前端负责复制/下载 .md。 */
  @Get(':id/export')
  exportProject(@Param('id') id: string) {
    return this.svc.exportProject(id);
  }

  /** T3.8 手动记录发布信息（APPROVED → PUBLISHED/ARCHIVED + publishedAt/externalUrl/publishNote）。 */
  @Patch(':id/publication')
  recordPublication(@Param('id') id: string, @Body() dto: RecordPublicationDto) {
    return this.svc.recordPublication(id, dto);
  }

  // ============ T3.4 Markdown 编辑器：版本链 ============

  /** T3.4 显式「保存版本」（落一条 ContentVersion + 置 currentVersionId）。 */
  @Post(':id/versions')
  saveVersion(
    @Param('id') id: string,
    @Body() dto: SaveVersionDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.svc.saveVersion(id, dto, user?.sub);
  }

  /** T3.4 版本历史列表（versionNo 倒序）。 */
  @Get(':id/versions')
  listVersions(@Param('id') id: string) {
    return this.svc.listVersions(id);
  }

  /** T3.4 单版本详情（校验归属本项目）。 */
  @Get(':id/versions/:versionId')
  getVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.svc.getVersion(id, versionId);
  }

  /** T3.4 恢复某版本（设 currentVersionId + 还原 workingContent）。 */
  @Post(':id/versions/:versionId/restore')
  restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.svc.restoreVersion(id, versionId, user?.sub);
  }

  /** T3.5：采纳 staging 版本（设 currentVersionId + 还原 workingContent）。 */
  @Post(':id/versions/:versionId/adopt')
  adoptVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.svc.adoptVersion(id, versionId, user?.sub);
  }

  /** T3.5：放弃 staging 版本（硬删，需非当前生效版本）。 */
  @Delete(':id/versions/:versionId')
  deleteVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.svc.deleteVersion(id, versionId);
  }

  // ============ T3.6 审核状态机 ============

  /** T3.6 获取/初始化审核记录（清单 + 意见 + 决定人/时间）。 */
  @Get(':id/review')
  getReview(@Param('id') id: string) {
    return this.svc.getReview(id);
  }

  /** T3.6 更新审核清单（整体替换，白名单校验）。 */
  @Patch(':id/review/checklist')
  updateChecklist(@Param('id') id: string, @Body() dto: UpdateReviewChecklistDto) {
    return this.svc.updateChecklist(id, dto.items);
  }

  /** T3.6 标记待审核（CREATING/NEEDS_REVISION → PENDING_REVIEW）。 */
  @Post(':id/review/submit')
  submitForReview(
    @Param('id') id: string,
    @Body() dto: SubmitForReviewDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.svc.submitForReview(id, { overrideCompliance: dto.overrideCompliance }, user?.sub);
  }

  // ============ T3.11 合规预审（广告法极限词/敏感词，送审前自动标红硬卡点）============

  /** T3.11 运行一次合规预审（同步、离线确定性）：对当前/指定版本正文扫描，返回命中与标红分段。 */
  @Post(':id/compliance/check')
  checkCompliance(
    @Param('id') id: string,
    @Body() dto: ComplianceCheckDto,
  ) {
    return this.compliance.check(id, { versionId: dto.versionId, content: dto.content });
  }

  /** T3.6 退回修改（PENDING_REVIEW → NEEDS_REVISION，需退回意见）。 */
  @Post(':id/review/send-back')
  sendBack(
    @Param('id') id: string,
    @Body() dto: SendBackReviewDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.svc.sendBack(id, dto.comment, user?.sub);
  }

  /** T3.6 审核通过（PENDING_REVIEW/NEEDS_REVISION → APPROVED，清单需全勾选）。 */
  @Post(':id/review/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthTokenPayload) {
    return this.svc.approve(id, user?.sub);
  }

  // ============ T3.7 朱雀检测（TEXT_DETECT，绑定版本不改文）============

  /** T3.7 触发对某版本的检测（入队 TEXT_DETECT；不改文，结果写 TextReviewRun）。 */
  @Post(':id/versions/:versionId/detect')
  detectVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: DetectVersionDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.textReview.detect(id, versionId, { service: dto.service, model: dto.model }, user?.sub);
  }

  /** T3.7 列出项目的检测记录（含「旧版本结果」标记与用户决定）。 */
  @Get(':id/text-reviews')
  listTextReviews(@Param('id') id: string) {
    return this.textReview.listReviews(id);
  }

  /** T3.7 记录用户对某条检测结果的决策（accepted/ignored/flagged）。 */
  @Post(':id/text-reviews/:runId/decision')
  decideTextReview(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.textReview.decide(id, runId, dto.decision);
  }

  // ============ T3.7 第三方润色（TEXT_POLISH，原稿不变 + 对比/采纳/放弃）============

  /** T3.7 触发生成润色（入队 TEXT_POLISH；原稿不变，结果写 source=polish 的 staging 版本，待采纳/放弃）。 */
  @Post(':id/polish')
  polishProject(
    @Param('id') id: string,
    @Body() dto: PolishProjectDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.polish.polish(id, { model: dto.model, tone: dto.tone }, user?.sub);
  }
}
