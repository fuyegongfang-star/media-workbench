import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthTokenPayload, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, TokenType } from './jwt.constants';

/** 返回给前端的用户脱敏信息（绝不带 passwordHash）。 */
interface PublicUser {
  id: string;
  username: string;
  role: string;
  createdAt: Date;
}

/** 登录成功后返回的令牌对。 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** 模块启动后播种首期单用户（仅当数据库可用且尚无用户时）。 */
  async onModuleInit(): Promise<void> {
    if (!this.prisma.isConnected) {
      this.logger.warn('PostgreSQL 未就绪，跳过初始用户播种（待环境，不伪造通过）');
      return;
    }
    const count = await this.prisma.client.user.count();
    if (count > 0) return;

    const username = this.config.get<string>('INITIAL_USERNAME') ?? 'admin';
    const password = this.config.get<string>('INITIAL_PASSWORD');
    if (!password) {
      this.logger.warn('未配置 INITIAL_PASSWORD，跳过初始用户播种（请在 .env 设置后重启）');
      return;
    }
    const passwordHash = await hash(password);
    await this.prisma.client.user.create({
      data: { username, passwordHash, role: 'owner' },
    });
    this.logger.log(`已创建首期初始用户：${username}`);
  }

  /** 校验用户名 + 口令，返回用户或 null（不抛错，避免泄露账号是否存在）。 */
  async validateUser(username: string, password: string): Promise<PublicUser | null> {
    const user = await this.prisma.client.user.findUnique({ where: { username } });
    if (!user) return null;
    let ok = false;
    try {
      ok = await verify(user.passwordHash, password);
    } catch {
      ok = false;
    }
    if (!ok) return null;
    return this.toPublic(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.validateUser(dto.username, dto.password);
    if (!user) {
      throw new UnauthorizedException('用户名或口令错误');
    }
    return this.issueTokens(user);
  }

  /** 刷新访问令牌：刷新守卫已校验签名与 type=refresh，此处仅重新签发 access。 */
  async refresh(payload: AuthTokenPayload): Promise<{ accessToken: string }> {
    const user = await this.prisma.client.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('用户不存在或已被删除');
    }
    return { accessToken: this.sign(user, 'access') };
  }

  /** 当前用户信息（用于 /auth/me）。 */
  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    return this.toPublic(user);
  }

  private issueTokens(user: PublicUser): AuthTokens {
    return {
      accessToken: this.sign(user, 'access'),
      refreshToken: this.sign(user, 'refresh'),
      user,
    };
  }

  private sign(user: PublicUser, type: TokenType): string {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? ACCESS_TOKEN_TTL;
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? REFRESH_TOKEN_TTL;
    const payload: AuthTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      type,
    };
    const ttl = (type === 'access' ? accessTtl : refreshTtl) as JwtSignOptions['expiresIn'];
    return this.jwt.sign(payload, { expiresIn: ttl });
  }

  private toPublic(user: {
    id: string;
    username: string;
    role: string;
    createdAt: Date;
    passwordHash?: string;
  }): PublicUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
