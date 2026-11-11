import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** 触发选题生成（TOPIC_GEN）：可基于策略/分析上下文，产出候选选题。 */
export class GenerateTopicsDto {
  @IsOptional()
  @IsString()
  strategyId?: string;

  @IsOptional()
  @IsString()
  analysisId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;
}

/** 触发标题生成（TITLE_GEN）：基于某选题产出标题候选。topicId 取自路径。 */
export class GenerateTitlesDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;
}
