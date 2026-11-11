import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** 更新对标账号（T1.7）：全字段可选的部分更新。 */
export class UpdateReferenceAccountDto {
  @IsIn(['wechat'])
  @IsOptional()
  platform?: 'wechat';

  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  homepageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
