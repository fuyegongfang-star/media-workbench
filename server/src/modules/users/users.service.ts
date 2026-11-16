import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  ResetPasswordDto,
} from './dto/user.dto';

/** 返回给管理端的用户视图（绝不含 passwordHash）。 */
export interface UserView {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 用户列表（软删扩展自动排除 deletedAt 非空）。 */
  async list(): Promise<UserView[]> {
    const rows = await this.prisma.client.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return rows.map((r) => this.toView(r));
  }

  /** 管理员建号：用户名唯一；角色默认 editor；不传 status 即 active。 */
  async create(dto: CreateUserDto): Promise<UserView> {
    const existing = await this.prisma.client.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) throw new ConflictException('用户名已被占用');

    const passwordHash = await hash(dto.password);
    let row: {
      id: string;
      username: string;
      role: UserRole;
      status: UserStatus;
      lastLoginAt: Date | null;
      createdAt: Date;
    };
    try {
      row = await this.prisma.client.user.create({
        data: {
          username: dto.username,
          passwordHash,
          role: dto.role ?? UserRole.editor,
          status: UserStatus.active,
        },
        select: {
          id: true,
          username: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
        throw new ConflictException('用户名已被占用');
      }
      throw error;
    }
    this.logger.log(`管理员创建用户：${dto.username}（role=${row.role}）`);
    return this.toView(row);
  }

  /**
   * 改角色护栏：不能改自己；不能降级最后一个 owner（避免无人可管理）。
   */
  async updateRole(targetId: string, dto: UpdateUserRoleDto, actorId: string): Promise<UserView> {
    const target = await this.findOrThrow(targetId);
    if (target.id === actorId) throw new BadRequestException('不能修改自己的角色');
    if (target.role === UserRole.owner && dto.role !== UserRole.owner) {
      const ownerCount = await this.prisma.client.user.count({
        where: { role: UserRole.owner, status: UserStatus.active },
      });
      if (ownerCount <= 1) throw new BadRequestException('不能降级最后一个所有者');
    }
    const row = await this.prisma.client.user.update({
      where: { id: targetId },
      data: { role: dto.role },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    this.logger.log(`用户 ${target.username} 角色改为 ${dto.role}`);
    return this.toView(row);
  }

  /** 禁用/启用护栏：不能禁用自己；不能禁用最后一个 active owner。 */
  async updateStatus(targetId: string, dto: UpdateUserStatusDto, actorId: string): Promise<UserView> {
    const target = await this.findOrThrow(targetId);
    if (target.id === actorId && dto.status === UserStatus.disabled) {
      throw new BadRequestException('不能禁用自己');
    }
    if (target.role === UserRole.owner && dto.status === UserStatus.disabled) {
      const ownerCount = await this.prisma.client.user.count({
        where: { role: UserRole.owner, status: UserStatus.active },
      });
      if (ownerCount <= 1) throw new BadRequestException('不能禁用最后一个所有者');
    }
    const row = await this.prisma.client.user.update({
      where: { id: targetId },
      data: { status: dto.status },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    this.logger.log(`用户 ${target.username} 状态改为 ${dto.status}`);
    return this.toView(row);
  }

  /** 管理员重置口令。 */
  async resetPassword(targetId: string, dto: ResetPasswordDto): Promise<{ ok: true }> {
    const target = await this.findOrThrow(targetId);
    const passwordHash = await hash(dto.password);
    await this.prisma.client.user.update({
      where: { id: targetId },
      data: { passwordHash },
    });
    this.logger.log(`管理员重置了用户 ${target.username} 的口令`);
    return { ok: true };
  }

  /** 删除用户（软删，走 data-integrity 扩展）：不能删自己；不能删最后一个 owner。 */
  async remove(targetId: string, actorId: string): Promise<{ ok: true }> {
    const target = await this.findOrThrow(targetId);
    if (target.id === actorId) throw new BadRequestException('不能删除自己');
    if (target.role === UserRole.owner) {
      const ownerCount = await this.prisma.client.user.count({
        where: { role: UserRole.owner, status: UserStatus.active },
      });
      if (ownerCount <= 1) throw new BadRequestException('不能删除最后一个所有者');
    }
    // delete 经软删扩展改写为 update(deletedAt=now)，不会物理删除。
    await this.prisma.client.user.delete({ where: { id: targetId } });
    this.logger.log(`已删除（软删）用户：${target.username}`);
    return { ok: true };
  }

  private async findOrThrow(id: string) {
    const row = await this.prisma.client.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!row) throw new NotFoundException('用户不存在');
    return row;
  }

  private toView(row: {
    id: string;
    username: string;
    role: UserRole;
    status: UserStatus;
    lastLoginAt: Date | null;
    createdAt: Date;
  }): UserView {
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      status: row.status,
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
