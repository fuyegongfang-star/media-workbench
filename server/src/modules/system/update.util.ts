/**
 * 在线更新（T6.5）纯函数：状态文件解析与触发条件判定。
 *
 * 真值来源：updater 容器写出的 JSON 文件（共享 storage 卷 /update/）。
 * 这里全部做防御式解析——文件可能不存在、被写了一半、或来自旧版本格式，
 * 任何异常都降级为「未知」，绝不让系统设置页因为一个坏文件而报错。
 */

export type UpdatePhase = 'idle' | 'running' | 'success' | 'failed' | 'unknown';

export interface RawUpdateStatus {
  phase: UpdatePhase;
  type: string;
  requestId: string;
  message: string;
  currentCommit: string;
  remoteCommit: string;
  startedAt: string;
  finishedAt: string;
  updatedAt: string;
}

export interface RawCheckResult {
  checkedAt: string;
  localCommit: string;
  remoteCommit: string;
  behindBy: number;
  aheadBy: number;
  upToDate: boolean;
  branch: string;
  error: string;
}

/** 心跳超过这个秒数就认为 updater 容器没在跑（轮询周期 2s，留足余量）。 */
export const HEARTBEAT_MAX_AGE_SEC = 20;

export function parseJsonSafe(raw: string | null): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function bool(value: unknown): boolean {
  return value === true;
}

/**
 * updater 心跳是否新鲜。容忍轻微时钟偏差（-60s），但拒绝过旧或明显来自未来的时间戳。
 */
export function isHeartbeatFresh(
  parsed: Record<string, unknown> | null,
  nowEpochSec: number,
  maxAgeSec = HEARTBEAT_MAX_AGE_SEC,
): boolean {
  if (!parsed) return false;
  const ts = num(parsed.ts, -1);
  if (ts <= 0) return false;
  const delta = nowEpochSec - ts;
  return delta >= -60 && delta <= maxAgeSec;
}

export function normalizePhase(value: string): UpdatePhase {
  return value === 'idle' || value === 'running' || value === 'success' || value === 'failed'
    ? value
    : 'unknown';
}

export function normalizeStatus(parsed: Record<string, unknown> | null): RawUpdateStatus {
  if (!parsed) {
    return {
      phase: 'unknown',
      type: '',
      requestId: '',
      message: '尚未检测到更新服务状态（updater 容器可能未启动）',
      currentCommit: '',
      remoteCommit: '',
      startedAt: '',
      finishedAt: '',
      updatedAt: '',
    };
  }
  return {
    phase: normalizePhase(str(parsed.phase)),
    type: str(parsed.type),
    requestId: str(parsed.requestId),
    message: str(parsed.message),
    currentCommit: str(parsed.currentCommit),
    remoteCommit: str(parsed.remoteCommit),
    startedAt: str(parsed.startedAt),
    finishedAt: str(parsed.finishedAt),
    updatedAt: str(parsed.updatedAt),
  };
}

export function normalizeCheck(parsed: Record<string, unknown> | null): RawCheckResult | null {
  if (!parsed) return null;
  return {
    checkedAt: str(parsed.checkedAt),
    localCommit: str(parsed.localCommit),
    remoteCommit: str(parsed.remoteCommit),
    behindBy: num(parsed.behindBy),
    aheadBy: num(parsed.aheadBy),
    upToDate: bool(parsed.upToDate),
    branch: str(parsed.branch),
    error: str(parsed.error),
  };
}

/** 返回日志最后 max 行（去掉空行），供设置页展示进度。 */
export function tailLines(text: string | null, max: number): string[] {
  if (!text) return [];
  const size = Math.max(1, Math.floor(max));
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(-size);
}

/**
 * 请求是否已投递但 updater 尚未接手：request.json 的 id 还没写进 last-id。
 * 这段窗口期内 status.json 仍是上一次的结果（例如 success），只看 phase 会误判为「已完成」，
 * 导致按钮提前恢复可点、连点入队两次更新。因此必须单独判一次。
 */
export function hasPendingRequest(requestId: string, lastId: string): boolean {
  return Boolean(requestId) && requestId !== lastId;
}

/**
 * 触发前置条件：更新服务必须存活、不能有请求排队、不能有任务正在跑。
 * 注意 apply/check 共用 status.json 的 phase，运行中的 check 也会覆盖 apply 的进度，
 * 所以两种请求都受同一把锁约束。
 */
export function canTrigger(
  phase: UpdatePhase,
  alive: boolean,
  pending = false,
): { ok: boolean; reason: string } {
  if (!alive) {
    return {
      ok: false,
      reason: '更新服务未运行（未检测到 updater 心跳），请先在服务器执行 ./deploy/bootstrap.sh 或检查容器状态',
    };
  }
  if (pending) {
    return { ok: false, reason: '已有更新请求排队等待执行，请稍候' };
  }
  if (phase === 'running') {
    return { ok: false, reason: '已有更新任务正在执行，请等待完成' };
  }
  return { ok: true, reason: '' };
}
