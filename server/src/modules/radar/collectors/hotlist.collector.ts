import type { CollectorId, RadarCollector, RawCandidate } from '../radar.contract';
import { decodeEntities, fetchText, matchesAny } from './collector-support';

/**
 * 免费热榜采集器：头条 / B站 / Hacker News RSS。
 * 三者均实测可达（2026-11-16：头条 200/50 条、B站 200/100 条、HN RSS 200/20 条）。
 * 单源异常由 collectAll 捕获降级，不抛给任务链。
 */
abstract class BaseHotCollector implements RadarCollector {
  abstract readonly id: CollectorId;
  abstract readonly label: string;
  abstract fetchRaw(keywords: string[], limit: number): Promise<RawCandidate[]>;

  async collect(keywords: string[], limit: number): Promise<RawCandidate[]> {
    try {
      const items = await this.fetchRaw(keywords, limit);
      return items.filter((i) => i.title && matchesAny(i.title, keywords)).slice(0, limit);
    } catch {
      return []; // 降级：单源失败返回空，由 RadarService 记录 sourceStats.error
    }
  }
}

export class ToutiaoCollector extends BaseHotCollector {
  readonly id = 'toutiao' as const;
  readonly label = '今日头条热榜';

  async fetchRaw(_keywords: string[], limit: number): Promise<RawCandidate[]> {
    const text = await fetchText('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc');
    const json = JSON.parse(text) as { data?: Array<{ Title?: string; Url?: string; HotValue?: number }> };
    return (json.data ?? []).slice(0, limit).map((x) => ({
      title: decodeEntities(x.Title ?? ''),
      url: x.Url,
      heat: Number(x.HotValue) || 0,
      sourceName: this.id,
      sourceType: 'hotlist' as const,
    }));
  }
}

export class BilibiliCollector extends BaseHotCollector {
  readonly id = 'bilibili' as const;
  readonly label = 'B站排行榜';

  async fetchRaw(_keywords: string[], limit: number): Promise<RawCandidate[]> {
    const text = await fetchText('https://api.bilibili.com/x/web-interface/ranking/v2');
    const json = JSON.parse(text) as {
      data?: { list?: Array<{ title?: string; bvid?: string; stat?: { view?: number } }> };
    };
    return (json.data?.list ?? []).slice(0, limit).map((x) => ({
      title: decodeEntities(x.title ?? ''),
      url: x.bvid ? `https://www.bilibili.com/video/${x.bvid}` : undefined,
      heat: Number(x.stat?.view) || 0,
      sourceName: this.id,
      sourceType: 'hotlist' as const,
    }));
  }
}

export class HnrssCollector extends BaseHotCollector {
  readonly id = 'hnrss' as const;
  readonly label = 'Hacker News RSS';

  async fetchRaw(_keywords: string[], limit: number): Promise<RawCandidate[]> {
    const xml = await fetchText('https://hnrss.org/frontpage');
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
    return items.flatMap((m) => {
      const block = m[1] ?? '';
      const title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
      const url = decodeEntities(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
      const pts = Number(decodeEntities(block.match(/<score>([\s\S]*?)<\/score>/)?.[1] ?? '')) || 0;
      return title ? [{ title, url: url || undefined, heat: pts, sourceName: this.id, sourceType: 'rss' as const }] : [];
    });
  }
}
