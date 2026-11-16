// LLM 供应商连通性探测纯函数单测（本地 mock HTTP，不访问任何真实供应商）。
// 运行：node --test server/test/provider-test.test.mjs（需先 npm run build 产出 dist）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import util from '../dist/modules/system/provider-test.util.js';

const { normalizeBaseUrl, redactSecret, probeProvider, DEFAULT_LLM_BASE_URL } = util;

test('normalizeBaseUrl: 去尾斜杠 / 空值回落 / 拒绝非 http(s)', () => {
  assert.equal(normalizeBaseUrl('https://api.deepseek.com/v1///'), 'https://api.deepseek.com/v1');
  assert.equal(normalizeBaseUrl('  '), DEFAULT_LLM_BASE_URL);
  assert.equal(normalizeBaseUrl(null), DEFAULT_LLM_BASE_URL);
  assert.equal(normalizeBaseUrl('javascript:alert(1)'), '');
  assert.equal(normalizeBaseUrl('file:///etc/passwd'), '');
});

test('redactSecret: 错误信息中的明文密钥必须被抹掉并截断', () => {
  const key = 'sk-super-secret-1234';
  const out = redactSecret(`HTTP 401: invalid key ${key} / ${key}`, [key, undefined]);
  assert.ok(!out.includes(key));
  assert.ok(out.includes('***'));
  assert.ok(out.length <= 300);
});

test('probeProvider: 参数不完整时直接返回结构化失败，不发请求', async () => {
  const noKey = await probeProvider({ baseUrl: '', apiKey: '', model: 'gpt-4o-mini' });
  assert.equal(noKey.ok, false);
  assert.match(noKey.error, /API Key/);

  const noModel = await probeProvider({ baseUrl: '', apiKey: 'sk-x', model: '' });
  assert.equal(noModel.ok, false);
  assert.match(noModel.error, /模型/);

  const badUrl = await probeProvider({ baseUrl: 'ftp://x', apiKey: 'sk-x', model: 'm' });
  assert.equal(badUrl.ok, false);
  assert.match(badUrl.error, /Base URL/);
});

function startMock(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/v1` });
    });
  });
}

test('probeProvider: 真实向 mock 服务发一次最小 chat 请求并回报模型回复', async (t) => {
  const key = 'sk-mock-key-abcdef';
  let seen = null;
  const { server, baseUrl } = await startMock((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen = { auth: req.headers.authorization, body: JSON.parse(body), path: req.url };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '正常' } }] }));
    });
  });
  t.after(() => server.close());

  const r = await probeProvider({ baseUrl, apiKey: key, model: 'mock-chat', timeoutMs: 3000 });
  assert.equal(r.ok, true);
  assert.equal(r.model, 'mock-chat');
  assert.equal(r.replySnippet, '正常');
  assert.equal(seen.auth, `Bearer ${key}`);
  assert.equal(seen.path, '/v1/chat/completions');
  assert.equal(seen.body.model, 'mock-chat');
  assert.equal(seen.body.max_tokens, 16);
  assert.equal(seen.body.stream, false);
  assert.ok(r.latencyMs >= 0);
});

test('probeProvider: HTTP 错误状态与响应体中的密钥都要脱敏', async (t) => {
  const key = 'sk-should-not-leak';
  const { server, baseUrl } = await startMock((_req, res) => {
    res.statusCode = 401;
    res.end(`unauthorized: ${key}`);
  });
  t.after(() => server.close());

  const r = await probeProvider({ baseUrl, apiKey: key, model: 'mock-chat', timeoutMs: 3000 });
  assert.equal(r.ok, false);
  assert.equal(r.httpStatus, 401);
  assert.ok(!JSON.stringify(r).includes(key));
  assert.ok(r.error.includes('***'));
});
