import { IsString, MinLength, MaxLength } from 'class-validator';

/** 修改本人口令（T6.4）：需旧口令校验，新口令 8-128 位。 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  oldPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
