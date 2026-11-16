import type { CollectorId, RadarCollector, RawCandidate } from '../radar.contract';
import { decodeEntities, fetchText } from './collector-support';

/**
 * 账号盯号采集器（T6.3，零 Key）。
 *
 * X：官方 API 已取消免费层，Nitter/xcancel 官方实例于 2026-08 关停；
 *    本实现走「仍存活的社区 Nitter 实例 RSS」多实例 failover，末尾用 Jina Reader 兜底。
 *    实测 2026-11-16：nitter.mie.foundation / nitter.mizuki.st 各返回 20 条，pubDate 为当日新推文。
 *    社区实例随时可能失效 → 实例列表集中配置、任一可用即成功、全部失败返回空（不阻断整轮）。
 *
 * YouTube：官方 feeds/videos.xml?channel_id= 为免费公开端点，无需 Key；
 *    实测 2026-11-16 本机该端点返回 404，但频道页 /@handle/videos 返回 200 且内含
 *    richItemRenderer 结构（videoId + 标题）。故三路降级：官方 feed → 频道页 HTML 直采 → Jina Reader。
 *    频道页直采为零 Key 主路径，真机网络若官方 feed 可用则优先（带精确发布时间）。
 *
 * 账号条目不做关键词硬过滤（用户是主动指定盯这些号），但保留 matchesAny 供调用方选择；
 * 这里返回全部，由 RadarService 的赛道打分统一排序——盯号内容相关度可能低，仍会入池。
 */

/** 存活 Nitter 实例（按优先级；失效的官方实例已剔除）。集中一处便于随时替换。 */
const NITTER_INSTANCES = [
  'https://nitter.mie.foundation',
  'https://nitter.mizuki.st',
  'https://nitter.tiekoetter.com',
  'https://nitter.meowing.monster',
  'https://nitter.pp.ua',
];

/** 用户名清洗：允许 @handle、x.com/handle、纯 handle，去掉空串与非法字符。 */
export function cleanHandle(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .slice(0, 30);
}

/** 频道标识清洗：支持完整 channel_id(UC...) 或 @handle；只保留安全字符。 */
export function cleanChannel(raw: string): string {
  const s = String(raw ?? '').trim().replace(/^https?:\/\/(?:www\.)?youtube\.com\//i, '');
  if (s.startsWith('UC')) return s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  return '@' + s.replace(/^@/, '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40);
}

/** Nitter 镜像链接 → X 原帖链接（用户点开直达原平台；解析不出则原样保留）。 */
export function toOriginalXUrl(nitterUrl: string): string {
  const m = nitterUrl.match(/\/([A-Za-z0-9_]+)\/status\/(\d{15,25})/);
  return m ? `https://x.com/${m[1]}/status/${m[2]}` : nitterUrl;
}

/** 解析 RSS <item>：Nitter 推文条目。X 来源的链接归一到 x.com 原帖。 */
export function parseRssItems(xml: string, source: CollectorId, limit: number): RawCandidate[] {
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
  return blocks.flatMap((m) => {
    const block = m[1] ?? '';
    const title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    let url = decodeEntities(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
    if (url && source === 'x_account') url = toOriginalXUrl(url);
    const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '';
    const pubDate = pub ? new Date(pub).toISOString() : undefined;
    const content = decodeEntities(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '');
    const text = title || content.slice(0, 140);
    return text ? [{ title: text.slice(0, 2000), url: url || undefined, sourceName: source, sourceType: 'rss' as const, ...(pubDate ? { publishedAt: pubDate } : {}) }] : [];
  });
}

/** 解析 YouTube 频道页 HTML（richItemRenderer 块）：抽 videoId + 标题，零 Key 直采。 */
export function parseYoutubeChannelHtml(html: string, channel: string, limit: number): RawCandidate[] {
  const blocks = html.split('"richItemRenderer":').slice(1);
  const seen = new Set<string>();
  const out: RawCandidate[] = [];
  for (const block of blocks) {
    const id = block.match(/"videoId":"([\w-]{11})"/)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const rawTitle =
      block.match(/"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"/)?.[1] ??
      block.match(/"title":\{"content":"((?:[^"\\]|\\.){2,200})"/)?.[1] ??
      '';
    const title = rawTitle ? decodeEntities(rawTitle) : `YouTube ${channel} 视频 ${id}`;
    out.push({
      title: title.slice(0, 2000),
      url: `https://www.youtube.com/watch?v=${id}`,
      sourceName: 'youtube_account' as const,
      sourceType: 'rss' as const,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** 解析 Jina Reader 的 Markdown：抽取 x.com/<user>/status/<id> 链接作为候选。 */
export function parseJinaTweets(markdown: string, handle: string, limit: number): RawCandidate[] {
  const ids = [...new Set([...markdown.matchAll(/x\.com\/[\w]+\/status\/(\d{15,25})/g)].map((m) => m[1]!))].slice(0, limit);
  return ids.map((id) => ({
    title: `X @${handle} 推文 ${id}`,
    url: `https://x.com/${handle}/status/${id}`,
    sourceName: 'x_account' as const,
    sourceType: 'rss' as const,
  }));
}

/** X 账号采集：多实例 failover，任一实例拿到条目即返回；否则 Jina 兜底。 */
async function collectXAccounts(handles: string[], limit: number): Promise<RawCandidate[]> {
  const out: RawCandidate[] = [];
  for (const raw of handles) {
    const handle = cleanHandle(raw);
    if (!handle) continue;
    let got = false;
    for (const base of NITTER_INSTANCES) {
      try {
        const xml = await fetchText(`${base}/${encodeURIComponent(handle)}/rss`);
        const items = parseRssItems(xml, 'x_account', limit);
        if (items.length) {
          out.push(...items);
          got = true;
          break;
        }
      } catch {
        // 该实例不可用，换下一个
      }
    }
    if (!got) {
      try {
        const md = await fetchText(`https://r.jina.ai/https://x.com/${encodeURIComponent(handle)}`);
        out.push(...parseJinaTweets(md, handle, limit));
      } catch {
        // 兜底也失败：该账号本轮无条目，不阻断其它账号
      }
    }
  }
  return out;
}

/** YouTube 频道采集：官方 feed → 频道页 HTML 直采（零 Key 主路径）→ Jina 兜底。 */
async function collectYoutubeChannels(channels: string[], limit: number): Promise<RawCandidate[]> {
  const out: RawCandidate[] = [];
  for (const raw of channels) {
    const ch = cleanChannel(raw);
    if (!ch) continue;
    const feedUrl = ch.startsWith('UC')
      ? `https://www.youtube.com/feeds/videos.xml?channel_id=${ch}`
      : `https://www.youtube.com/${ch}/videos`;
    const pageUrl = ch.startsWith('UC')
      ? `https://www.youtube.com/channel/${ch}/videos`
      : `https://www.youtube.com/${ch}/videos`;
    let got = false;
    // ① 官方 feed（带精确发布时间；本机 404 时降级）
    try {
      const xml = await fetchText(feedUrl);
      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, limit);
      const items = entries.flatMap((m) => {
        const block = m[1] ?? '';
        const title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
        const videoId = block.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/)?.[1] ?? '';
        const pub = block.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? '';
        const publishedAt = pub ? new Date(pub).toISOString() : undefined;
        return title
          ? [{ title: title.slice(0, 2000), url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined, sourceName: 'youtube_account' as const, sourceType: 'rss' as const, ...(publishedAt ? { publishedAt } : {}) }]
          : [];
      });
      if (items.length) {
        out.push(...items);
        got = true;
      }
    } catch {
      // 官方 feed 失败（本机 404），走频道页直采
    }
    // ② 频道页 HTML 直采（实测本机可通、零 Key、带真实标题）
    if (!got) {
      try {
        const html = await fetchText(pageUrl);
        const items = parseYoutubeChannelHtml(html, ch, limit);
        if (items.length) {
          out.push(...items);
          got = true;
        }
      } catch {
        // 频道页不可达，走 Jina 兜底
      }
    }
    // ③ Jina Reader 兜底
    if (!got) {
      try {
        const md = await fetchText(`https://r.jina.ai/https://www.youtube.com/${ch}/videos`);
        const ids = [...new Set([...md.matchAll(/youtube\.com\/watch\?v=([\w-]{11})/g)].map((m) => m[1]!))].slice(0, limit);
        out.push(...ids.map((id) => ({ title: `YouTube ${ch} 视频 ${id}`, url: `https://www.youtube.com/watch?v=${id}`, sourceName: 'youtube_account' as const, sourceType: 'rss' as const })));
      } catch {
        // 兜底失败：该频道本轮无条目，不阻断其它频道
      }
    }
  }
  return out;
}

export class XAccountCollector implements RadarCollector {
  readonly id = 'x_account' as const;
  readonly label = 'X 监控账号';

  async collect(_keywords: string[], limit: number, accounts?: { x: string[]; youtube: string[] }): Promise<RawCandidate[]> {
    const handles = accounts?.x ?? [];
    if (!handles.length) return [];
    return (await collectXAccounts(handles, limit)).slice(0, limit);
  }
}

export class YoutubeAccountCollector implements RadarCollector {
  readonly id = 'youtube_account' as const;
  readonly label = 'YouTube 监控频道';

  async collect(_keywords: string[], limit: number, accounts?: { x: string[]; youtube: string[] }): Promise<RawCandidate[]> {
    const channels = accounts?.youtube ?? [];
    if (!channels.length) return [];
    return (await collectYoutubeChannels(channels, limit)).slice(0, limit);
  }
}
