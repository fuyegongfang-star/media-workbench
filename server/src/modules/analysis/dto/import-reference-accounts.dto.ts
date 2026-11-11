// T2.1 对标账号批量导入 DTO（class-validator + 全局 ValidationPipe 白名单）。
import { IsArray, IsEnum, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ImportReferencePreviewDto {
  @IsIn(['csv', 'json', 'lines'])
  format!: 'csv' | 'json' | 'lines';

  @IsString()
  @MaxLength(100000, { message: '导入内容过长（上限 100000 字符）' })
  raw!: string;
}

export class ImportReferenceRowDto {
  @IsString()
  @MaxLength(200, { message: '名称过长（上限 200）' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  homepageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsIn(['create', 'skip'])
  action!: 'create' | 'skip';
}

export class ImportReferenceCommitDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportReferenceRowDto)
  rows!: ImportReferenceRowDto[];
}
