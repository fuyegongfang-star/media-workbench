/**
 * 在线更新 API（T6.5）：系统管理 → 版本与运维。
 * 与 auth.ts 共用同一套 token；401 由 main.ts 的全局 fetch 拦截统一处理。
 */
import { getToken } from './auth';

export interface UpdateCheckResult {
  checkedAt: string;
  localCommit: string;
  remoteCommit: string;
  behindBy: number;
  aheadBy: number;
  upToDate: boolean;
  branch: string;
  error: string;
}

export type UpdatePhase = 'idle' | 'running' | 'success' | 'failed' | 'unknown';

export interface UpdateStatus {
  available: boolean;
  phase: UpdatePhase;
  type: string;
  requestId: string;
  message: string;
  currentCommit: string;
  remoteCommit: string;
  startedAt: string;
  finishedAt: string;
  updatedAt: string;
  /** 已提交但 updater 尚未接手的请求；非空时按钮禁用并显示「排队中」。 */
  pendingRequestId: string;
  pendingType: string;
  check: UpdateCheckResult | null;
  log: string[];
  serverTime: string;
}

export interface UpdateTriggerResult {
  accepted: boolean;
  requestId: string;
}

function prefix(): string {
  return import.meta.env.VITE_API_PREFIX ?? 'api';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/${prefix()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      const m = body?.message;
      if (typeof m === 'string') message = m;
      else if (Array.isArray(m) && m.length) message = m.join('；');
    } catch {
      /* 保留 HTTP 状态作为错误信息 */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

/** 轮询状态（含版本、阶段、日志尾部、updater 是否存活）。 */
export function fetchUpdateStatus(): Promise<UpdateStatus> {
  return request<UpdateStatus>('/system/update/status');
}

/** 检查 GitHub 上是否有新提交（由 updater 执行 git fetch）。 */
export function checkUpdate(): Promise<UpdateTriggerResult> {
  return request<UpdateTriggerResult>('/system/update/check', { method: 'POST' });
}

/** 拉取代码并重建 api/web（仅 owner 可调用）。 */
export function applyUpdate(): Promise<UpdateTriggerResult> {
  return request<UpdateTriggerResult>('/system/update/apply', { method: 'POST' });
}
