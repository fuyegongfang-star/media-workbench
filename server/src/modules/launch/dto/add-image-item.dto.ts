import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/** 向图片组新增一张图片（T4.2）。assetId 指向 media_assets。 */
export class AddImageItemDto {
  @IsString()
  assetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
