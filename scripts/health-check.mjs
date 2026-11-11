/**
 * 夜间巡检可复用的健康检查冒烟：
 *   PORT / API_PREFIX 从环境变量读取（与 .env.example 一致），不含任何密钥。
 * 用法：npm run health（需先启动 API：npm start）
 */
const port = Number(process.env.PORT ?? 3001);
const prefix = process.env.API_PREFIX ?? 'api';
const url = `http://127.0.0.1:${port}/${prefix}/health`;

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch(url, {
    signal: controller.signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body.status !== 'ok') {
    throw new Error(`status=${String(body.status)}`);
  }
  console.log(JSON.stringify({ url, httpStatus: response.status, body }, null, 2));
  console.log('健康检查冒烟通过');
} catch (error) {
  console.error('健康检查冒烟失败：', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
