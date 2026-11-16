/**
 * LLM 供应商连通性探测纯函数（不依赖 Nest / 数据库，可单测）。
 *
 * 目的：在「AI 与密钥」页保存前/保存后，用真实的一次最小 chat 请求验证
 * Base URL + API Key + 模型是否可用，而不是只做字符串校验。
 *
 * 安全约定：
 * - 明文密钥只在内存里用于本次 fetch，绝不写日志、不入库、不回传前端；
 * - 任何对外错误信息都经 redactSecret 抹掉密钥；
 * - 只接受 http(s) Base URL，避免把密钥发往 javascript:/file: 之类的目标；
 * - 恒定 15s 超时上限，响应体只保留前若干字符，防止异常响应撑爆内存。
 */

export interface ProviderProbeInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export interface ProviderProbeResult {
  ok: boolean;
  latencyMs: number;
  model: string;
  replySnippet?: string;
  httpStatus?: number;
  error?: string;
}

export const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';
export const PROBE_MAX_TIMEOUT_MS = 20_000;
export const PROBE_DEFAULT_TIMEOUT_MS = 15_000;

/** 规范化 Base URL：去末尾斜杠、空值回落 OpenAI、拒绝非 http(s) 协议。返回 '' 表示非法。 */
export function normalizeBaseUrl(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!s) return DEFAULT_LLM_BASE_URL;
  if (!/^https?:\/\/\S+$/i.test(s)) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : '';
  } catch {
    return '';
  }
}

/** 错误信息脱敏：把所有可能的明文密钥替换成 ***，并截断长度。 */
export function redactSecret(text: string, secrets: Array<string | undefined>): string {
  let out = String(text ?? '');
  for (const raw of secrets) {
    const s = String(raw ?? '').trim();
    if (s.length >= 4) out = out.split(s).join('***');
  }
  return out.slice(0, 300);
}

/** 真实发起一次最小 chat 请求；任何失败都转成结构化结果，不抛异常、不泄露密钥。 */
export async function probeProvider(input: ProviderProbeInput): Promise<ProviderProbeResult> {
  const started = Date.now();
  const model = String(input.model ?? '').trim();
  const apiKey = String(input.apiKey ?? '').trim();
  const base = normalizeBaseUrl(input.baseUrl);
  const latency = () => Date.now() - started;

  if (!base) return { ok: false, latencyMs: latency(), model, error: 'Base URL 非法，仅支持 http(s) 地址' };
  if (!model) return { ok: false, latencyMs: latency(), model, error: '缺少模型名称' };
  if (!apiKey) return { ok: false, latencyMs: latency(), model, error: '缺少 API Key' };

  const timeout = Math.min(
    PROBE_MAX_TIMEOUT_MS,
    Math.max(1000, Number(input.timeoutMs) || PROBE_DEFAULT_TIMEOUT_MS),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '请只回复两个字：正常' }],
        temperature: 0,
        max_tokens: 16,
        stream: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        latencyMs: latency(),
        model,
        httpStatus: res.status,
        error: redactSecret(`HTTP ${res.status}${body ? `：${body.slice(0, 200)}` : ''}`, [apiKey]),
      };
    }
    const data = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (data.error?.message) {
      return {
        ok: false,
        latencyMs: latency(),
        model,
        error: redactSecret(data.error.message, [apiKey]),
      };
    }
    const reply = String(data.choices?.[0]?.message?.content ?? '').trim();
    return {
      ok: true,
      latencyMs: latency(),
      model,
      replySnippet: redactSecret(reply.slice(0, 120) || '(模型已响应，未返回文本内容)', [apiKey]),
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const reason = /abort/i.test(raw) ? `请求超时（${Math.round(timeout / 1000)}s）` : raw;
    return { ok: false, latencyMs: latency(), model, error: redactSecret(reason, [apiKey]) };
  } finally {
    clearTimeout(timer);
  }
}
