import { SOURCE_REGION, type CollectorId, type CustomSource, type MonitoredAccounts, type RadarCollector, type RadarRegion, type RawCandidate } from '../radar.contract';
import { collectCustomSources } from './custom-source.collector';
import { BilibiliCollector, HnrssCollector, ToutiaoCollector } from './hotlist.collector';
import { SogouWechatCollector } from './sogou-wechat.collector';
import { XAccountCollector, YoutubeAccountCollector } from './account.collector';

/** 采集器注册表：新增数据源在此追加一行即可（配置里同时加开关）。 */
export const COLLECTORS: Record<CollectorId, RadarCollector> = {
  toutiao: new ToutiaoCollector(),
  bilibili: new BilibiliCollector(),
  hnrss: new HnrssCollector(),
  sogou_wechat: new SogouWechatCollector(),
  x_account: new XAccountCollector(),
  youtube_account: new YoutubeAccountCollector(),
};

export const COLLECTOR_IDS = Object.keys(COLLECTORS) as CollectorId[];

export interface CollectOutcome {
  /** 内置源为 CollectorId，自定义源为 `custom:<id>`。 */
  source: string;
  items: RawCandidate[];
  error?: string;
}

/**
 * 执行全部启用的采集器，逐源捕获错误并降级为 error 字段（单源失败不阻断整轮）。
 * keywordsByRegion：按内容地区分发的关键词表。国内源只拿国内/通用赛道词，
 * 海外源只拿海外/通用赛道词，避免中文词去筛 HN 英文标题、英文词去筛头条中文热榜。
 */
export async function collectAll(
  enabled: Partial<Record<CollectorId, boolean>>,
  keywordsByRegion: Record<RadarRegion, string[]>,
  perSourceLimit: number,
  accounts: MonitoredAccounts = { x: [], youtube: [] },
  customSources: CustomSource[] = [],
): Promise<CollectOutcome[]> {
  const results: CollectOutcome[] = [];
  for (const id of COLLECTOR_IDS) {
    if (enabled[id] === false) continue;
    try {
      const items = await COLLECTORS[id].collect(keywordsByRegion[SOURCE_REGION[id]] ?? [], perSourceLimit, accounts);
      const noAccounts = (id === 'x_account' && !accounts.x.length) || (id === 'youtube_account' && !accounts.youtube.length);
      results.push({
        source: id,
        items,
        ...(noAccounts
          ? { error: 'no_accounts_configured' }
          : items.length
            ? {}
            : { error: 'no_items_or_blocked' }),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message.split('\n')[0] : String(error);
      results.push({ source: id, items: [], error: msg.slice(0, 200) });
    }
  }
  // 自定义源与内置源走同一条「去重 → 打分 → 出标题 → 落库」链路，单源失败同样只记 error。
  if (customSources.length) {
    try {
      for (const outcome of await collectCustomSources(customSources, perSourceLimit)) {
        results.push(outcome);
      }
    } catch (error: unknown) {
      // 理论上 collectCustomSources 内部已逐源兜底，这里再兜一层避免整轮失败。
      results.push({
        source: 'custom',
        items: [],
        error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
      });
    }
  }
  return results;
}
