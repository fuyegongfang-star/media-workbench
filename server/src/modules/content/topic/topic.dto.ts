import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsPrismaJson } from '../../account/dto/is-prisma-json.constraint';

/** 创建选题（T3.1）。strategyId/analysisId 可选关联；sourceType 必填标注来源。 */
export class CreateTopicDto {
  @IsOptional()
  @IsString()
  strategyId?: string;

  @IsOptional()
  @IsString()
  analysisId?: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  angle?: string;

  @IsIn(['draft', 'active', 'archived'])
  @IsOptional()
  status?: 'draft' | 'active' | 'archived';

  /** 标签（Json 数组）；缺省落 []。 */
  @IsOptional()
  @IsPrismaJson()
  tags?: unknown;

  /** 来源类型：manual（人工）/ ai_gen（AI 生成）/ derived（从分析派生）。 */
  @IsIn(['manual', 'ai_gen', 'derived'])
  sourceType!: 'manual' | 'ai_gen' | 'derived';

  /** T4.4 内容日历：计划推进/发布日期（YYYY-MM-DD，本地日；可选，空表示未排期）。 */
  @IsOptional()
  @IsString()
  plannedAt?: string;
}

/** 更新选题（T3.1）。 */
export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  angle?: string;

  @IsIn(['draft', 'active', 'archived'])
  @IsOptional()
  status?: 'draft' | 'active' | 'archived';

  @IsOptional()
  @IsPrismaJson()
  tags?: unknown;

  @IsIn(['manual', 'ai_gen', 'derived'])
  @IsOptional()
  sourceType?: 'manual' | 'ai_gen' | 'derived';

  /** T4.4 内容日历：计划推进/发布日期（YYYY-MM-DD，本地日；可选，空表示未排期）。 */
  @IsOptional()
  @IsString()
  plannedAt?: string;
}
