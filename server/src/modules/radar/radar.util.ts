import { createHash } from 'node:crypto';
import {
  FRESHNESS_OPTIONS,
  type CustomSource,
  type FreshnessDays,
  type NicheRegion,
  type RadarConfig,
  type RadarNiche,
  type RadarRegion,
  type ScoredCandidate,
} from './radar.contract';

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

/** 自定义数据源清洗：仅允许 http(s) URL、限制数量与字段长度，自动生成稳定 id 防重复。 */
export function sanitizeCustomSources(input: unknown, max = 20): CustomSource[] {
  if (!Array.isArray(input)) return [];
  const strArray = (v: unknown, limit: number): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .slice(0, limit)
          .map((x) => x.trim().slice(0, 80))
      : [];
  const seen = new Set<string>();
  const out: CustomSource[] = [];
  for (const raw of input.slice(0, max)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url.trim().slice(0, 500) : '';
    if (!/^https?:\/\/\S+$/i.test(url)) continue; // 拒绝 javascript:/data:/站内相对路径
    const name = (typeof o.name === 'string' ? o.name.trim() : '').slice(0, 60) || url;
    const idRaw = typeof o.id === 'string' ? o.id.trim() : '';
    const id = /^[a-zA-Z0-9_-]{1,40}$/.test(idRaw)
      ? idRaw
      : `src_${createHash('sha256').update(url).digest('hex').slice(0, 10)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      url,
      format: o.format === 'json' ? 'json' : 'rss',
      enabled: o.enabled !== false,
      keywords: strArray(o.keywords, 20),
      region: (o.region === 'overseas' ? 'overseas' : 'domestic') as RadarRegion,
    });
  }
  return out;
}

/**
 * 赛道地区归一化：只接受 domestic / overseas / both，其余（含存量配置缺失该字段）一律 both。
 * both 保证老配置升级后关键词仍同时服务国内外源，行为不变。
 */
export function normalizeNicheRegion(input: unknown): NicheRegion {
  return input === 'domestic' || input === 'overseas' ? input : 'both';
}

/**
 * 取适用于某个内容地区的赛道（已启用 + 地区匹配/通用）。
 * 用于打分归属：国内条目只在国内/通用赛道里找，避免海外赛道串进来。
 */
export function nichesForRegion(niches: RadarNiche[], region: RadarRegion): RadarNiche[] {
  return niches.filter((n) => n.enabled && (n.region === 'both' || n.region === region));
}

/**
 * 汇总适用于某个内容地区的关键词（保序去重、去空）。
 * 用于采集预筛：国内源只拿中文词，海外源只拿英文词，互不污染。
 */
export function keywordsForRegion(niches: RadarNiche[], region: RadarRegion): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of nichesForRegion(niches, region)) {
    for (const k of n.keywords) {
      const kw = String(k ?? '').trim();
      if (!kw) continue;
      const key = kw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(kw);
    }
  }
  return out;
}

/** 一次性构造两个地区的关键词表，供 collectAll 按源分发。 */
export function keywordsByRegion(niches: RadarNiche[]): Record<RadarRegion, string[]> {
  return {
    domestic: keywordsForRegion(niches, 'domestic'),
    overseas: keywordsForRegion(niches, 'overseas'),
  };
}

/** 配置清洗：限制数组长度、过滤空串、条数夹在合理区间，防异常输入撑爆采集。 */
export function sanitizeConfig(input: unknown): RadarConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const fallback = {
    niches: [
      { name: '副业与网赚', enabled: true, region: 'domestic', keywords: ['副业', '网赚', '变现', '被动收入', '项目拆解', '私域', '引流'] },
      { name: 'AI与效率工具', enabled: true, region: 'domestic', keywords: ['AI', 'AI工具', 'ChatGPT', '智能体', '自动化', 'AIGC', '提示词'] },
      { name: 'Indie Hacker / 独立开发', enabled: true, region: 'overseas', keywords: ['indie hacker', 'side project', 'SaaS', 'bootstrapped', 'MRR', 'build in public', 'solopreneur'] },
      { name: 'AI & Dev Tools', enabled: true, region: 'overseas', keywords: ['AI', 'LLM', 'open source', 'developer tools', 'agent', 'coding', 'startup'] },
      { name: '重大产品发布（通用）', enabled: false, region: 'both', keywords: ['launch', '发布', 'release', '上线'] },
    ],
    sources: { toutiao: true, bilibili: true, hnrss: true, sogou_wechat: true, x_account: true, youtube_account: true },
    output: { totalItems: 20, featuredItems: 5, titlesPerItem: 3, saveToLibrary: true },
    schedule: { enabled: false, time: '08:00', timezone: 'Asia/Shanghai' },
    monitoredAccounts: { x: [], youtube: [] },
    accountDedupeDays: 7,
    freshnessDays: 0,
    customSources: [],
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
        return [{
          name,
          enabled: o.enabled !== false,
          region: normalizeNicheRegion(o.region),
          keywords: strArray(o.keywords, 40),
        }];
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

  // 去重窗口：0=关闭，1-90 天；仅明确的数字/非空数字串才解析，null/''/缺失一律回落默认 7
  const dedupeVal = raw.accountDedupeDays;
  const dedupeRaw = typeof dedupeVal === 'number' || (typeof dedupeVal === 'string' && dedupeVal.trim() !== '')
    ? Number(dedupeVal)
    : NaN;
  const accountDedupeDays = Number.isFinite(dedupeRaw)
    ? Math.max(0, Math.min(90, Math.floor(dedupeRaw)))
    : 7;

  // 时效窗口：仅接受预设档位 0/1/3/7/15，其它值回落 0（不限），防止异常输入。
  const allowedFreshness = FRESHNESS_OPTIONS.map((o) => o.days) as readonly number[];
  const freshnessRaw = Number(raw.freshnessDays);
  const freshnessDays = (allowedFreshness.includes(freshnessRaw) ? freshnessRaw : 0) as FreshnessDays;

  return {
    niches: niches.length ? niches : fallback.niches,
    sources,
    output,
    schedule,
    monitoredAccounts,
    accountDedupeDays,
    freshnessDays,
    customSources: sanitizeCustomSources(raw.customSources),
  };
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

/**
 * 时效过滤：按来源发布时间窗口裁剪候选。
 * - days<=0：不限，原样返回；
 * - 有 publishedAt 且可解析：只保留 [now - days, now + 1天容差] 内的条目（未来时间容错 1 天）；
 * - 无 publishedAt 或解析失败：视为「时间未知」，一律保留（热榜类没有精确时间，硬过滤会导致国内源全空）。
 * 返回 { kept, droppedByTime } 便于 sourceStats 记录过滤效果。
 */
export function filterByFreshness<T extends { publishedAt?: string }>(
  items: T[],
  days: number,
  now: Date = new Date(),
): { kept: T[]; droppedByTime: number } {
  if (!Number.isFinite(days) || days <= 0) return { kept: items, droppedByTime: 0 };
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const futureTolerance = now.getTime() + 24 * 60 * 60 * 1000;
  const kept: T[] = [];
  let droppedByTime = 0;
  for (const it of items) {
    const ms = it.publishedAt ? Date.parse(it.publishedAt) : NaN;
    if (!Number.isFinite(ms)) {
      kept.push(it); // 时间未知：保留
      continue;
    }
    if (ms >= cutoff && ms <= futureTolerance) kept.push(it);
    else droppedByTime += 1;
  }
  return { kept, droppedByTime };
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
