import {
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

const USERNAME_RE = /^[A-Za-z0-9_.-]+$/;

/** 管理员建号：用户名 + 初始口令 + 角色（默认 editor）。 */
export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(USERNAME_RE, { message: '用户名仅允许字母、数字、下划线、点、连字符' })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

/** 改角色。 */
export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}

/** 禁用 / 启用。 */
export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}

/** 管理员重置口令。 */
export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
