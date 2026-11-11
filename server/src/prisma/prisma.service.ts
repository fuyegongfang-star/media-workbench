import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { dataIntegrityExtension } from './data-integrity';

/**
 * Prisma 全局客户端封装（T1.3 起不再直接 extends PrismaClient，
 * 而是持有「扩展后的」客户端，避免对 PrismaClient Proxy 实例做 Object.assign 触发 set 陷阱）。
 *
 * 扩展（T1.3）：dataIntegrityExtension —— 软删作用域 + 审计（深入设计 §2.2/§2.4）。
 * 业务代码通过 `prisma.client.<model>` 访问；健康检查用 `prisma.isConnected`。
 *
 * 降级策略（护栏）：本机无 PostgreSQL / Docker 不可用时，$connect 失败不阻断 API 启动，
 * 健康检查如实报 unavailable（待环境），绝不伪造通过。生产环境应由 compose 起 PG 后连接。
 * 查询一律走 Prisma 参数绑定，不拼接 SQL（防注入）。
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  /** 扩展后的 Prisma 客户端（软删作用域 + 审计）。所有模型访问走这里。 */
  readonly client: PrismaClient; // $extends 返回带扩展品牌的类型，运行时即为 PrismaClient

  constructor(config: ConfigService) {
    const url = config.get<string>('DATABASE_URL');
    const base = new PrismaClient({
      datasources: { db: { url } },
      log: ['warn', 'error'],
    });
    this.client = base.$extends(dataIntegrityExtension) as unknown as PrismaClient;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
      this.connected = true;
      this.logger.log('PostgreSQL 连接成功');
    } catch (error: unknown) {
      this.connected = false;
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      this.logger.warn(`PostgreSQL 未就绪（待环境，不伪造通过）：${message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.client.$disconnect();
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }
}
