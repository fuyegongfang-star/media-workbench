import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getSecretCrypto } from '../system/crypto.util';
import { OpenAICompatibleProvider } from './openai-compatible.provider';
import type { LlmProvider } from './provider.contract';

export interface ResolvedLlm {
  provider: LlmProvider;
  providerName: string;
  baseUrl: string;
  model: string;
}

/**
 * LLM 供应商解析（深入设计 §3.1）：从 SystemConfig（enabled）读取加密 apiKey，AES 解密后构造 OpenAI 兼容客户端。
 * 路由：按 model 字符串选供应商（首期所有 OpenAI 兼容厂商共用 chat 协议）。
 * 无启用供应商 / 密钥解密失败 → 抛清晰错误（任务如实 failed，对应「待环境：未配置密钥」）。
 * 密钥仅在内存使用，绝不写日志、绝不返回明文。
 */
@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(forceModel?: string): Promise<ResolvedLlm> {
    if (!this.prisma.isConnected) {
      throw new Error('LLM 解析失败：数据库未连接（待 PG 环境）');
    }
    const where: Prisma.SystemConfigWhereInput = { enabled: true };
    if (forceModel) where.model = forceModel;
    const cfg = await this.prisma.client.systemConfig.findFirst({ where });
    if (!cfg) {
      throw new Error('未配置启用的 LLM 供应商（请在系统设置中新增 SystemConfig 并启用）');
    }
    let apiKey = '';
    try {
      apiKey = getSecretCrypto().decrypt(cfg.apiKeyEncrypted);
    } catch (e) {
      throw new Error(
        `LLM 密钥解密失败（请确认 APP_MASTER_KEY 与入库时一致）：${(e as Error).message}`,
      );
    }
    const baseUrl = (cfg.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    const provider = new OpenAICompatibleProvider({ baseUrl, apiKey, model: cfg.model });
    this.logger.log(`已解析 LLM 供应商：${cfg.provider} / model=${cfg.model}`); // 仅记供应商名与模型，不记密钥
    return { provider, providerName: cfg.provider, baseUrl, model: cfg.model };
  }
}
