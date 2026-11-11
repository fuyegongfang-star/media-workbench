/**
 * AI 适配层接口契约（技术方案 §7 / 深入设计 §3.1）。
 * 产品逻辑只依赖接口，不绑定单一厂商；供应商密钥经 SystemConfig 加密存储 + 环境变量主密钥，绝不写日志。
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResult {
  text: string;
  usage?: { prompt: number; completion: number };
}

export interface LlmProvider {
  chat(
    messages: ChatMessage[],
    opts: { model: string; temperature?: number; maxTokens?: number },
  ): Promise<LlmResult>;
}

export interface DetectResult {
  raw: unknown;
  summary?: string;
  serviceVersion?: string;
}

export interface DetectProvider {
  detect(text: string, versionId: string): Promise<DetectResult>;
}

export interface PolishResult {
  revised: string;
}

export interface PolishProvider {
  polish(text: string, opts: { tone?: string }): Promise<PolishResult>;
}
