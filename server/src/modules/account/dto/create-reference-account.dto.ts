import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** 创建对标账号（T1.7）。对标账号为全局参考，不绑定 userId。 */
export class CreateReferenceAccountDto {
  @IsIn(['wechat'])
  @IsOptional()
  platform?: 'wechat';

  @IsString()
  @MaxLength(120)
  name!: string;

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
