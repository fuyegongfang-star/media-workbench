import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/** 更新图片组中的单张图片（T4.2）：改配文或调整顺序。 */
export class UpdateImageItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
