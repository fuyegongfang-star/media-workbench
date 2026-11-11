import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/** 触发账号级汇总的请求体：选定要聚合的拆解结果 ID 列表（至少 1 个）。 */
export class SummarizeAccountDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  analysisIds!: string[];
}
