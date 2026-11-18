/**
 * 选题雷达类型契约（T6.1）。
 * 采集器只负责「取回原始候选」，去重/打分/出标题/落库统一由 RadarService 处理，
 * 保证数据源可插拔、且不绑定任何单一平台。
 */

/** 采集器标识（与 RadarItem.sourceName 一致）。 */
export type CollectorId = 'toutiao' | 'bilibili' | 'hnrss' | 'sogou_wechat' | 'x_account' | 'youtube_account';

/** 内容地区：domestic 国内 / overseas 海外。按数据源自动归类，供简报分栏。 */
export type RadarRegion = 'domestic' | 'overseas';

/**
 * 内置数据源 → 地区映射（单一事实源）。
 * 国内：头条 / B站 / 公众号搜狗；海外：Hacker News / X / YouTube。
 * 自定义源由用户在配置里指定 region（默认 domestic）。
 */
export const SOURCE_REGION: Record<CollectorId, RadarRegion> = {
  toutiao: 'domestic',
  bilibili: 'domestic',
  sogou_wechat: 'domestic',
  hnrss: 'overseas',
  x_account: 'overseas',
  youtube_account: 'overseas',
};

/** 从 sourceName 推导地区：`custom:<id>` 以外的内置源查映射表，未知一律按国内。 */
export function regionOfSource(sourceName: string, customRegion?: RadarRegion): RadarRegion {
  if (sourceName.startsWith('custom:')) return customRegion === 'overseas' ? 'overseas' : 'domestic';
  return SOURCE_REGION[sourceName as CollectorId] ?? 'domestic';
}

/** 采集器返回的原始候选条目。 */
export interface RawCandidate {
  title: string;
  url?: string;
  heat?: number;
  /** ISO 时间串；RSS/盯号源有精确时间，热榜类通常为空（时效过滤时按「时间未知」保留）。 */
  publishedAt?: string;
  /** 内置源用 CollectorId；自定义源用 `custom:<id>`，便于在简报里区分来源。 */
  sourceName: string;
  sourceType: 'hotlist' | 'rss' | 'search' | 'custom';
}

/** 采集结果（含失败降级信息，绝不因单源失败阻断整轮）。 */
export interface CollectResult {
  source: string;
  items: RawCandidate[];
  error?: string;
}

/** 用户自行添加的数据源：RSS/Atom 或返回数组的 JSON 接口，均需 http(s) 地址。 */
export interface CustomSource {
  id: string;
  name: string;
  url: string;
  format: 'rss' | 'json';
  enabled: boolean;
  /** 额外相关度关键词；命中后与赛道词库一起参与打分。 */
  keywords: string[];
  /** 内容地区：domestic 国内 / overseas 海外，供简报分栏；默认 domestic。 */
  region: RadarRegion;
}

/**
 * 时效窗口（天）：0=不限；1=当天；3=三天；7=一周；15=半月。
 * 采集时按来源发布时间过滤；无发布时间的条目（热榜类）始终保留并标注「时间未知」。
 */
export const FRESHNESS_OPTIONS = [
  { days: 0, label: '不限时间' },
  { days: 1, label: '当天' },
  { days: 3, label: '三天内' },
  { days: 7, label: '一周内' },
  { days: 15, label: '半个月内' },
] as const;
export type FreshnessDays = (typeof FRESHNESS_OPTIONS)[number]['days'];

/** 监控账号清单（可选第三参数，仅账号类采集器使用）。 */
export interface MonitoredAccounts {
  x: string[];
  youtube: string[];
}

/** 采集器接口：新增数据源只需实现本接口并注册到 COLLECTORS。 */
export interface RadarCollector {
  readonly id: CollectorId;
  readonly label: string;
  /** accounts 可选：热榜类忽略，账号类据此抓取指定账号。 */
  collect(keywords: string[], limit: number, accounts?: MonitoredAccounts): Promise<RawCandidate[]>;
}

/** 雷达配置（存 SiteConfig.radarConfig JSON，单例）。 */
export interface RadarNiche {
  name: string;
  enabled: boolean;
  keywords: string[];
}

export interface RadarConfig {
  niches: RadarNiche[];
  sources: Partial<Record<CollectorId, boolean>>;
  output: {
    totalItems: number;
    featuredItems: number;
    titlesPerItem: number;
    saveToLibrary: boolean;
  };
  schedule: {
    enabled: boolean;
    time: string; // HH:mm，Asia/Shanghai
    timezone: string;
  };
  monitoredAccounts: { x: string[]; youtube: string[] }; // 预留位：T6.3 接入
  /** 盯号内容跨轮增量去重的回溯窗口（天）：0=关闭（每次全量），默认 7，最大 90。 */
  accountDedupeDays: number;
  /** 时效窗口（天）：0/1/3/7/15；采集时按发布时间过滤，无时间的条目保留。默认 0（不限）。 */
  freshnessDays: FreshnessDays;
  /** 自定义数据源：站点管理员在「雷达配置」里维护，采集时并入内置源一起去重打分。 */
  customSources: CustomSource[];
}

/** 默认配置：与分享方案对齐，零 Key 可跑。 */
export const DEFAULT_RADAR_CONFIG: RadarConfig = {
  niches: [
    { name: '副业与网赚', enabled: true, keywords: ['副业', '网赚', '变现', '被动收入', '项目拆解', '私域', '引流'] },
    { name: 'AI与效率工具', enabled: true, keywords: ['AI', 'AI工具', 'ChatGPT', '智能体', 'Agent', '自动化', 'AIGC', '提示词'] },
  ],
  sources: { toutiao: true, bilibili: true, hnrss: true, sogou_wechat: true, x_account: true, youtube_account: true },
  output: { totalItems: 20, featuredItems: 5, titlesPerItem: 3, saveToLibrary: true },
  schedule: { enabled: false, time: '08:00', timezone: 'Asia/Shanghai' },
  monitoredAccounts: { x: [], youtube: [] }, // 零 Key：X 走 Nitter RSS failover，YouTube 走频道页直采/Jina 兜底
  accountDedupeDays: 7, // 盯号内容 7 天内只推一次，避免每日简报重复刷同一条
  freshnessDays: 0, // 默认不限时间，保持既有行为；用户可在配置页选 1/3/7/15 天
  customSources: [], // 内置零 Key 源之外，管理员可按需接入自有 RSS / JSON 源
};

/** 候选条目打分后的中间产物。 */
export interface ScoredCandidate extends RawCandidate {
  fingerprint: string;
  region: RadarRegion;
  niche?: string;
  relevance: number;
  score: number;
}

/** 生成标题的结构（落 RadarItem.titles JSON）。 */
export interface RadarTitle {
  text: string;
  basis?: string;
  score?: number;
}
