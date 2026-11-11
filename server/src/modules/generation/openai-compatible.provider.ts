import type { ChatMessage, LlmProvider, LlmResult } from './provider.contract';

export interface OpenAICompatibleConfig {
  /** 基础地址（不含末尾斜杠），如 https://api.openai.com/v1 */
  baseUrl: string;
  /** 已解密的明文密钥（仅内存使用，绝不写日志/返回前端） */
  apiKey: string;
  /** 默认模型 */
  model: string;
  /** 单次请求超时（毫秒），默认 60s */
  timeoutMs?: number;
}

/**
 * OpenAI 兼容供应商适配器（深入设计 §3.1：统一 chat 协议）。
 * - 用 Node 22 内置 fetch 调用 `${baseUrl}/chat/completions`，零额外依赖。
 * - 密钥仅在内存中使用，绝不打印到日志或回传前端。
 * - 失败抛清晰错误（任务中心据此将 Task 置 failed，不伪造成功）。
 */
export class OpenAICompatibleProvider implements LlmProvider {
  constructor(private readonly cfg: OpenAICompatibleConfig) {}

  async chat(
    messages: ChatMessage[],
    opts: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<LlmResult> {
    const base = this.cfg.baseUrl.replace(/\/+$/, '');
    const url = `${base}/chat/completions`;
    const model = opts.model ?? this.cfg.model;
    const body = {
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 2000,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 60_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`LLM 请求失败（model=${model}）：${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM 响应错误 HTTP ${res.status}：${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    const usage = data.usage
      ? {
          prompt: Number(data.usage.prompt_tokens ?? 0),
          completion: Number(data.usage.completion_tokens ?? 0),
        }
      : undefined;
    return { text, usage };
  }
}
