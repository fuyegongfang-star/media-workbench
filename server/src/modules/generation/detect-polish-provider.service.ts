import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getSecretCrypto } from '../system/crypto.util';
import { renderPromptPlaceholders } from '../system/prompt-template.util';
import { resolvePromptTemplate } from './prompt-template-resolver.service';
import { LlmProviderService } from './llm-provider.service';
import type {
  ChatMessage,
  DetectProvider,
  DetectResult,
  PolishProvider,
  PolishResult,
} from './provider.contract';
import { normalizeDetectResult } from '../content/detection/text-review.util';

/**
 * T3.7 检测 / 润色 Provider 解析与具体实现（深入设计 §3.1：统一适配层）。
 * - 朱雀检测：按 SystemConfig（provider='zhuque'）解析独立检测服务；未配置时回退到 LLM 基准检测（深入设计 §1.2 检测不改文）。
 * - 润色：复用 OpenAI 兼容 LLM 供应商（与生成同链路）。
 * 密钥仅经 AES 解密在内存使用，绝不写日志、绝不回传前端。
 */
@Injectable()
export class DetectPolishProviderService {
  private readonly logger = new Logger(DetectPolishProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmProviderService,
  ) {}

  /** 解析检测 Provider（优先朱雀，未配置回落 LLM 基准检测）。 */
  async resolveDetect(
    forceService?: string,
  ): Promise<{ provider: DetectProvider; serviceName: string; serviceVersion?: string }> {
    const want = forceService ?? 'zhuque';
    if (want === 'zhuque') {
      const cfg = await this.prisma.client.systemConfig.findFirst({
        where: { provider: 'zhuque', enabled: true },
      });
      if (cfg) {
        let apiKey = '';
        try {
          apiKey = getSecretCrypto().decrypt(cfg.apiKeyEncrypted);
        } catch (e) {
          throw new Error(`朱雀检测密钥解密失败：${(e as Error).message}`);
        }
        this.logger.log('已解析检测服务：zhuque');
        return {
          provider: new ZhuqueDetectProvider({ baseUrl: cfg.baseUrl ?? '', apiKey, model: cfg.model }),
          serviceName: 'zhuque',
          serviceVersion: cfg.model,
        };
      }
      if (!forceService) {
        // 默认路径：未配置朱雀时回落到 LLM 基准检测（仍可用）
        const r = await this.llm.resolve();
        return { provider: new LlmDetectProvider(r.provider, r.model), serviceName: 'llm', serviceVersion: r.model };
      }
      throw new Error('未配置启用的「朱雀」检测服务（请在系统设置新增 provider=zhuque 的 SystemConfig 并启用）');
    }
    if (want === 'llm') {
      const r = await this.llm.resolve();
      return { provider: new LlmDetectProvider(r.provider, r.model), serviceName: 'llm', serviceVersion: r.model };
    }
    throw new Error(`不支持的检测服务：${want}（支持 zhuque / llm）`);
  }

  /**
   * 解析润色 Provider（复用 OpenAI 兼容 LLM 供应商）。
   * 从 DB 读取 `polish` 环节模板（账号专属优先、全局兜底）；未配置时用内置默认指令。
   * 这样「润色去 AI 味」的提示词不再硬编码，可在「系统设置 → 提示词模板」自定义。
   */
  async resolvePolish(
    forceModel?: string,
    ownedAccountId?: string | null,
  ): Promise<{ provider: PolishProvider; model: string }> {
    const r = await this.llm.resolve(forceModel);
    let template: string | undefined;
    try {
      const pt = await resolvePromptTemplate(this.prisma, 'polish', 'wechat', ownedAccountId);
      template = pt?.content;
    } catch {
      // 模板查询失败不阻断润色，回退内置默认指令
    }
    return { provider: new LlmPolishProvider(r.provider, r.model, template), model: r.model };
  }

  /**
   * 解析 LLM 基准检测 Provider（朱雀不可用时的降级通道）。
   * 与 resolveDetect('llm') 等价，但独立成方法，语义更清晰，便于调用方显式降级。
   */
  async resolveLlmDetect(): Promise<{ provider: DetectProvider; serviceName: string; serviceVersion: string }> {
    const r = await this.llm.resolve();
    return { provider: new LlmDetectProvider(r.provider, r.model), serviceName: 'llm', serviceVersion: r.model };
  }
}

/**
 * 把长正文按段落切成适合单次 LLM 润色的片段，避免「整篇正文 + 超大 max_tokens」
 * 触发上下文窗口 / 单次输出上限（多数 OpenAI 兼容端点 max_tokens 上限远低于 8000）。
 * - 优先在空行（段落）边界切分，保持段落完整；
 * - 单个超长段落再按句末标点兜底切分；
 * - 短文本（≤ maxChars）原样返回，只有一段。
 */
export function splitTextForPolish(input: string, maxChars = 1800): string[] {
  const text = (input ?? '').replace(/\r\n/g, '\n');
  if (!text.trim()) return [];
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = '';
  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = '';
  };

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      // 段落超长：按句末标点切，尽量不切断句子
      flush();
      const parts = para.split(/([。！？!?；;\n])/);
      let sentence = '';
      for (const part of parts) {
        if ((sentence + part).length > maxChars && sentence) {
          chunks.push(sentence.trim());
          sentence = part;
        } else {
          sentence += part;
        }
      }
      if (sentence.trim()) chunks.push(sentence.trim());
      continue;
    }
    const merged = buf ? `${buf}\n\n${para}` : para;
    if (merged.length > maxChars && buf) {
      flush();
      buf = para;
    } else {
      buf = merged;
    }
  }
  flush();
  return chunks;
}

/** 按输入规模动态推算单次润色的输出上限：保底 600，硬顶 3000，约输入的 1.4 倍。 */
export function polishMaxTokens(inputChars: number): number {
  return Math.max(600, Math.min(Math.ceil(inputChars * 1.4), 3000));
}

export interface ZhuqueDetectConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * 朱雀检测 Provider：调用独立检测服务（POST JSON），严格解析。
 * baseUrl 即完整检测端点；密钥仅内存使用；非 2xx 抛清晰错误（任务如实 failed，不伪造成功）。
 */
export class ZhuqueDetectProvider implements DetectProvider {
  private readonly base: string;
  constructor(private readonly cfg: ZhuqueDetectConfig) {
    this.base = cfg.baseUrl.replace(/\/+$/, '');
  }

  async detect(text: string, versionId: string): Promise<DetectResult> {
    if (!this.base) throw new Error('朱雀检测未配置 baseUrl');
    let res: Response;
    try {
      res = await fetch(this.base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({ text, versionId, model: this.cfg.model }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`朱雀检测请求失败：${msg}`);
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`朱雀检测响应错误 HTTP ${res.status}：${t.slice(0, 200)}`);
    }
    const data = (await res.json()) as unknown;
    const norm = normalizeDetectResult(data, 'zhuque');
    return { raw: data, summary: norm.summary, serviceVersion: norm.serviceVersion ?? this.cfg.model };
  }
}

/**
 * LLM 基准检测 Provider：复用已配置 LLM 供应商，要求模型返回 JSON 形式的
 * AI 痕迹 / 质量评估（深入设计 §1.2：检测不改文，只产出 TextReviewRun）。
 */
export class LlmDetectProvider implements DetectProvider {
  constructor(
    private readonly llm: import('./provider.contract').LlmProvider,
    private readonly model: string,
  ) {}

  async detect(text: string, _versionId: string): Promise<DetectResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是一个中文内容「AI 写作痕迹 / 质量」检测助手。仅输出一个 JSON 对象，不要任何解释或代码块包裹。' +
          'JSON 形如：{"aiScore": 0~1 的浮点（AI 痕迹概率，越高越像 AI 写）,"summary":"一句话概述检测结论","risks":["风险点1","风险点2"]}。',
      },
      {
        role: 'user',
        content: `请检测以下文本的 AI 写作痕迹与质量问题：\n\n${text.slice(0, 8000)}`,
      },
    ];
    const result = await this.llm.chat(messages, { model: this.model, temperature: 0.2, maxTokens: 800 });
    const data = parseJsonObject(result.text);
    if (!data) {
      // 模型未返回可解析 JSON：以原始输出（截断）作为摘要，仍属「已检测」
      const fallback = (result.text || '').trim().slice(0, 200);
      return { raw: { rawText: result.text }, summary: fallback || '（已检测，无文本摘要）', serviceVersion: this.model };
    }
    const norm = normalizeDetectResult(data, 'llm');
    return { raw: data, summary: norm.summary, serviceVersion: norm.serviceVersion ?? this.model };
  }
}

/**
 * LLM 润色 Provider：复用已配置 LLM 供应商对正文进行润色（不改变原稿，产出 staging 版本待采纳）。
 */
export class LlmPolishProvider implements PolishProvider {
  constructor(
    private readonly llm: import('./provider.contract').LlmProvider,
    private readonly model: string,
    /** 可选的 DB 自定义模板（含 {{text}} {{tone}} 占位符）；未配置时用内置默认指令。 */
    private readonly template?: string,
  ) {}

  async polish(text: string, opts: { tone?: string }): Promise<PolishResult> {
    const tone = opts?.tone ? `，语气基调：${opts.tone}` : '，保持原作者风格与信息完整';
    // 分段润色：避免「整篇正文 + 8000 max_tokens」触发上下文/输出上限（这是润色请求失败的常见根因）。
    const chunks = splitTextForPolish(text);
    if (chunks.length === 0) return { revised: '' };

    const systemContent =
      '你是一名资深中文编辑，负责润色公众号文章正文。只输出润色后的完整正文本身，' +
      '不要包含任何解释、标题或 Markdown 代码块包裹' +
      tone +
      '。修正语病、冗余与不通顺之处，不改变原意与事实。';

    const revisedParts: string[] = [];
    for (const chunk of chunks) {
      const messages: ChatMessage[] = this.template?.trim()
        ? [
            {
              role: 'system',
              content: '你是资深中文编辑。严格按用户给出的润色要求处理正文，只输出润色后的完整正文本身，不要任何解释或代码块包裹。',
            },
            {
              role: 'user',
              content: renderPromptPlaceholders(this.template, {
                text: chunk,
                tone: opts?.tone || '保持原作者风格',
              }),
            },
          ]
        : [
            { role: 'system', content: systemContent },
            { role: 'user', content: `请润色以下正文片段：\n\n${chunk}` },
          ];
      // 每段按自身长度动态设置输出上限，且不超过常见端点的安全阈值。
      const maxTokens = polishMaxTokens(chunk.length);
      const result = await this.llm.chat(messages, { model: this.model, temperature: 0.5, maxTokens });
      const part = extractPolishText(result.text);
      if (!part) throw new Error('润色返回空片段（模型未返回正文）');
      revisedParts.push(part);
    }
    return { revised: revisedParts.join('\n\n') };
  }
}

/** 从模型输出中提取纯正文（去 ``` 围栏 / 首尾引号 / 多余说明）。 */
export function extractPolishText(raw: string): string {
  if (!raw) return '';
  let t = raw.trim();
  // 去掉 ```markdown / ``` 围栏
  const fence = t.match(/^```(?:[a-zA-Z0-9]*)\n([\s\S]*?)\n```$/);
  if (fence) t = fence[1].trim();
  // 去掉首尾成对引号（模型偶尔包裹）
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('“') && t.endsWith('”'))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** 从模型输出解析首个 JSON 对象（去 ```json 围栏 / 抓首 { 至尾 }），失败回退 null。 */
function parseJsonObject(raw: string): unknown {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw.trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
