import type { CustomSource, RawCandidate } from '../radar.contract';

/**
 * 自定义数据源采集器（站点管理员在「选题雷达 → 雷达配置」自行添加）。
 *
 * 支持两种零依赖格式：
 * - rss：RSS 2.0 `<item>` 与 Atom `<entry>`，取 title / link / pubDate|updated；
 * - json：返回数组，或 `{items|data|results|list: [...]}` 的对象，取 title/name/text 与 url/link。
 *
 * 安全：URL 只允许 http(s)；响应体截断；解析失败降级为单源 error，绝不阻断整轮采集。
 * 所有解析逻辑为纯函数，可直接单测，不依赖 Nest / 数据库。
 */

const MAX_BODY_CHARS = 512_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export function cleanHttpUrl(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(s)) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : '';
  } catch {
    return '';
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, '&');
}

function stripTags(s: string): string {
  // CDATA 必须先展开：否则 `<![CDATA[标题]]>` 会被下面的去标签正则整段当作标签剥掉，
  // 造成带 CDATA 的 RSS 条目标题为空而被丢弃。
  const unwrapped = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(unwrapped.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function pickText(block: string, tags: string[]): string {
  for (const tag of tags) {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
    if (m) return stripTags(m[1]);
  }
  return '';
}

function pickLink(block: string): string {
  const cdata = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block);
  if (cdata) {
    const u = cleanHttpUrl(stripTags(cdata[1]));
    if (u) return u;
  }
  const href = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i.exec(block);
  if (href) return cleanHttpUrl(decodeEntities(href[1]));
  return '';
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function textField(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return stripTags(v).slice(0, 300);
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

/** 解析 RSS/Atom 或 JSON 响应体，返回规范化候选（不会抛异常）。 */
export function parseCustomPayload(
  body: string,
  format: 'rss' | 'json',
  limit: number,
  sourceName: string,
): RawCandidate[] {
  const text = String(body ?? '').slice(0, MAX_BODY_CHARS);
  const cap = Math.max(1, Math.min(100, limit));
  const out: RawCandidate[] = [];

  if (format === 'json') {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }
    const o = asRecord(data);
    const rows = Array.isArray(data)
      ? data
      : [o.items, o.data, o.results, o.list, o.articles, o.entries].find(Array.isArray);
    if (!Array.isArray(rows)) return [];
    for (const row of rows.slice(0, cap * 2)) {
      const r = asRecord(row);
      const title = textField(r, ['title', 'name', 'text', 'headline', 'subject', 'content']) ||
        (typeof row === 'string' ? stripTags(row).slice(0, 300) : '');
      if (!title) continue;
      const url = cleanHttpUrl(r.url ?? r.link ?? r.href ?? r.sourceUrl);
      const heat = Number(r.heat ?? r.score ?? r.hot ?? r.rank ?? 0);
      out.push({
        title,
        ...(url ? { url } : {}),
        ...(Number.isFinite(heat) && heat > 0 ? { heat } : {}),
        ...(typeof r.publishedAt === 'string' || typeof r.date === 'string'
          ? { publishedAt: String(r.publishedAt ?? r.date).slice(0, 60) }
          : {}),
        sourceName,
        sourceType: 'custom',
      });
      if (out.length >= cap) break;
    }
    return out;
  }

  const blocks = text.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const title = pickText(block, ['title']);
    if (!title) continue;
    const url = pickLink(block);
    const publishedAt = pickText(block, ['pubDate', 'published', 'updated', 'date']);
    out.push({
      title: title.slice(0, 300),
      ...(url ? { url } : {}),
      ...(publishedAt ? { publishedAt: publishedAt.slice(0, 60) } : {}),
      sourceName,
      sourceType: 'custom',
    });
    if (out.length >= cap) break;
  }
  return out;
}

export interface CustomTestResult {
  ok: boolean;
  count: number;
  sample: Array<{ title: string; url?: string }>;
  /** 完整候选供正式采集复用；测试端点只回 sample，不把整包数据暴露给前端。 */
  items: RawCandidate[];
  error?: string;
}

/** 拉取并解析单个源；用于配置页「测试」按钮与正式采集。 */
export async function fetchCustomSource(
  source: Pick<CustomSource, 'url' | 'format'>,
  limit: number,
  sourceName = 'custom:test',
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CustomTestResult> {
  const url = cleanHttpUrl(source.url);
  if (!url) return { ok: false, count: 0, sample: [], items: [], error: 'URL 非法，仅支持 http(s) 地址' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(20_000, timeoutMs)));
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: source.format === 'json' ? 'application/json, */*' : 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) return { ok: false, count: 0, sample: [], items: [], error: `HTTP ${res.status}` };
    const body = (await res.text()).slice(0, MAX_BODY_CHARS);
    const items = parseCustomPayload(body, source.format, limit, sourceName);
    return {
      ok: items.length > 0,
      count: items.length,
      sample: items.slice(0, 3).map((i) => ({ title: i.title, ...(i.url ? { url: i.url } : {}) })),
      items,
      ...(items.length ? {} : { error: '请求成功但未解析出条目，请检查格式与字段' }),
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      count: 0,
      sample: [],
      items: [],
      error: /abort/i.test(raw) ? '请求超时' : raw.slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface CustomCollectOutcome {
  source: string;
  items: RawCandidate[];
  error?: string;
}

/** 采集所有启用的自定义源；单源失败只记 error，不影响内置源与其它自定义源。 */
export async function collectCustomSources(
  sources: CustomSource[],
  limit: number,
): Promise<CustomCollectOutcome[]> {
  const outcomes: CustomCollectOutcome[] = [];
  for (const s of sources) {
    if (!s.enabled) continue;
    const name = `custom:${s.id}`;
    const result = await fetchCustomSource(s, limit, name);
    outcomes.push({
      source: name,
      items: result.items ?? [],
      ...(result.error ? { error: result.error } : {}),
    });
  }
  return outcomes;
}
