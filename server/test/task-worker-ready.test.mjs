// 回归测试：任务 Worker 启动时序 + 雷达调度队列隔离（纯 Node，不连真实 Redis/PG）。
// 背景：NestJS 并发调用同模块各 provider 的 onModuleInit，旧实现里 TaskWorkerService
// 同步读取 TaskQueueService.available（此时 Redis 探测尚未完成=false）→ Worker 永不启动，
// 所有任务堆积在 queued；雷达调度 Worker 又与业务队列共用 generation 并吞掉 job。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');

/** 用假的 bullmq 类替换 require 缓存，避免测试真的连接 Redis。返回调用记录。 */
function installFakeBullMQ() {
  const bullmqId = require.resolve('bullmq', { paths: [serverRoot] });
  const calls = { workers: [], queues: [] };
  class FakeQueue {
    constructor(name, opts) {
      calls.queues.push({ name, opts });
      this.name = name;
    }
    waitUntilReady() { return Promise.resolve(); }
    upsertJobScheduler() { return Promise.resolve(); }
    removeJobScheduler() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  class FakeWorker {
    constructor(name, processor, opts) {
      calls.workers.push({ name, processor, opts });
    }
    on() {}
    close() { return Promise.resolve(); }
  }
  require.cache[bullmqId] = {
    id: bullmqId, filename: bullmqId, loaded: true,
    exports: { Queue: FakeQueue, Worker: FakeWorker },
  };
  return calls;
}

test('TaskWorkerService 等待队列 ready 后才创建 Worker（修复竞态根因）', async () => {
  const calls = installFakeBullMQ();
  const { TASK_QUEUE_NAME } = require(resolve(serverRoot, 'dist/modules/tasks/queue/queue.service.js'));
  const { TaskWorkerService } = require(resolve(serverRoot, 'dist/modules/tasks/worker/task-worker.service.js'));

  let releaseReady;
  const ready = new Promise((r) => { releaseReady = r; });
  const fakeQueue = { ready, available: true, connection: { host: 'x' }, prefix: 'p' };
  const svc = new TaskWorkerService(fakeQueue, { processTask: async () => {} }, {});

  const initPromise = svc.onModuleInit();
  // 推进一次微任务：此时 ready 仍未 resolve，onModuleInit 应阻塞在 await 处
  await Promise.resolve();
  assert.equal(calls.workers.length, 0, '队列 ready 之前不得创建 Worker');

  releaseReady();
  await initPromise;
  assert.equal(calls.workers.length, 1, '队列 ready 之后应创建业务 Worker');
  assert.equal(calls.workers[0].name, TASK_QUEUE_NAME, '业务 Worker 应监听 generation 队列');
});

test('TaskQueueService.ready 在探测结束后 settle（成功/失败都放行）', async () => {
  installFakeBullMQ();
  const { TaskQueueService } = require(resolve(serverRoot, 'dist/modules/tasks/queue/queue.service.js'));
  const config = { get: (k) => (k === 'BULLMQ_PREFIX' ? 'test' : undefined) };
  const svc = new TaskQueueService(config);
  let settled = false;
  svc.ready.then(() => { settled = true; });
  await svc.onModuleInit();
  await svc.ready;
  assert.equal(settled, true, 'onModuleInit 完成后 ready 必须已 resolve');
  assert.equal(svc.available, true, 'fake Redis 探测应判定队列在线');
});

test('雷达调度器使用独立队列，不与业务队列共用（编译产物断言）', () => {
  const dist = readFileSync(resolve(serverRoot, 'dist/modules/radar/radar-scheduler.service.js'), 'utf8');
  assert.match(dist, /radar-scheduler/, '调度器应使用 radar-scheduler 队列名');
  assert.doesNotMatch(dist, /TASK_QUEUE_NAME/, '调度器不得再引用业务队列名');
});
