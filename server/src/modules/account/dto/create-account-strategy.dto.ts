import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { IsPrismaJson } from './is-prisma-json.constraint';

/** 创建账号策略版本（T1.7 占位：字段卡结构已就绪，正文编辑在 T2.4/T2.5）。 */
export class CreateAccountStrategyDto {
  /** 归属自有账号 ID（服务端会校验归属当前用户）。 */
  @IsString()
  ownedAccountId!: string;

  /** 可选：手动指定版本号；缺省由服务端在账号内取 max+1。 */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @IsIn(['draft', 'active', 'archived'])
  @IsOptional()
  status?: 'draft' | 'active' | 'archived';

  @IsOptional()
  @IsPrismaJson()
  position?: unknown;

  @IsOptional()
  @IsPrismaJson()
  audience?: unknown;

  @IsOptional()
  @IsPrismaJson()
  pillars?: unknown;

  @IsOptional()
  @IsPrismaJson()
  titlePref?: unknown;

  @IsOptional()
  @IsPrismaJson()
  structure?: unknown;

  @IsOptional()
  @IsPrismaJson()
  tone?: unknown;

  @IsOptional()
  @IsPrismaJson()
  boundaries?: unknown;

  /** 来源分析 ID 列表（Json 数组）。 */
  @IsOptional()
  @IsPrismaJson()
  sourceAnalysisIds?: unknown;
}
