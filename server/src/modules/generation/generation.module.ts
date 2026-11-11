import { Controller, Get, Module } from '@nestjs/common';
import { LlmProviderService } from './llm-provider.service';
import { DetectPolishProviderService } from './detect-polish-provider.service';

@Controller('generation')
export class GenerationController {
  @Get()
  overview(): Record<string, unknown> {
    return {
      module: 'generation',
      label: 'AI 统一入口',
      status: 'partial',
      rule: '所有 AI 调用经 LlmProviderService / DetectPolishProviderService，强制参数化模型 + 密钥仅内存解密（绝不写日志）',
      providers: ['OpenAICompatibleProvider（OpenAI / DeepSeek / Moonshot 等 OpenAI 兼容协议）', '朱雀检测 / LLM 检测 / LLM 润色'],
      todo: 'T2.3 单篇拆解已接入；T3.5 续写/改写/压缩/扩写 · T3.7 朱雀/润色 · T2.4 账号级汇总',
    };
  }
}

/**
 * 生成模块（AI 适配层）。
 * - LlmProviderService：从 SystemConfig 解析并构造 OpenAI 兼容客户端（密钥 AES 解密仅内存）。
 * - DetectPolishProviderService：朱雀检测 / LLM 基准检测 / LLM 润色 Provider 解析（T3.7）。
 * - 供应给分析/创作等模块复用。PrismaService 由全局 PrismaModule 提供。
 */
@Module({
  controllers: [GenerationController],
  providers: [LlmProviderService, DetectPolishProviderService],
  exports: [LlmProviderService, DetectPolishProviderService],
})
export class GenerationModule {}
