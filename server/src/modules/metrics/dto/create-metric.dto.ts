import { IsIn, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

/** 手动录入单条效果指标（T3.10）。全部走参数绑定；数字字段非负归一并落库。 */
export class CreateMetricDto {
  @IsString()
  @MaxLength(64)
  contentProjectId!: string;

  /** 指标日期（YYYY-MM-DD）。 */
  @IsString()
  @MaxLength(10)
  metricDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalArticleId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  readCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  shareCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  favoriteCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  likeCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  followerIncrease?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unfollowCount?: number;

  /** 来源：manual / wechat_user_read / wechat_article_read / wechat_user_summary。 */
  @IsOptional()
  @IsIn(['manual', 'wechat_user_read', 'wechat_article_read', 'wechat_user_summary'])
  source?: string;
}
