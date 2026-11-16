import type { CollectorId, RadarCollector, RawCandidate } from '../radar.contract';
import { decodeEntities, fetchText, matchesAny } from './collector-support';

/**
 * 搜狗微信文章搜索（免费、无需 Key）。
 * 注意：搜狗有反爬，HTML 结构可能变化；本采集器做「尽力而为」降级——
 * 抓不到就返回空数组，由任务记录该源为 unavailable，绝不阻断整轮雷达。
 */
export class SogouWechatCollector implements RadarCollector {
  readonly id = 'sogou_wechat' as const;
  readonly label = '公众号爆文（搜狗微信）';

  async collect(keywords: string[], limit: number): Promise<RawCandidate[]> {
    const out: RawCandidate[] = [];
    const seen = new Set<string>();
    // 只取前 3 个关键词，避免请求过多触发风控；每词取前 limit/3 条。
    for (const kw of keywords.slice(0, 3)) {
      if (out.length >= limit) break;
      try {
        const url = `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(kw)}`;
        const html = await fetchText(url);
        // 结果列表：<h3><a href="/link?url=..." ...>标题</a></h3>
        const matches = [...html.matchAll(/<h3>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
        for (const m of matches) {
          if (out.length >= limit) break;
          const title = decodeEntities(m[2] ?? '');
          if (!title || seen.has(title) || !matchesAny(title, keywords)) continue;
          seen.add(title);
          const href = (m[1] ?? '').replace(/&amp;/g, '&');
          out.push({
            title,
            url: href.startsWith('http') ? href : `https://weixin.sogou.com${href}`,
            sourceName: this.id,
            sourceType: 'search',
          });
        }
      } catch {
        // 单关键词失败继续下一个；全部失败则本源返回空（如实记录）
      }
    }
    return out.slice(0, limit);
  }
}
