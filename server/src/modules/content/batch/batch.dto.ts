import { IsArray, IsIn, IsOptional, IsString, ArrayNotEmpty, ArrayMaxSize, MaxLength } from 'class-validator';

/** T4.5 批量操作请求（全局 ValidationPipe：whitelist + forbidNonWhitelisted）。 */
export class BatchDto {
  @IsIn(['topic', 'title', 'project'])
  type!: 'topic' | 'title' | 'project';

  @IsIn(['setStatus', 'tag', 'delete', 'publish'])
  action!: 'setStatus' | 'tag' | 'delete' | 'publish';

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids!: string[];

  /** setStatus 必填：目标状态（受 type 约束，service 二次校验）。 */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  /** tag 必填：标签数组。 */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  /** tag 模式：add（默认）/ remove / replace。 */
  @IsOptional()
  @IsIn(['add', 'remove', 'replace'])
  tagMode?: 'add' | 'remove' | 'replace';
}
