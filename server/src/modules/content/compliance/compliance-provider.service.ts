/**
 * T3.11 合规预审 Provider 抽象层（深入设计 §3.1：统一适配层思想）。
 * 与朱雀「AI 痕迹/质量」检测（TEXT_DETECT）相互独立：合规预审聚焦「广告法极限词/敏感词」，
 * 作为送审前自动标红的「硬卡点」，必须离线、确定性、始终可用（不依赖外部 LLM）。
 *
 * 当前默认实现为 LocalDictionaryComplianceProvider（内置词典，离线确定性）。
 * 后续可在此注册 LLM-based ComplianceProvider（复用 LlmProviderService）做增强检测，
 * 但硬卡点仍以本地词典为准，LLM 失败不得阻断送审（失败兜底，深入设计 §3.3）。
 */

import { Injectable } from '@nestjs/common';
import { ComplianceWord, defaultComplianceDictionary } from './compliance-dictionary';
import { ComplianceMatch, scanCompliance } from './compliance.util';

export interface ComplianceProviderResult {
  /** 命中明细（含位置，供标红）。 */
  matches: ComplianceMatch[];
  /** 检测来源标识：local / llm / ... */
  service: string;
}

export interface ComplianceProvider {
  /** Provider 名称（如 local / llm）。 */
  name: string;
  /** 对正文做合规预审，返回命中明细与来源。 */
  check(text: string): Promise<ComplianceProviderResult>;
}

/**
 * 本地词典合规 Provider：内置/可扩展词表，子串匹配，离线确定性。
 * 是送审硬卡点的权威来源——不联网、不依赖密钥、永不「不可用」。
 */
export class LocalDictionaryComplianceProvider implements ComplianceProvider {
  readonly name = 'local';
  constructor(private readonly words: ComplianceWord[]) {}

  async check(text: string): Promise<ComplianceProviderResult> {
    const matches = scanCompliance(text ?? '', this.words);
    return { matches, service: 'local' };
  }
}

@Injectable()
export class ComplianceProviderService {
  /**
   * 解析合规预审 Provider。当前固定返回本地词典 Provider（含默认词典）。
   * 预留扩展点：若将来注册 LLM Provider，可在此按配置路由，但硬卡点逻辑仍以本地结果为准。
   */
  async resolve(): Promise<ComplianceProvider> {
    return new LocalDictionaryComplianceProvider(defaultComplianceDictionary());
  }
}
