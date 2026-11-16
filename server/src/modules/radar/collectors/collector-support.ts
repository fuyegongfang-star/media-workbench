/** 采集器公共工具：统一超时、UA、失败降级（单源失败不阻断整轮）。 */

export const FETCH_TIMEOUT_MS = 12000;
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export class CollectorFetchError extends Error {
  constructor(
    readonly source: string,
    message: string,
  ) {
    super(message);
  }
}

/** 带超时的 GET；非 2xx 抛错由调用方降级为 error 字段。 */
export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new CollectorFetchError(url, `HTTP ${res.status}`);
  return res.text();
}

/** 从文本中抽取标题[]：JSON 数组或 RSS item 的 title 节点，做基础 HTML 实体反转义。 */
export function decodeEntities(text: string): string {
  return String(text ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** 关键词相关性预筛：标题不含任一关键词则丢弃（空关键词=不过滤，用于 HN 等泛源）。 */
export function matchesAny(title: string, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const t = title.toLowerCase();
  return keywords.some((k) => k.trim() && t.includes(k.trim().toLowerCase()));
}
