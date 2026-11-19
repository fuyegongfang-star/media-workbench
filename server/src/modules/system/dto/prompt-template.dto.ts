import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * 新增自定义提示词模板（自动分配下一版本号，不改内置预设）。
 * Platform 目前仅开放 wechat（与现有 6 处读取点一致），保留字段便于后续扩展。
 */
export class CreatePromptTemplateDto {
  @IsString()
  @IsIn([
    'single_analysis', 'account_summary', 'strategy_draft', 'topic_gen', 'title_gen',
    'article_draft', 'article_edit', 'polish', 'caption_gen',
  ])
  taskType!: string;

  @IsOptional()
  @IsString()
  @IsIn(['wechat', 'xiaohongshu', 'douyin', 'toutiao'])
  platform?: string;

  @IsString()
  @MaxLength(80)
  label!: string;

  @IsString()
  @MaxLength(20000)
  content!: string;

  /** global=全账号可用；account=仅指定账号（需同时给 ownedAccountId）。 */
  @IsOptional()
  @IsString()
  @IsIn(['global', 'account'])
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownedAccountId?: string;
}

/** 局部更新：改名 / 改内容 / 启停 / 改账号范围。 */
export class UpdatePromptTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['global', 'account'])
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownedAccountId?: string;
}
