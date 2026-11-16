import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  canTrigger,
  hasPendingRequest,
  isHeartbeatFresh,
  normalizeCheck,
  normalizeStatus,
  parseJsonSafe,
  str,
  tailLines,
  type RawCheckResult,
  type RawUpdateStatus,
} from './update.util';

export interface UpdateStatusView extends RawUpdateStatus {
  /** updater 容器心跳是否新鲜（决定按钮是否可点）。 */
  available: boolean;
  /** 已投递但 updater 尚未接手的请求 id；非空时前端显示「排队中」并禁用按钮。 */
  pendingRequestId: string;
  pendingType: string;
  check: RawCheckResult | null;
  log: string[];
  serverTime: string;
}

export interface UpdateRequestPayload {
  id: string;
  type: 'check' | 'apply';
  requestedAt: string;
  requestedBy: string;
}

/**
 * 在线更新服务（T6.5）——只做「写请求 / 读状态」，绝不执行 docker 或 git。
 *
 * 架构：api 容器没有 docker.sock、没有 git 二进制，也不该有。真正的拉取与重建
 * 由独立 updater 容器完成；两者通过共享 storage 卷里的文件通信：
 *   api 写 request.json  →  updater 轮询执行  →  updater 写 status/check/heartbeat/log
 * 因此即使 api 在更新过程中被重建，请求早已落盘，更新不会中断。
 */
@Injectable()
export class UpdateService {
  private readonly logger = new Logger(UpdateService.name);
  private readonly dir: string;

  constructor(config: ConfigService) {
    const root = resolve(process.cwd(), config.get<string>('STORAGE_ROOT') ?? './storage');
    this.dir = join(root, 'update');
  }

  private file(name: string): string {
    return join(this.dir, name);
  }

  private async read(name: string): Promise<string | null> {
    try {
      return await readFile(this.file(name), 'utf8');
    } catch {
      return null;
    }
  }

  /** 判断请求是否已投递但 updater 尚未接手（request.id 未写入 last-id）。 */
  private async pendingRequest(): Promise<{ id: string; type: string }> {
    const [requestRaw, lastIdRaw] = await Promise.all([
      this.read('request.json'),
      this.read('last-id'),
    ]);
    const parsed = parseJsonSafe(requestRaw);
    const id = str(parsed?.id);
    const lastId = (lastIdRaw ?? '').trim();
    if (!hasPendingRequest(id, lastId)) return { id: '', type: '' };
    return { id, type: str(parsed?.type) };
  }

  /** 系统设置页轮询：合并心跳 / 执行状态 / 排队请求 / 检查结果 / 日志尾部。 */
  async getStatus(): Promise<UpdateStatusView> {
    const [heartbeatRaw, statusRaw, checkRaw, logRaw, pending] = await Promise.all([
      this.read('heartbeat.json'),
      this.read('status.json'),
      this.read('check.json'),
      this.read('log.txt'),
      this.pendingRequest(),
    ]);
    const heartbeat = parseJsonSafe(heartbeatRaw);
    const available = isHeartbeatFresh(heartbeat, Math.floor(Date.now() / 1000));
    const status = normalizeStatus(parseJsonSafe(statusRaw));

    return {
      ...status,
      available,
      pendingRequestId: pending.id,
      pendingType: pending.type,
      check: normalizeCheck(parseJsonSafe(checkRaw)),
      log: tailLines(logRaw, 40),
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * 提交一个更新请求（check=检查版本 / apply=拉取并重建）。
   * 原子写（tmp + rename），避免 updater 读到半个 JSON。
   */
  async trigger(type: 'check' | 'apply', username: string): Promise<{ accepted: boolean; requestId: string }> {
    const [heartbeatRaw, statusRaw, pending] = await Promise.all([
      this.read('heartbeat.json'),
      this.read('status.json'),
      this.pendingRequest(),
    ]);
    const available = isHeartbeatFresh(
      parseJsonSafe(heartbeatRaw),
      Math.floor(Date.now() / 1000),
    );
    const phase = normalizeStatus(parseJsonSafe(statusRaw)).phase;
    const gate = canTrigger(phase, available, Boolean(pending.id));
    if (!gate.ok) {
      if (!available) throw new ServiceUnavailableException(gate.reason);
      throw new ConflictException(gate.reason);
    }

    const payload: UpdateRequestPayload = {
      id: randomUUID(),
      type,
      requestedAt: new Date().toISOString(),
      requestedBy: username || 'unknown',
    };
    await mkdir(this.dir, { recursive: true });
    const tmp = this.file(`request.${payload.id}.tmp`);
    await writeFile(tmp, JSON.stringify(payload), 'utf8');
    await rename(tmp, this.file('request.json'));

    this.logger.log(`在线更新请求已提交：type=${type} id=${payload.id} by=${payload.requestedBy}`);
    return { accepted: true, requestId: payload.id };
  }
}
