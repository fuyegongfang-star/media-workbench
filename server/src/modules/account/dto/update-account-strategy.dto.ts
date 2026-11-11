import { IsIn, IsOptional } from 'class-validator';
import { IsPrismaJson } from './is-prisma-json.constraint';

/** 更新账号策略版本（T1.7 基础 + T2.5 约束）。不允许改归属账号 ownedAccountId。
 *  默认策略的设定统一走 T2.5 的 bind-strategy 端点（原子绑定 defaultStrategyVersionId + 同步 isDefault），此处不再开放 isDefault。 */
export class UpdateAccountStrategyDto {
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

  @IsOptional()
  @IsPrismaJson()
  sourceAnalysisIds?: unknown;
}
