import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 请求级上下文（深入设计 §2.4 审计）。
 * 通过 AsyncLocalStorage 在异步链路中透传当前操作用户，避免把 userId 当作参数层层下传。
 * 未处于请求上下文（如 Worker、定时任务、种子脚本）时 userId 为 undefined，审计照常记录（userId 留空）。
 */
export interface RequestContextValue {
  userId?: string | null;
}

const storage = new AsyncLocalStorage<RequestContextValue>();

export const requestContext = {
  get(): RequestContextValue | undefined {
    return storage.getStore();
  },
  getUserId(): string | null | undefined {
    return storage.getStore()?.userId;
  },
  /** 在执行 fn 期间挂起请求上下文，供下游 Prisma 中间件读取。 */
  run<T>(value: RequestContextValue, fn: () => T): T {
    return storage.run(value, fn);
  },
};
