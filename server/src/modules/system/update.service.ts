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
  isHeartbeatFresh,
  normalizeCheck,
  normalizeStatus,
  parseJsonSafe,
  tailLines,
  type RawCheckResult,
  type RawUpdateStatus,
} from './update.util';

export interface UpdateStatusView extends RawUpdateStatus {
  /** updater 容器心跳是否新鲜（决定按钮是否可点）。 */
  available: boolean;
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

  /** 系统设置页轮询：合并心跳 / 执行状态 / 检查结果 / 日志尾部。 */
  async getStatus(): Promise<UpdateStatusView> {
    const [heartbeatRaw, statusRaw, checkRaw, logRaw] = await Promise.all([
      this.read('heartbeat.json'),
      this.read('status.json'),
      this.read('check.json'),
      this.read('log.txt'),
    ]);
    const heartbeat = parseJsonSafe(heartbeatRaw);
    const available = isHeartbeatFresh(heartbeat, Math.floor(Date.now() / 1000));
    const status = normalizeStatus(parseJsonSafe(statusRaw));

    return {
      ...status,
      available,
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
    const [heartbeatRaw, statusRaw] = await Promise.all([
      this.read('heartbeat.json'),
      this.read('status.json'),
    ]);
    const available = isHeartbeatFresh(
      parseJsonSafe(heartbeatRaw),
      Math.floor(Date.now() / 1000),
    );
    const phase = normalizeStatus(parseJsonSafe(statusRaw)).phase;
    const gate = canTrigger(phase, available);
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
