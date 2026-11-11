// T3.9 公众号发布执行 —— 纯函数 + Provider HTTP 契约单测（不依赖 DB/Redis/微信网络）。
// 运行：node --test server/test/wechat-publish.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import util from '../dist/modules/content/publish/wechat-publish.util.js';
const {
  escapeHtml,
  safeUrl,
  markdownToWechatHtml,
  buildWechatArticle,
  parseWechatError,
  parseAddDraftResponse,
  parseFreepublishSubmit,
  parseFreepublishGet,
  parseMassSendResponse,
  validateScheduledAt,
  coercePublishAction,
} = util;

import provMod from '../dist/modules/content/publish/wechat.provider.js';
const { WeChatPublishProvider } = provMod;

// ============ 纯函数 ============

test('escapeHtml: 转义尖括号/引号/与号', () => {
  assert.equal(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});

test('safeUrl: 拦截 javascript:/data: 注入', () => {
  assert.equal(safeUrl('https://a.com/x'), 'https://a.com/x');
  assert.equal(safeUrl('/rel/path'), '/rel/path');
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('data:text/html,x'), '#');
});

test('markdownToWechatHtml: 标题/粗体/列表/链接/代码/引用/分隔线', () => {
  const md = [
    '# 标题',
    '这是 **加粗** 与 *斜体*。',
    '- 项一',
    '- 项二',
    '> 引用一句',
    '---',
    '[百度](https://baidu.com)',
    '`inline code`',
  ].join('\n');
  const html = markdownToWechatHtml(md);
  assert.ok(html.includes('<h1>标题</h1>'));
  assert.ok(html.includes('<strong>加粗</strong>'));
  assert.ok(html.includes('<em>斜体</em>'));
  assert.ok(html.includes('<ul><li>项一</li><li>项二</li></ul>'));
  assert.ok(html.includes('<blockquote>引用一句</blockquote>'));
  assert.ok(html.includes('<hr/>'));
  assert.ok(html.includes('<a href="https://baidu.com">百度</a>'));
  assert.ok(html.includes('<code>inline code</code>'));
});

test('markdownToWechatHtml: 文本节点转义防 XSS', () => {
  const html = markdownToWechatHtml('普通 <script>alert(1)</script> 文本');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('markdownToWechatHtml: 链接 URL 注入被阻断', () => {
  const html = markdownToWechatHtml('[x](javascript:alert(1))');
  assert.ok(html.includes('href="#"'));
});

test('buildWechatArticle: 标题兜底 + 正文转 HTML + digest 截断', () => {
  const a = buildWechatArticle({ title: '', contentMd: '# Hi\n正文', digest: 'x'.repeat(200) });
  assert.equal(a.title, '未命名文章');
  assert.ok(a.content.includes('<h1>Hi</h1>'));
  assert.ok(a.digest.length <= 120);
});

test('parseWechatError: errcode=0 返回 null，否则返回信息', () => {
  assert.equal(parseWechatError({ errcode: 0 }), null);
  assert.equal(parseWechatError({ errcode: 40013, errmsg: 'invalid appid' }), '微信接口错误 errcode=40013 errmsg=invalid appid');
});

test('parseAddDraftResponse: 成功取 media_id / 错误抛 / 缺失抛', () => {
  assert.deepEqual(parseAddDraftResponse({ media_id: 'MED123' }), { mediaId: 'MED123' });
  assert.throws(() => parseAddDraftResponse({ errcode: 1, errmsg: 'x' }));
  assert.throws(() => parseAddDraftResponse({}));
});

test('parseFreepublishSubmit / get: 解析 publish_id 与 article_url', () => {
  assert.deepEqual(parseFreepublishSubmit({ publish_id: 'P1' }), { publishId: 'P1' });
  const g = parseFreepublishGet({
    publish_status: 'SUCCESS',
    article_detail: { item: [{ article_id: 'A1', article_url: 'https://mp.weixin.qq.com/u/A1' }] },
  });
  assert.equal(g.status, 'SUCCESS');
  assert.equal(g.articleId, 'A1');
  assert.equal(g.articleUrl, 'https://mp.weixin.qq.com/u/A1');
});

test('parseMassSendResponse: 取 msg_id', () => {
  assert.deepEqual(parseMassSendResponse({ msg_id: 12345 }), { msgId: '12345' });
  assert.throws(() => parseMassSendResponse({ errcode: 1 }));
});

test('validateScheduledAt: 非法/过早/合法', () => {
  assert.equal(validateScheduledAt('').ok, false);
  assert.equal(validateScheduledAt('not-a-date').ok, false);
  const past = new Date(Date.now() - 86400000).toISOString();
  assert.equal(validateScheduledAt(past).ok, false);
  const future = new Date(Date.now() + 3600 * 1000).toISOString();
  const v = validateScheduledAt(future);
  assert.equal(v.ok, true);
  assert.ok(v.date instanceof Date);
});

test('coercePublishAction: 归一化与非法拒绝', () => {
  assert.equal(coercePublishAction('sync-draft'), 'sync-draft');
  assert.equal(coercePublishAction('PUBLISH'), 'publish');
  assert.equal(coercePublishAction('masssend'), 'mass');
  assert.throws(() => coercePublishAction('frobnicate'));
});

// ============ Provider HTTP 契约（mock fetch，不联网）============

function makeProvider(handler) {
  return new WeChatPublishProvider({ fetchImpl: async (url, init) => handler(String(url), init) });
}

test('WeChatPublishProvider.getAccessToken: 正确 URL + 返回 access_token', async () => {
  const calls = [];
  const p = makeProvider((url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'TOK', expires_in: 7200 }),
    };
  });
  const tok = await p.getAccessToken('APPID', 'SECRET');
  assert.equal(tok, 'TOK');
  assert.ok(calls[0].includes('cgi-bin/token'));
  assert.ok(calls[0].includes('appid=APPID'));
  assert.ok(calls[0].includes('secret=SECRET'));
  assert.ok(calls[0].includes('grant_type=client_credential'));
});

test('WeChatPublishProvider.getAccessToken: 微信错误包抛清晰信息', async () => {
  const p = makeProvider(() => ({
    ok: true,
    status: 200,
    json: async () => ({ errcode: 40013, errmsg: 'invalid appid' }),
  }));
  await assert.rejects(() => p.getAccessToken('bad', 'x'), /errcode=40013/);
});

test('WeChatPublishProvider.addDraft: 草稿箱端点 + media_id', async () => {
  let url = '';
  let body = '';
  const p = makeProvider((u, init) => {
    url = u;
    body = init?.body ?? '';
    return { ok: true, status: 200, json: async () => ({ media_id: 'MED1' }) };
  });
  const r = await p.addDraft('TOK', [{ title: 'T', content: '<p>hi</p>' }]);
  assert.equal(r.mediaId, 'MED1');
  assert.ok(url.includes('cgi-bin/draft/add'));
  assert.ok(url.includes('access_token=TOK'));
  assert.ok(JSON.parse(body).articles.length === 1);
});

test('WeChatPublishProvider.freepublishSubmit + get: publish_id 与 article_url', async () => {
  let submitUrl = '';
  let getUrl = '';
  const p = makeProvider((u, init) => {
    if (String(u).includes('freepublish/submit')) {
      submitUrl = String(u);
      return { ok: true, status: 200, json: async () => ({ publish_id: 'P1' }) };
    }
    getUrl = String(u);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        publish_status: 'SUCCESS',
        article_detail: { item: [{ article_id: 'A1', article_url: 'https://mp.weixin.qq.com/u/A1' }] },
      }),
    };
  });
  const s = await p.freepublishSubmit('TOK', 'MED1');
  const g = await p.freepublishGet('TOK', s.publishId);
  assert.equal(s.publishId, 'P1');
  assert.ok(submitUrl.includes('freepublish/submit'));
  assert.ok(getUrl.includes('freepublish/get'));
  assert.equal(g.articleUrl, 'https://mp.weixin.qq.com/u/A1');
});

test('WeChatPublishProvider.massSendAll: 群发端点 + 定时时间', async () => {
  let url = '';
  let body = '';
  const p = makeProvider((u, init) => {
    url = String(u);
    body = init?.body ?? '';
    return { ok: true, status: 200, json: async () => ({ msg_id: 999 }) };
  });
  await p.massSendAll('TOK', 'MED1', { scheduleTime: '2026-12-01 09:30:00' });
  assert.ok(url.includes('cgi-bin/message/mass/sendall'));
  const parsed = JSON.parse(body);
  assert.equal(parsed.msgtype, 'mpnews');
  assert.equal(parsed.mpnews.media_id, 'MED1');
  assert.equal(parsed.schedule_time, '2026-12-01 09:30:00');
});

test('WeChatPublishProvider.massSendAll: 立即群发不含 schedule_time', async () => {
  let body = '';
  const p = makeProvider((_u, init) => {
    body = init?.body ?? '';
    return { ok: true, status: 200, json: async () => ({ msg_id: 1 }) };
  });
  await p.massSendAll('TOK', 'MED1');
  const parsed = JSON.parse(body);
  assert.equal(parsed.schedule_time, undefined);
});
