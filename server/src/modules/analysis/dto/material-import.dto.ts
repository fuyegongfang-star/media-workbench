// T2.2 素材批量导入 DTO（class-validator + 全局 ValidationPipe 白名单）。
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MaterialImportPreviewDto {
  @IsIn(['csv', 'json', 'markdown', 'lines', 'form', 'excel'])
  format!: 'csv' | 'json' | 'markdown' | 'lines' | 'form' | 'excel';

  @IsString()
  @MaxLength(200000, { message: '导入内容过长（上限 200000 字符）' })
  raw!: string;

  @IsString()
  @MaxLength(36)
  referenceAccountId!: string;
}

export class MaterialImportRowDto {
  @IsIn(['create', 'skip', 'merge', 'copy'])
  action!: 'create' | 'skip' | 'merge' | 'copy';

  @IsString()
  @MaxLength(300, { message: '标题过长（上限 300）' })
  title!: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  collectedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  licenseNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  existingId?: string;
}

export class MaterialImportCommitDto {
  @IsString()
  @MaxLength(36)
  referenceAccountId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialImportRowDto)
  rows!: MaterialImportRowDto[];
}
