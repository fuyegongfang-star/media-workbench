import { createHash } from 'node:crypto';
import type { RadarConfig, ScoredCandidate } from './radar.contract';

/**
 * 雷达纯函数集合：无 I/O、可单测。
 * 规范化去重用 unicode NFC + 去空白 + 小写，与 SourceMaterial 的 sha256 约定一致。
 */
export function normalizeTitle(raw: string): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function fingerprintOf(raw: string): string {
  return createHash('sha256').update(normalizeTitle(raw)).digest('hex');
}

/** 配置清洗：限制数组长度、过滤空串、条数夹在合理区间，防异常输入撑爆采集。 */
export function sanitizeConfig(input: unknown): RadarConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const fallback = {
    niches: [
      { name: '副业与网赚', enabled: true, keywords: ['副业', '网赚', '变现', '被动收入', '项目拆解', '私域', '引流'] },
      { name: 'AI与效率工具', enabled: true, keywords: ['AI', 'AI工具', 'ChatGPT', '智能体', 'Agent', '自动化', 'AIGC', '提示词'] },
    ],
    sources: { toutiao: true, bilibili: true, hnrss: true, sogou_wechat: true, x_account: true, youtube_account: true },
    output: { totalItems: 20, featuredItems: 5, titlesPerItem: 3, saveToLibrary: true },
    schedule: { enabled: false, time: '08:00', timezone: 'Asia/Shanghai' },
    monitoredAccounts: { x: [], youtube: [] },
    accountDedupeDays: 7,
  } as RadarConfig;

  const strArray = (v: unknown, max: number): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, max).map((x) => x.trim().slice(0, 80))
      : [];

  const niches = Array.isArray(raw.niches)
    ? raw.niches.slice(0, 20).flatMap((n) => {
        if (!n || typeof n !== 'object') return [];
        const o = n as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name.trim().slice(0, 60) : '';
        if (!name) return [];
        return [{ name, enabled: o.enabled !== false, keywords: strArray(o.keywords, 40) }];
      })
    : fallback.niches;

  const sourcesRaw = (raw.sources && typeof raw.sources === 'object' ? raw.sources : {}) as Record<string, unknown>;
  const sources = {
    toutiao: sourcesRaw.toutiao !== false,
    bilibili: sourcesRaw.bilibili !== false,
    hnrss: sourcesRaw.hnrss !== false,
    sogou_wechat: sourcesRaw.sogou_wechat !== false,
    x_account: sourcesRaw.x_account !== false,
    youtube_account: sourcesRaw.youtube_account !== false,
  };

  const out = (raw.output && typeof raw.output === 'object' ? raw.output : {}) as Record<string, unknown>;
  const clampInt = (v: unknown, def: number, min: number, max: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : def;
  };
  const totalItems = clampInt(out.totalItems, 20, 5, 100);
  const output = {
    totalItems,
    featuredItems: Math.min(clampInt(out.featuredItems, 5, 1, 20), totalItems),
    titlesPerItem: clampInt(out.titlesPerItem, 3, 1, 5),
    saveToLibrary: out.saveToLibrary !== false,
  };

  const sch = (raw.schedule && typeof raw.schedule === 'object' ? raw.schedule : {}) as Record<string, unknown>;
  const time = typeof sch.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(sch.time) ? sch.time : '08:00';
  const schedule = { enabled: sch.enabled === true, time, timezone: 'Asia/Shanghai' };

  const acc = (raw.monitoredAccounts && typeof raw.monitoredAccounts === 'object' ? raw.monitoredAccounts : {}) as Record<string, unknown>;
  const monitoredAccounts = {
    x: strArray(acc.x, 50),
    youtube: strArray(acc.youtube, 50),
  };

  // 去重窗口：0=关闭，1-90 天；非法值回落默认 7
  const dedupeRaw = Number(raw.accountDedupeDays);
  const accountDedupeDays = Number.isFinite(dedupeRaw)
    ? Math.max(0, Math.min(90, Math.floor(dedupeRaw)))
    : 7;

  return { niches: niches.length ? niches : fallback.niches, sources, output, schedule, monitoredAccounts, accountDedupeDays };
}

/** 盯号内容去重键：优先稳定 URL（视频 ID / 推文 ID），无 URL 时回退标题指纹。 */
export function accountDedupeKey(url: string | undefined, title: string): string {
  const u = String(url ?? '').trim();
  return u ? `url:${u}` : `fp:${fingerprintOf(title)}`;
}

/** 跨轮增量过滤：只针对盯号来源，命中历史 seen 集合的剔除，其余（含全部热榜源）原样保留。 */
export function filterSeenAccounts<T extends { sourceName: string; url?: string; title: string }>(
  items: T[],
  seen: Set<string>,
  windowDays: number,
): T[] {
  if (windowDays <= 0 || !seen.size) return items;
  const accountSources = new Set(['x_account', 'youtube_account']);
  return items.filter((it) => !accountSources.has(it.sourceName) || !seen.has(accountDedupeKey(it.url, it.title)));
}

/** 赛道相关度：标题命中任一关键词即为相关，命中越多分越高（0-1）。 */
export function relevanceOf(title: string, keywords: string[]): number {
  const t = normalizeTitle(title);
  if (!t) return 0;
  const normalizedKeywords = keywords.map(normalizeTitle).filter(Boolean);
  if (!normalizedKeywords.length) return 0;
  const hit = normalizedKeywords.filter((k) => t.includes(k)).length;
  return Math.min(1, hit / Math.min(3, normalizedKeywords.length));
}

/** 热度归一：对数压缩，避免头部条目分值爆炸（0-100）。 */
export function normalizeHeat(raw: number | undefined, max: number): number {
  if (!Number.isFinite(raw) || (raw ?? 0) <= 0) return 0;
  const ceil = Math.max(max, 1);
  return Math.max(0, Math.min(100, (Math.log1p(raw as number) / Math.log1p(ceil)) * 100));
}

/** 综合分：相关度为主(0.7) + 热度为辅(0.3)。 */
export function scoreOf(relevance: number, heat01: number): number {
  return Math.round((relevance * 0.7 + heat01 * 0.3) * 1000) / 1000;
}

/** 跨源 + 源内指纹去重：按指纹保留最高分那条，同指纹合并来源热度。 */
export function dedupeAndRank(items: ScoredCandidate[], total: number): ScoredCandidate[] {
  const byFp = new Map<string, ScoredCandidate>();
  for (const item of items) {
    if (!item.title || !item.title.trim()) continue;
    const existing = byFp.get(item.fingerprint);
    if (!existing || item.score > existing.score) byFp.set(item.fingerprint, item);
  }
  return [...byFp.values()]
    .sort((a, b) => b.score - a.score || (b.heat ?? 0) - (a.heat ?? 0))
    .slice(0, Math.max(1, total));
}

/** 从 LLM JSON 文本里稳健解析标题数组（容忍 ```json 包裹与前后废话）。 */
export function parseRadarTitles(text: string, fallbackPrefix: string, count: number): { text: string; basis?: string }[] {
  const cleaned = String(text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.search(/[\[{]/);
  if (start < 0) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start)) as unknown;
    const arr = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).titles)
        ? ((parsed as Record<string, unknown>).titles as unknown[])
        : [];
    const out = arr.flatMap((x) => {
      if (typeof x === 'string') return [{ text: x.trim().slice(0, 120) }];
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        const t = typeof o.text === 'string' ? o.text.trim().slice(0, 120) : '';
        if (t) return [{ text: t, basis: typeof o.basis === 'string' ? o.basis.slice(0, 300) : undefined }];
      }
      return [];
    });
    return out.slice(0, count);
  } catch {
    return [];
  }
}

/** 无 LLM 时的兜底标题（模板拼装，保证第一版零 Key 也能出简报）。 */
export function fallbackTitles(title: string, niche: string | undefined, count: number): { text: string; basis: string }[] {
  const clean = title.replace(/[|｜].*$/, '').trim().slice(0, 60);
  const prefix = niche ? `${niche}：` : '';
  const templates = [
    `${prefix}${clean}，我拆给你看`,
    `为什么${clean}值得你今天就动手`,
    `从${clean}里，我总结的 3 个可复用动作`,
  ];
  return templates.slice(0, count).map((text) => ({ text, basis: '模板兜底（未配置 LLM 供应商）' }));
}
