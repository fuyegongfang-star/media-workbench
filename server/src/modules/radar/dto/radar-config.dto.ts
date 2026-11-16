import { IsArray, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

/** 前端提交的雷达配置；宽泛 DTO + 服务层 sanitizeConfig 双重清洗，防异常输入。 */
export class RadarConfigDto {
  @IsOptional()
  @IsArray()
  niches?: Array<{ name: string; enabled?: boolean; keywords?: string[] }>;

  @IsOptional()
  @IsObject()
  sources?: Record<string, boolean>;

  @IsOptional()
  @IsObject()
  output?: {
    totalItems?: number;
    featuredItems?: number;
    titlesPerItem?: number;
    saveToLibrary?: boolean;
  };

  @IsOptional()
  @IsObject()
  schedule?: {
    enabled?: boolean;
    time?: string;
    timezone?: string;
  };

  @IsOptional()
  @IsObject()
  monitoredAccounts?: { x?: string[]; youtube?: string[] };

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  accountDedupeDays?: number;
}

export class ConvertRadarItemDto {
  @IsOptional()
  @IsString()
  userId?: string;
}
