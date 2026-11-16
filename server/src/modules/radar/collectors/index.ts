import type { CollectorId, RadarCollector, RawCandidate } from '../radar.contract';
import { BilibiliCollector, HnrssCollector, ToutiaoCollector } from './hotlist.collector';
import { SogouWechatCollector } from './sogou-wechat.collector';

/** 采集器注册表：新增数据源在此追加一行即可（配置里同时加开关）。 */
export const COLLECTORS: Record<CollectorId, RadarCollector> = {
  toutiao: new ToutiaoCollector(),
  bilibili: new BilibiliCollector(),
  hnrss: new HnrssCollector(),
  sogou_wechat: new SogouWechatCollector(),
};

export const COLLECTOR_IDS = Object.keys(COLLECTORS) as CollectorId[];

export interface CollectOutcome {
  source: CollectorId;
  items: RawCandidate[];
  error?: string;
}

/** 执行全部启用的采集器，逐源捕获错误并降级为 error 字段（单源失败不阻断整轮）。 */
export async function collectAll(
  enabled: Partial<Record<CollectorId, boolean>>,
  keywords: string[],
  perSourceLimit: number,
): Promise<CollectOutcome[]> {
  const results: CollectOutcome[] = [];
  for (const id of COLLECTOR_IDS) {
    if (enabled[id] === false) continue;
    try {
      const items = await COLLECTORS[id].collect(keywords, perSourceLimit);
      results.push({ source: id, items, ...(items.length ? {} : { error: 'no_items_or_blocked' }) });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message.split('\n')[0] : String(error);
      results.push({ source: id, items: [], error: msg.slice(0, 200) });
    }
  }
  return results;
}
