import { IsIn, IsOptional, IsString, IsNumber, MaxLength, Min, Max } from 'class-validator';
import { IsPrismaJson } from '../../account/dto/is-prisma-json.constraint';

/** 创建标题候选（T3.1）。topicId 取自路径；其余字段可选。 */
export class CreateTitleCandidateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  basis?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsPrismaJson()
  tags?: unknown;

  @IsIn(['draft', 'selected', 'rejected'])
  @IsOptional()
  status?: 'draft' | 'selected' | 'rejected';
}

/** 更新标题候选（T3.1）。 */
export class UpdateTitleCandidateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  basis?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsPrismaJson()
  tags?: unknown;

  @IsIn(['draft', 'selected', 'rejected'])
  @IsOptional()
  status?: 'draft' | 'selected' | 'rejected';
}
