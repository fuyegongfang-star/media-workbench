import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 素材更新 DTO（T4.3）：仅暴露「标签 / 收藏 / 归档」三个库内维护维度。
 * 正文/标题编辑不在本任务范围（导入流程负责写入）。全局 ValidationPipe 白名单生效。
 */
export class UpdateMaterialDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  favorite?: boolean;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
