import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { getSecretCrypto, maskSecret } from './crypto.util';
import { UpsertProviderDto } from './dto/system-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

export interface ProviderView {
  id: string;
  provider: string;
  label: string;
  baseUrl: string | null;
  model: string;
  apiKeyMasked: string;
  apiKeyConfigured: boolean;
  monthlyBudget: number | null;
  enabled: boolean;
  updatedAt: string;
}

/**
 * LLM 供应商管理（T6.2 补齐历史欠账）：SystemConfig 的 CRUD。
 * - 密钥：明文仅在内存经 AES-256-GCM 加密后入库，列表/详情只返回脱敏串（maskSecret），绝不回显明文或写日志。
 * - 更新时 apiKey 留空 = 保持原密文；传空串 = 清空（等价删除密钥）。
 * - 唯一约束 (provider, model) 由 Prisma upsert 保证；参数绑定防注入。
 */
@Controller('system/providers')
@UseGuards(AccessTokenGuard)
export class ProviderController {
  constructor(private readonly prisma: PrismaService) {}

  private toView(row: {
    id: string;
    provider: string;
    label: string;
    baseUrl: string | null;
    model: string;
    apiKeyEncrypted: string;
    monthlyBudget: number | null;
    enabled: boolean;
    updatedAt: Date;
  }): ProviderView {
    return {
      id: row.id,
      provider: row.provider,
      label: row.label,
      baseUrl: row.baseUrl,
      model: row.model,
      apiKeyMasked: row.apiKeyEncrypted ? maskSecret(this.decryptSafe(row.apiKeyEncrypted)) : '',
      apiKeyConfigured: Boolean(row.apiKeyEncrypted),
      monthlyBudget: row.monthlyBudget,
      enabled: row.enabled,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private decryptSafe(cipher: string): string {
    try {
      return getSecretCrypto().decrypt(cipher);
    } catch {
      return ''; // 主密钥不匹配时如实显示未配置，不泄露任何信息
    }
  }

  @Get()
  async list(): Promise<{ providers: ProviderView[] }> {
    const rows = await this.prisma.client.systemConfig.findMany({ orderBy: { createdAt: 'asc' } });
    return { providers: rows.map((r) => this.toView(r)) };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<ProviderView> {
    const row = await this.prisma.client.systemConfig.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`LLM 供应商不存在：${id}`);
    return this.toView(row);
  }

  /** 新增或按 (provider, model) 覆盖更新；id 存在则更新该行。 */
  @Post()
  async upsert(@Body() dto: UpsertProviderDto): Promise<ProviderView> {
    const apiKeyEnc =
      dto.apiKey === undefined
        ? undefined
        : dto.apiKey
          ? getSecretCrypto().encrypt(dto.apiKey)
          : '';
    const data: Prisma.SystemConfigUncheckedCreateInput = {
      provider: dto.provider,
      label: dto.label,
      baseUrl: dto.baseUrl ?? null,
      model: dto.model,
      apiKeyEncrypted: apiKeyEnc ?? '',
      monthlyBudget: dto.monthlyBudget ?? null,
      enabled: dto.enabled ?? true,
    };
    const row = await this.prisma.client.systemConfig.upsert({
      where: { provider_model: { provider: dto.provider, model: dto.model } },
      create: data,
      update: {
        label: data.label,
        baseUrl: data.baseUrl,
        monthlyBudget: data.monthlyBudget,
        enabled: data.enabled,
        ...(apiKeyEnc !== undefined ? { apiKeyEncrypted: apiKeyEnc } : {}),
      },
    });
    return this.toView(row);
  }

  /** 局部更新（改名/改模型/启停/换密钥）。 */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProviderDto): Promise<ProviderView> {
    const existing = await this.prisma.client.systemConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`LLM 供应商不存在：${id}`);
    const apiKeyEnc =
      dto.apiKey === undefined
        ? undefined
        : dto.apiKey
          ? getSecretCrypto().encrypt(dto.apiKey)
          : '';
    const row = await this.prisma.client.systemConfig.update({
      where: { id },
      data: {
        ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.baseUrl !== undefined ? { baseUrl: dto.baseUrl } : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(apiKeyEnc !== undefined ? { apiKeyEncrypted: apiKeyEnc } : {}),
        ...(dto.monthlyBudget !== undefined ? { monthlyBudget: dto.monthlyBudget } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
    return this.toView(row);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ ok: boolean }> {
    await this.prisma.client.systemConfig.delete({ where: { id } });
    return { ok: true };
  }
}
