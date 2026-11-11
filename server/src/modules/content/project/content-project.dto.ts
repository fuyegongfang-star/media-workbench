import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { SUPPORTED_PLATFORMS } from '../platforms';

/** 选中标题一键建内容项目（T3.2）：传入标题候选 id，服务端自动继承上下文。 */
export class CreateFromTitleDto {
  @IsString()
  titleCandidateId!: string;

  /** T5.2 平台模板预留位：可选平台（默认 wechat），提示词模板按平台解析。 */
  @IsOptional()
  @IsIn(SUPPORTED_PLATFORMS as readonly string[])
  platform?: string;
}

/** T3.3 创作上下文面板的 AI 操作入口：触发生成/续写/改写/压缩/扩写（ARTICLE_GEN 任务）。 */
export class GenerateProjectDto {
  /** 生成阶段（对应 GenerationRun.stage / ContentVersion.source，不含 manual/detect/polish）。 */
  @IsIn(['draft', 'continue', 'rewrite', 'compress', 'expand'])
  stage!: 'draft' | 'continue' | 'rewrite' | 'compress' | 'expand';

  /** 可选：覆盖模型（否则用 SystemConfig 启用供应商默认模型）。 */
  @IsOptional()
  @IsString()
  model?: string;
}

/** 更新内容项目（T3.2 起：自动保存 workingContent / 状态流转；T3.4/T3.6 扩展）。 */
export class UpdateContentProjectDto {
  /** Markdown 自动保存缓冲区（不入版本历史，深入设计 §1.1）。 */
  @IsOptional()
  @IsString()
  workingContent?: string;

  @IsOptional()
  @IsIn([
    'TOPIC_SELECTING',
    'PENDING_CREATION',
    'CREATING',
    'PENDING_REVIEW',
    'NEEDS_REVISION',
    'APPROVED',
    'PUBLISHED',
    'ARCHIVED',
  ])
  status?: string;

  @IsOptional()
  @IsIn(['article', 'image'])
  contentType?: 'article' | 'image';

  /** 发布后回写的外链。 */
  @IsOptional()
  @IsString()
  externalUrl?: string;

  /** T3.8：是否由 AI 辅助生成（合规 §12 标识声明入口）。 */
  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;

  /** T3.8：自定义 AI 生成声明文本（缺省则用默认合规声明）。 */
  @IsOptional()
  @IsString()
  @Length(0, 500)
  aiDeclaration?: string;

  /** T4.4 内容日历：计划发布日（YYYY-MM-DD，本地日；可选，空表示未排期）。 */
  @IsOptional()
  @IsString()
  plannedPublishAt?: string;
}

/** T3.4 显式「保存版本」：写一条 ContentVersion（默认 source=manual）。 */
export class SaveVersionDto {
  /** 版本正文（Markdown）。必填。 */
  @IsString()
  content!: string;

  /** 可选备注（如「AI初稿」「人工润色第2段」「恢复v3」）。 */
  @IsOptional()
  @IsString()
  note?: string;

  /** 版本来源；缺省 manual。受白名单约束（与 ContentVersionSource 一致）。 */
  @IsOptional()
  @IsIn(['manual', 'draft', 'continue', 'rewrite', 'compress', 'expand', 'polish', 'detect'])
  source?: 'manual' | 'draft' | 'continue' | 'rewrite' | 'compress' | 'expand' | 'polish' | 'detect';
}

// ============ T3.6 审核状态机 DTO ============

/** 单条审核清单项。 */
export class ChecklistItemDto {
  @IsString()
  id!: string;

  @IsString()
  @Length(1, 200)
  label!: string;

  @IsBoolean()
  checked!: boolean;

  @IsOptional()
  @IsString()
  note?: string | null;
}

/** 更新审核清单（整体替换，白名单校验）。 */
export class UpdateReviewChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items!: ChecklistItemDto[];
}

/** 退回修改：必须填写退回意见。 */
export class SendBackReviewDto {
  @IsString()
  @Length(1, 500)
  comment!: string;
}

/** T3.11 标记待审核：可携带覆盖开关，确认已知风险后强制送审。 */
export class SubmitForReviewDto {
  /** 已知合规风险并强制送审（仅当合规预审存在 blocking 级风险词时使用）。 */
  @IsOptional()
  @IsBoolean()
  overrideCompliance?: boolean;
}

/** T3.11 运行合规预审：可指定版本或直接传入正文（实时预审用）。 */
export class ComplianceCheckDto {
  /** 指定被检测版本（缺省则取当前生效版本）。 */
  @IsOptional()
  @IsString()
  versionId?: string;

  /** 直接传入正文（前端实时标红用，不强制落库版本）。 */
  @IsOptional()
  @IsString()
  content?: string;
}

// ============ T3.7 朱雀检测 / 第三方润色 DTO ============

/** 触发对某版本的检测（TEXT_DETECT）：可选指定检测服务/模型。 */
export class DetectVersionDto {
  /** 检测服务：zhuque（默认，未配置回落 llm）/ llm。 */
  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  model?: string;
}

/** 触发润色（TEXT_POLISH）：可选模型与语气基调。 */
export class PolishProjectDto {
  @IsOptional()
  @IsString()
  model?: string;

  /** 语气基调（如「更口语化」「更专业」），传给润色 Provider。 */
  @IsOptional()
  @IsString()
  @Length(0, 50)
  tone?: string;
}

/** 记录对某条检测结果的决策。 */
export class ReviewDecisionDto {
  /** accepted（采纳标记）/ ignored（忽略）/ flagged（标红存疑）。 */
  @IsString()
  @IsIn(['accepted', 'ignored', 'flagged'])
  decision!: 'accepted' | 'ignored' | 'flagged';
}

// ============ T3.8 发布信息录入 DTO ============

/**
 * 手动记录发布信息（深入设计 §1.3：APPROVED --填发布信息--> PUBLISHED/ARCHIVED）。
 * 全部可选；publishedAt 缺省服务端用当前时间。
 */
export class RecordPublicationDto {
  /** 发布时间（ISO 字符串）；缺省用当前时间。 */
  @IsOptional()
  @IsString()
  publishedAt?: string;

  /** 发布后外链（文章链接）。 */
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  externalUrl?: string;

  /** 发布补充说明 / 反馈（可选）。 */
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  publishNote?: string;

  /** 目标状态：PUBLISHED（默认）/ ARCHIVED。 */
  @IsOptional()
  @IsIn(['PUBLISHED', 'ARCHIVED'])
  status?: 'PUBLISHED' | 'ARCHIVED';
}
