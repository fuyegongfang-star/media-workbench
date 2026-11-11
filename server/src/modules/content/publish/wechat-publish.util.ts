/**
 * T3.9 公众号发布执行 —— 纯函数层（不依赖 DB / 网络 / 密钥，可单测）。
 *
 * 职责：
 * - 把 Markdown 正文转成微信公众号可接受的 HTML（基础标签 + 文本转义，防 XSS）。
 * - 组装草稿箱 / 发布 / 群发所需的请求体。
 * - 解析微信各接口响应，统一错误（errcode/errmsg）为清晰信息。
 *
 * 所有网络调用由 wechat.provider.ts 负责；本文件只做确定性转换与解析。
 */

export const WECHAT_API_BASE = 'https://api.weixin.qq.com';

/** HTML 转义：防注入（正文进入微信图文 HTML，必须转义文本节点）。 */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** URL 安全校验：仅允许 http(s) 与相对路径，阻断 javascript:/data: 等注入。 */
export function safeUrl(url: string): string {
  const u = String(url || '').trim();
  if (/^(https?:\/\/|mailto:|\/)/i.test(u)) return u;
  return '#';
}

export interface WechatArticle {
  title: string;
  author?: string;
  digest?: string;
  content: string; // 已是 HTML
  thumb_media_id?: string;
  need_open_comment?: 0 | 1;
  only_fans_can_comment?: 0 | 1;
}

export interface BuildArticleInput {
  title: string;
  author?: string;
  contentMd: string;
  digest?: string;
  thumbMediaId?: string;
}

/** 组装一篇微信草稿图文（content 为 Markdown 转 HTML 后的结果）。 */
export function buildWechatArticle(input: BuildArticleInput): WechatArticle {
  const title = (input.title || '').toString().trim() || '未命名文章';
  return {
    title,
    author: input.author ? input.author.toString().slice(0, 8) : undefined,
    digest: input.digest ? input.digest.toString().slice(0, 120) : undefined,
    content: markdownToWechatHtml(input.contentMd || ''),
    thumb_media_id: input.thumbMediaId || undefined,
  };
}

/**
 * 极简 Markdown → 微信 HTML 转换器（自包含、无第三方依赖）。
 * 支持：标题、粗体/斜体、行内/块级代码、链接、图片、有序/无序列表、引用、分隔线、段落。
 * 文本节点统一转义，URL 经 safeUrl 校验。
 */
export function markdownToWechatHtml(md: string): string {
  const src = String(md || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;
  let inCode = false;
  let codeBuf: string[] = [];

  const inline = (text: string): string => {
    let t = escapeHtml(text);
    // 行内代码
    t = t.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
    // 粗体
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // 斜体
    t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    // 链接 [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, txt, url) => {
      return `<a href="${safeUrl(url)}">${txt}</a>`;
    });
    // 图片 ![alt](url)
    t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
      return `<img src="${safeUrl(url)}" alt="${alt || ''}"/>`;
    });
    return t;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line.trim())) {
      if (!inCode) {
        inCode = true;
        codeBuf = [];
      } else {
        out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        inCode = false;
        codeBuf = [];
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    // 分隔线
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push('<hr/>');
      i++;
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(inline(lines[i].replace(/^>\s?/, '')));
        i++;
      }
      out.push(`<blockquote>${buf.join('<br/>')}</blockquote>`);
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        buf.push(`<li>${inline(lines[i].replace(/^\s*[-*+]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${buf.join('')}</ul>`);
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buf.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${buf.join('')}</ol>`);
      continue;
    }

    // 空行
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 段落（合并连续非空行）
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i].trim()) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])
    ) {
      para.push(inline(lines[i]));
      i++;
    }
    out.push(`<p>${para.join('<br/>')}</p>`);
  }

  if (inCode && codeBuf.length) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  }

  return out.join('\n');
}

/** 从微信错误包提取信息：errcode 为 0 视为成功返回 null。 */
export function parseWechatError(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const code = typeof o.errcode === 'number' ? o.errcode : Number(o.errcode);
  if (code === 0 || Number.isNaN(code)) return null;
  const msg = typeof o.errmsg === 'string' ? o.errmsg : 'unknown error';
  return `微信接口错误 errcode=${code} errmsg=${msg}`;
}

/** 解析草稿箱新增响应（cgi-bin/draft/add）→ media_id。 */
export function parseAddDraftResponse(json: unknown): { mediaId: string } {
  const err = parseWechatError(json);
  if (err) throw new Error(err);
  const o = (json || {}) as Record<string, unknown>;
  const mediaId = o.media_id;
  if (typeof mediaId !== 'string' || !mediaId) {
    throw new Error('草稿箱同步失败：响应缺少 media_id');
  }
  return { mediaId };
}

/** 解析发布提交响应（cgi-bin/freepublish/submit）→ publish_id。 */
export function parseFreepublishSubmit(json: unknown): { publishId: string } {
  const err = parseWechatError(json);
  if (err) throw new Error(err);
  const o = (json || {}) as Record<string, unknown>;
  const publishId = o.publish_id;
  if (typeof publishId !== 'string' || !publishId) {
    throw new Error('发布提交失败：响应缺少 publish_id');
  }
  return { publishId };
}

/** 解析发布状态查询响应（cgi-bin/freepublish/get）→ 状态与文章链接。 */
export function parseFreepublishGet(json: unknown): {
  status: string;
  articleId?: string;
  articleUrl?: string;
} {
  const err = parseWechatError(json);
  if (err) throw new Error(err);
  const o = (json || {}) as Record<string, unknown>;
  const status = typeof o.publish_status === 'string' ? o.publish_status : 'UNKNOWN';
  let articleUrl: string | undefined;
  let articleId: string | undefined;
  if (o.article_detail && typeof o.article_detail === 'object') {
    const d = o.article_detail as Record<string, unknown>;
    if (Array.isArray(d.item) && d.item[0] && typeof d.item[0] === 'object') {
      const it = d.item[0] as Record<string, unknown>;
      articleUrl = typeof it.article_url === 'string' ? it.article_url : undefined;
      articleId = typeof it.article_id === 'string' ? it.article_id : undefined;
    }
  }
  return { status, articleId, articleUrl };
}

/** 解析群发响应（cgi-bin/message/mass/sendall）→ msg_id。 */
export function parseMassSendResponse(json: unknown): { msgId: string } {
  const err = parseWechatError(json);
  if (err) throw new Error(err);
  const o = (json || {}) as Record<string, unknown>;
  const msgId = o.msg_id;
  if (typeof msgId === 'undefined' || msgId === null) {
    throw new Error('群发提交失败：响应缺少 msg_id');
  }
  return { msgId: String(msgId) };
}

/** 校验定时发布时间：必须是合法时间且晚于当前（至少 5 分钟后，符合微信要求）。 */
export function validateScheduledAt(iso: string): { ok: boolean; error?: string; date?: Date } {
  if (!iso || typeof iso !== 'string' || iso.trim() === '') {
    return { ok: false, error: '定时发布时间不能为空' };
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { ok: false, error: '定时发布时间不是合法时间' };
  const min = new Date(Date.now() + 5 * 60 * 1000);
  if (d.getTime() < min.getTime()) {
    return { ok: false, error: '定时发布时间须晚于当前至少 5 分钟' };
  }
  return { ok: true, date: d };
}

export type PublishAction = 'sync-draft' | 'publish' | 'mass';

/** 归一化发布动作（前端可能传 publish/mass/syncDraft 等），非法值抛错。 */
export function coercePublishAction(raw: unknown): PublishAction {
  const a = String(raw || '').toLowerCase();
  if (a === 'sync-draft' || a === 'syncdraft' || a === 'sync') return 'sync-draft';
  if (a === 'publish' || a === 'submit') return 'publish';
  if (a === 'mass' || a === 'masssend' || a === 'sendall' || a === 'group') return 'mass';
  throw new Error(`不支持的发布动作：${String(raw)}（仅 sync-draft / publish / mass）`);
}
