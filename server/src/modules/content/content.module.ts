import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';
import { GenerationModule } from '../generation/generation.module';
import { TopicController } from './topic/topic.controller';
import { TopicService } from './topic/topic.service';
import { TitleCandidateController } from './title/title-candidate.controller';
import { TitleCandidateService } from './title/title-candidate.service';
import { TopicTitleGenerateService } from './generation/topic-title-generate.service';
import { ArticleGenerateService } from './generation/article-generate.service';
import { ContentProjectController } from './project/content-project.controller';
import { ContentProjectService } from './project/content-project.service';
import { PublishController } from './publish/publish.controller';
import { PublishService } from './publish/publish.service';
import { WeChatPublishProvider } from './publish/wechat.provider';
import { TextReviewService } from './detection/text-review.service';
import { PolishService } from './polish/polish.service';
import { ComplianceService } from './compliance/compliance.service';
import { ComplianceProviderService } from './compliance/compliance-provider.service';
import { BatchController } from './batch/batch.controller';
import { BatchService } from './batch/batch.service';

/**
 * 内容创作模块（Phase 3 起）。
 * - T3.1：选题 Topic CRUD + 标题候选 TitleCandidate CRUD（软删/硬删按设计区分）。
 * - T3.1：选题生成 TOPIC_GEN / 标题生成 TITLE_GEN（注册到 TaskHandlerRegistry，经 LlmProviderService 调 LLM）。
 * - T3.2：内容项目 ContentProject CRUD + 选中标题一键建项目（自动继承账号/策略/选题/标题 + 上下文快照）。
 * - T3.7：朱雀检测 TEXT_DETECT（写 TextReviewRun，绑定版本不改文）+ 第三方润色 TEXT_POLISH（写 polish staging 版本）。
 * - T3.11：合规预审 ComplianceService（广告法极限词/敏感词本地词典，送审前自动标红硬卡点）。
 * - T4.5：批量操作 BatchController（选题/标题/草稿 的 状态变更 / 打标签 / 删除 / 发布，逐条结果）。
 * 复用 AuthModule 的 AccessTokenGuard、TasksModule 的任务中心与注册表、GenerationModule 的 LLM/检测/润色解析。
 */
@Module({
  imports: [AuthModule, TasksModule, GenerationModule],
  controllers: [TopicController, TitleCandidateController, ContentProjectController, PublishController, BatchController],
  providers: [
    TopicService,
    TitleCandidateService,
    TopicTitleGenerateService,
    ArticleGenerateService,
    ContentProjectService,
    PublishService,
    WeChatPublishProvider,
    TextReviewService,
    PolishService,
    ComplianceService,
    ComplianceProviderService,
    BatchService,
  ],
})
export class ContentModule {}
