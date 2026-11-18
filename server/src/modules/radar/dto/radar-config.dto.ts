import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** 前端提交的雷达配置；宽泛 DTO + 服务层 sanitizeConfig 双重清洗，防异常输入。 */
export class RadarConfigDto {
  @IsOptional()
  @IsArray()
  niches?: Array<{
    name: string;
    enabled?: boolean;
    /** 适用地区 domestic / overseas / both；服务层 normalizeNicheRegion 白名单清洗。 */
    region?: string;
    keywords?: string[];
  }>;

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

  /** 时效窗口（天）：0/1/3/7/15；服务层只接受预设档位。 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(15)
  freshnessDays?: number;

  /** 自定义 RSS / JSON 数据源；服务层 sanitizeCustomSources 会再次白名单清洗。 */
  @IsOptional()
  @IsArray()
  customSources?: Array<{
    id?: string;
    name?: string;
    url?: string;
    format?: string;
    enabled?: boolean;
    keywords?: string[];
    region?: string;
  }>;
}

/** 自定义数据源连通性测试（不写库，只回前 3 条样例）。 */
export class TestCustomSourceDto {
  @IsString()
  @MaxLength(500)
  url!: string;

  @IsIn(['rss', 'json'])
  format!: 'rss' | 'json';
}

export class ConvertRadarItemDto {
  @IsOptional()
  @IsString()
  userId?: string;
}
