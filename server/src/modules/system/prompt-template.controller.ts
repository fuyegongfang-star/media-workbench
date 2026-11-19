import {
  BadRequestException,
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
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { PrismaService } from '../../prisma/prisma.service';
// 注意：DTO 在 Controller 必须值导入（不能用 import type），否则 design:paramtypes 丢失，
// 全局 ValidationPipe(whitelist) 会把 Body 字段全部判为非法 → 整表 400。
import { CreatePromptTemplateDto } from './dto/prompt-template.dto';
import { UpdatePromptTemplateDto } from './dto/prompt-template.dto';
import {
  PROMPT_TASK_META,
  PROMPT_TASK_TYPES,
  buildTemplateVariables,
  isPromptTaskType,
  nextTemplateVersion,
  parseTemplateMeta,
  validateTemplateContent,
  type PromptScope,
} from './prompt-template.util';

export interface PromptTemplateView {
  id: string;
  taskType: string;
  taskLabel: string;
  taskGroup: string;
  platform: string;
  version: number;
  label: string;
  scope: PromptScope;
  ownedAccountId: string | null;
  builtin: boolean;
  enabled: boolean;
  content: string;
  variables: Record<string, unknown>;
  updatedAt: string;
}

/**
 * 提示词模板管理（T6 体验优化，补齐历史欠账）：
 * 此前 PromptTemplate 表与 6 处读取链路已就绪，但没有任何 CRUD / 设置入口，
 * 用户「找不到设置的地方」只能改 migration 或直接改库；本控制器补齐管理层。
 * - 内置预设 = seed 行（variables 无 __meta）：不可删，可停用、可「另存为新版本」自定义。
 * - 自定义模板：自动分配下一 version；读取端 findFirst(orderBy version desc) 天然取到最新自定义版。
 * - 账号专属：scope=account + ownedAccountId，读取端 pickPromptTemplate 优先匹配。
 * 全部经 Prisma 参数绑定；模板内容不写日志。
 */
@Controller('system/prompt-templates')
@UseGuards(AccessTokenGuard)
export class PromptTemplateController {
  constructor(private readonly prisma: PrismaService) {}

  private toView(row: {
    id: string;
    taskType: string;
    platform: string;
    version: number;
    content: string;
    enabled: boolean;
    variables: unknown;
    updatedAt: Date;
  }): PromptTemplateView {
    const meta = parseTemplateMeta(row.variables);
    const info = PROMPT_TASK_META[row.taskType];
    return {
      id: row.id,
      taskType: row.taskType,
      taskLabel: info?.label ?? row.taskType,
      taskGroup: info?.group ?? '正文创作',
      platform: row.platform,
      version: row.version,
      label: meta?.label || (info ? `${info.label} · 内置预设` : '内置预设'),
      scope: meta?.scope ?? 'global',
      ownedAccountId: meta?.ownedAccountId ?? null,
      builtin: !meta,
      enabled: row.enabled,
      content: row.content,
      variables:
        row.variables && typeof row.variables === 'object' && !Array.isArray(row.variables)
          ? (row.variables as Record<string, unknown>)
          : {},
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** 按环节分组列出全部模板（含各版本、内置/自定义、启停状态）。 */
  @Get()
  async list(): Promise<{ templates: PromptTemplateView[]; taskMeta: Record<string, unknown>; taskTypes: string[] }> {
    const rows = await this.prisma.client.promptTemplate.findMany({
      orderBy: [{ taskType: 'asc' }, { version: 'desc' }],
    });
    return {
      templates: rows.map((r) => this.toView(r)),
      taskMeta: PROMPT_TASK_META,
      taskTypes: PROMPT_TASK_TYPES,
    };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<PromptTemplateView> {
    const row = await this.prisma.client.promptTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`提示词模板不存在：${id}`);
    return this.toView(row);
  }

  /** 新增自定义模板：内容校验 + 自动下一版本号 + 账号范围校验。 */
  @Post()
  async create(@Body() dto: CreatePromptTemplateDto): Promise<PromptTemplateView> {
    if (!isPromptTaskType(dto.taskType)) throw new BadRequestException('不支持的模板环节');
    const v = validateTemplateContent(dto.content);
    if (!v.ok) throw new BadRequestException(v.error!);
    const platform = dto.platform ?? 'wechat';
    const scope: PromptScope = dto.scope === 'account' && dto.ownedAccountId ? 'account' : 'global';
    if (scope === 'account') {
      const acc = await this.prisma.client.ownedAccount.findUnique({
        where: { id: dto.ownedAccountId! },
        select: { id: true },
      });
      if (!acc) throw new BadRequestException('指定的归属账号不存在');
    }
    const existing = await this.prisma.client.promptTemplate.findMany({
      select: { taskType: true, platform: true, version: true },
    });
    const version = nextTemplateVersion(existing, dto.taskType, platform);
    const info = PROMPT_TASK_META[dto.taskType];
    const row = await this.prisma.client.promptTemplate.create({
      data: {
        taskType: dto.taskType as never,
        platform: platform as never,
        version,
        content: v.value!,
        enabled: true,
        variables: buildTemplateVariables({
          label: dto.label,
          scope,
          ownedAccountId: scope === 'account' ? dto.ownedAccountId : null,
          placeholders: info?.variables,
        }) as never,
      },
    });
    return this.toView(row);
  }

  /** 局部更新：改名/内容/启停/账号范围。内置预设也允许改（但保持不可删）。 */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePromptTemplateDto): Promise<PromptTemplateView> {
    const existing = await this.prisma.client.promptTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`提示词模板不存在：${id}`);
    if (dto.content !== undefined) {
      const v = validateTemplateContent(dto.content);
      if (!v.ok) throw new BadRequestException(v.error!);
    }
    const meta = parseTemplateMeta(existing.variables);
    const wantScope: PromptScope =
      dto.scope === 'global' ? 'global' : dto.scope === 'account' ? 'account' : meta?.scope ?? 'global';
    const wantAccountId = wantScope === 'account' ? (dto.ownedAccountId ?? meta?.ownedAccountId ?? null) : null;
    if (wantScope === 'account') {
      if (!wantAccountId) throw new BadRequestException('账号专属模板必须指定归属账号');
      const acc = await this.prisma.client.ownedAccount.findUnique({
        where: { id: wantAccountId },
        select: { id: true },
      });
      if (!acc) throw new BadRequestException('指定的归属账号不存在');
    }
    const base =
      existing.variables && typeof existing.variables === 'object' && !Array.isArray(existing.variables)
        ? (existing.variables as Record<string, unknown>)
        : {};
    const label = dto.label !== undefined ? dto.label : meta?.label ?? '';
    const variables = { ...base, ...buildTemplateVariables({ label: label || '自定义模板', scope: wantScope, ownedAccountId: wantAccountId }) };
    const row = await this.prisma.client.promptTemplate.update({
      where: { id },
      data: {
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        variables: variables as never,
      },
    });
    return this.toView(row);
  }

  /** 删除：仅允许删除自定义模板；内置预设只能停用（保护 seed 与外键快照）。 */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ ok: boolean }> {
    const existing = await this.prisma.client.promptTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`提示词模板不存在：${id}`);
    if (!parseTemplateMeta(existing.variables)) {
      throw new BadRequestException('内置预设不可删除，可改为「停用」或另存为自定义模板');
    }
    // 被 GenerationRun / AnalysisRun 引用为快照的模板不物理删除，仅停用，避免外键断裂。
    await this.prisma.client.promptTemplate.update({ where: { id }, data: { enabled: false } });
    return { ok: true };
  }
}
