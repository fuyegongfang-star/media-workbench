import {
  WECHAT_API_BASE,
  parseAddDraftResponse,
  parseFreepublishGet,
  parseFreepublishSubmit,
  parseMassSendResponse,
  parseWechatError,
  type WechatArticle,
} from './wechat-publish.util';

export interface WeChatProviderOptions {
  baseUrl?: string;
  /** 注入自定义 fetch（测试用），默认全局 fetch。 */
  fetchImpl?: typeof fetch;
  /** token 缓存有效期内的提前刷新阈值（毫秒），默认 5 分钟。 */
  tokenRefreshSkewMs?: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * 微信公众号发布 Provider（T3.9）。
 * 真实 HTTP 调用（Node22 内置 fetch），全部走参数化 URL（access_token 作为 query，不进日志）。
 * 密钥（AppSecret）仅在换取 access_token 时使用，绝不写日志、绝不返回明文。
 * token 内存缓存（按 appId+appSecret 维度，临近过期自动刷新）；fetch 可注入便于单测（mock）。
 */
export class WeChatPublishProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly tokenSkewMs: number;
  private readonly tokenCache = new Map<string, CachedToken>();

  constructor(opts: WeChatProviderOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? WECHAT_API_BASE).replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.tokenSkewMs = opts.tokenRefreshSkewMs ?? 5 * 60 * 1000;
  }

  /** 换取 access_token（client_credential）。缓存命中且未临近过期直接复用。 */
  async getAccessToken(appId: string, appSecret: string): Promise<string> {
    const key = `${appId}::${appSecret.length}`;
    const cached = this.tokenCache.get(key);
    if (cached && cached.expiresAt - this.tokenSkewMs > Date.now()) {
      return cached.token;
    }
    const url =
      `${this.baseUrl}/cgi-bin/token?grant_type=client_credential` +
      `&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
    const res = await this.fetchImpl(url, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`微信 token 接口 HTTP ${res.status}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    const err = parseWechatError(json);
    if (err) throw new Error(err);
    const token = json.access_token;
    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 7200;
    if (typeof token !== 'string' || !token) {
      throw new Error('微信 token 接口未返回 access_token');
    }
    this.tokenCache.set(key, {
      token,
      expiresAt: Date.now() + Math.max(1, expiresIn - 1) * 1000,
    });
    return token;
  }

  /** 草稿箱同步：cgi-bin/draft/add → 返回 media_id。 */
  async addDraft(accessToken: string, articles: WechatArticle[]): Promise<{ mediaId: string }> {
    const url = `${this.baseUrl}/cgi-bin/draft/add?access_token=${encodeURIComponent(accessToken)}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles }),
    });
    if (!res.ok) throw new Error(`微信草稿箱接口 HTTP ${res.status}`);
    const json = await res.json();
    return parseAddDraftResponse(json);
  }

  /** 发布到公众号会话：freepublish/submit（需先 draft/add 拿到 media_id）。 */
  async freepublishSubmit(accessToken: string, mediaId: string): Promise<{ publishId: string }> {
    const url = `${this.baseUrl}/cgi-bin/freepublish/submit?access_token=${encodeURIComponent(accessToken)}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_id: mediaId }),
    });
    if (!res.ok) throw new Error(`微信发布提交接口 HTTP ${res.status}`);
    return parseFreepublishSubmit(await res.json());
  }

  /** 查询发布状态：freepublish/get（轮询 publish_id 拿 article_url）。 */
  async freepublishGet(accessToken: string, publishId: string) {
    const url = `${this.baseUrl}/cgi-bin/freepublish/get?access_token=${encodeURIComponent(accessToken)}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish_id: publishId }),
    });
    if (!res.ok) throw new Error(`微信发布状态接口 HTTP ${res.status}`);
    return parseFreepublishGet(await res.json());
  }

  /**
   * 群发（mass/sendall）：向全部粉丝推送图文。
   * mpnews.media_id 使用 draft/add 得到的 media_id（微信群发图文即取该 id）。
   * 传 scheduleTime 即为「定时群发」（格式 yyyy-MM-dd HH:mm:ss）。
   */
  async massSendAll(
    accessToken: string,
    mediaId: string,
    opts: { scheduleTime?: string } = {},
  ): Promise<{ msgId: string }> {
    const url = `${this.baseUrl}/cgi-bin/message/mass/sendall?access_token=${encodeURIComponent(accessToken)}`;
    const body: Record<string, unknown> = {
      filter: { is_to_all: true },
      mpnews: { media_id: mediaId },
      msgtype: 'mpnews',
      send_ignore_time: 0,
    };
    if (opts.scheduleTime) body.schedule_time = opts.scheduleTime;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`微信群发接口 HTTP ${res.status}`);
    return parseMassSendResponse(await res.json());
  }

  /** 微信公众号数据统计通用 POST（datacube 系列，begin/end 为 YYYY-MM-DD）。 */
  private async postDatacube(
    path: string,
    accessToken: string,
    beginDate: string,
    endDate: string,
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path}?access_token=${encodeURIComponent(accessToken)}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ begin_date: beginDate, end_date: endDate }),
    });
    if (!res.ok) throw new Error(`微信统计数据接口 ${path} HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    const err = parseWechatError(json);
    if (err) throw new Error(err);
    return json;
  }

  /** 图文群发总数据（datacube/getuserread）。返回原始响应，由 service 用 parseWechatUserRead 解析。 */
  async getUserRead(accessToken: string, beginDate: string, endDate: string): Promise<Record<string, unknown>> {
    return this.postDatacube('/cgi-bin/datacube/getuserread', accessToken, beginDate, endDate);
  }

  /** 图文统计分时数据（datacube/getarticleread，按 msgid 拆分）。 */
  async getArticleRead(accessToken: string, beginDate: string, endDate: string): Promise<Record<string, unknown>> {
    return this.postDatacube('/cgi-bin/datacube/getarticleread', accessToken, beginDate, endDate);
  }

  /** 用户增减数据（datacube/getusersummary，涨粉/取关）。 */
  async getUserSummary(accessToken: string, beginDate: string, endDate: string): Promise<Record<string, unknown>> {
    return this.postDatacube('/cgi-bin/datacube/getusersummary', accessToken, beginDate, endDate);
  }
}
