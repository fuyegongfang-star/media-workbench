export interface HealthPayload {
  status: string;
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  node: string;
  dependencies: Record<string, string>;
}

/**
 * 健康检查请求。带超时与 HTTP 状态校验，失败由调用方降级展示，不吞异常。
 * 说明：仅读取公开健康信息，不携带任何凭据。
 */
export async function fetchHealth(timeoutMs = 5000): Promise<HealthPayload> {
  const prefix = import.meta.env.VITE_API_PREFIX ?? 'api';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`/${prefix}/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`健康检查返回 HTTP ${response.status}`);
    }
    return (await response.json()) as HealthPayload;
  } finally {
    clearTimeout(timer);
  }
}

// ============ 系统设置（T1.8）============

export interface SiteSettingsView {
  siteName: string;
  siteDesc: string | null;
  defaultWechatAppIdMasked: string;
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
  compliance: Record<string, boolean>;
  updatedAt: string | null;
}

export interface SystemStatus {
  auth: { implemented: string[]; note: string };
  tasks: { implemented: string[]; queueAvailable: boolean; note: string };
  backup: { scripts: string[]; cronExample: string; manual: string; note: string };
  health: { postgres: string; redis: string };
}

function apiPrefix(): string {
  return import.meta.env.VITE_API_PREFIX ?? 'api';
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('wb_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 系统设置页状态总览（公开，只读非敏感信息）。 */
export async function fetchSystemStatus(timeoutMs = 5000): Promise<SystemStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/system/status`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as SystemStatus;
  } finally {
    clearTimeout(timer);
  }
}

/** 读取站点设置（脱敏，需令牌）。未登录返回 401 说明。 */
export async function fetchSystemSettings(timeoutMs = 5000): Promise<SiteSettingsView> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/system/settings`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as SiteSettingsView;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新站点设置（AppID / AppSecret 以明文提交，服务端加密入库，需令牌）。 */
export async function saveSystemSettings(
  payload: {
    siteName?: string;
    siteDesc?: string;
    defaultWechatAppId?: string;
    defaultWechatAppSecret?: string;
    compliance?: Record<string, boolean>;
  },
  timeoutMs = 5000,
): Promise<SiteSettingsView> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/system/settings`, {
      method: 'PUT',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as SiteSettingsView;
  } finally {
    clearTimeout(timer);
  }
}

// ============ 可观测性（T1.9）============

export interface AuditLogItem {
  id: string;
  userId: string | null;
  objectType: string;
  objectId: string;
  action: string;
  at: string;
}

export interface AuditLogResult {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 审计日志列表（检索/筛选 + 分页，需令牌）。 */
export async function fetchAuditLog(
  params: Record<string, string | number | undefined> = {},
  timeoutMs = 8000,
): Promise<AuditLogResult> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/observability/audit${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AuditLogResult;
  } finally {
    clearTimeout(timer);
  }
}

export interface RecycleItem {
  type: string;
  typeLabel: string;
  id: string;
  name: string;
  deletedAt: string | null;
  updatedAt: string | null;
}

export interface RecycleResult {
  items: RecycleItem[];
  total: number;
  types: { key: string; label: string }[];
}

/** 回收站列表（可选 type 过滤，需令牌）。 */
export async function fetchRecycleBin(type?: string, timeoutMs = 8000): Promise<RecycleResult> {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/observability/recycle-bin${query}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as RecycleResult;
  } finally {
    clearTimeout(timer);
  }
}

/** 恢复软删记录（需令牌）。 */
export async function restoreRecycleItem(
  type: string,
  id: string,
  timeoutMs = 8000,
): Promise<{ restored: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/observability/recycle-bin/${encodeURIComponent(type)}/${encodeURIComponent(id)}/restore`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...authHeader() },
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (res.status === 404) throw new Error('该记录不存在或已恢复');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { restored: boolean };
  } finally {
    clearTimeout(timer);
  }
}

// ============ T4.5 批量操作 ============
export type BatchType = 'topic' | 'title' | 'project';
export type BatchAction = 'setStatus' | 'tag' | 'delete' | 'publish';
export type TagMode = 'add' | 'remove' | 'replace';

export interface BatchItemResult {
  id: string;
  ok: boolean;
  error?: string;
}
export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchItemResult[];
}
export interface BatchParams {
  type: BatchType;
  action: BatchAction;
  ids: string[];
  status?: string;
  tags?: string[];
  tagMode?: TagMode;
}

/** T4.5 批量操作入口：POST /api/content/batch（选题/标题/草稿 的状态变更/打标签/删除/发布）。 */
export async function runBatch(params: BatchParams, timeoutMs = 15000): Promise<BatchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content/batch`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(params),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) {
      let msg = '';
      try {
        const body = await res.json();
        msg = body?.message || body?.error || JSON.stringify(body);
      } catch {
        /* ignore */
      }
      throw new Error(`HTTP ${res.status}${msg ? '：' + msg : ''}`);
    }
    return (await res.json()) as BatchResult;
  } finally {
    clearTimeout(timer);
  }
}

// ============ 通知渠道与监控告警（T1.10）============

export type NotificationChannelType = 'wecom' | 'dingtalk' | 'email';
export type NotificationAlertKind =
  | 'task_success'
  | 'task_failed'
  | 'backup_failed'
  | 'quota'
  | 'liveness'
  | 'generic';

export interface NotificationChannel {
  type: NotificationChannelType;
  enabled: boolean;
  webhookUrl?: string;
  secret?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  secure?: boolean;
  from?: string;
  to?: string[];
}

export interface NotificationSettings {
  channels: NotificationChannel[];
  forwardKinds: NotificationAlertKind[];
}

export interface NotificationStatus {
  enabledChannels: number;
  totalChannels: number;
  forwardKinds: NotificationAlertKind[];
  note: string;
}

/** 通知渠道概览（公开，只读非敏感）。 */
export async function fetchNotificationStatus(timeoutMs = 5000): Promise<NotificationStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/notification/status`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as NotificationStatus;
  } finally {
    clearTimeout(timer);
  }
}

/** 读取通知渠道配置（脱敏，需令牌）。 */
export async function fetchNotificationChannels(timeoutMs = 5000): Promise<NotificationSettings> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/notification/channels`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as NotificationSettings;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新通知渠道配置（敏感字段服务端加密入库，需令牌）。 */
export async function saveNotificationChannels(
  payload: NotificationSettings,
  timeoutMs = 8000,
): Promise<NotificationSettings> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/notification/channels`, {
      method: 'PUT',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as NotificationSettings;
  } finally {
    clearTimeout(timer);
  }
}

/** 向某渠道发送测试消息（需令牌）。 */
export async function testNotification(
  type: NotificationChannelType,
  text?: string,
  timeoutMs = 8000,
): Promise<{ type: string; ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/notification/test`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify({ type, text }),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { type: string; ok: boolean; error?: string };
  } finally {
    clearTimeout(timer);
  }
}

/** 手动触发一次监控告警（需令牌）。 */
export async function sendAlert(
  kind: NotificationAlertKind,
  detail?: string,
  timeoutMs = 8000,
): Promise<{ type: string; ok: boolean; error?: string }[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/notification/alert`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify({ kind, detail }),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { type: string; ok: boolean; error?: string }[];
  } finally {
    clearTimeout(timer);
  }
}

// ============ 对标账号（T2.1）============

export interface ReferenceAccount {
  id: string;
  platform: string;
  name: string;
  homepageUrl: string | null;
  domain: string | null;
  note: string | null;
  createdAt: string;
}

/** 对标账号列表（需令牌）。 */
export async function fetchReferenceAccounts(
  params: Record<string, string | undefined> = {},
  timeoutMs = 8000,
): Promise<ReferenceAccount[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/reference-accounts${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ReferenceAccount[];
  } finally {
    clearTimeout(timer);
  }
}

/** 新建对标账号（需令牌）。 */
export async function createReferenceAccount(
  payload: {
    name: string;
    platform?: string;
    homepageUrl?: string;
    domain?: string;
    note?: string;
  },
  timeoutMs = 8000,
): Promise<ReferenceAccount> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/reference-accounts`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ReferenceAccount;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新对标账号（需令牌）。 */
export async function updateReferenceAccount(
  id: string,
  payload: Partial<{
    name: string;
    platform: string;
    homepageUrl: string;
    domain: string;
    note: string;
  }>,
  timeoutMs = 8000,
): Promise<ReferenceAccount> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/reference-accounts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ReferenceAccount;
  } finally {
    clearTimeout(timer);
  }
}

/** 删除对标账号（软删，需令牌）。 */
export async function deleteReferenceAccount(
  id: string,
  timeoutMs = 8000,
): Promise<{ id: string; deleted: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/reference-accounts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { id: string; deleted: boolean };
  } finally {
    clearTimeout(timer);
  }
}

export type ReferenceImportFormat = 'csv' | 'json' | 'lines';

export interface ImportCandidate {
  index: number;
  name: string;
  platform?: string;
  homepageUrl?: string;
  domain?: string;
  note?: string;
  status: 'new' | 'duplicate';
  existingId?: string;
  reason?: string;
}

export interface ImportPreviewResult {
  dbChecked: boolean;
  parsed: number;
  skipped: string[];
  candidates: ImportCandidate[];
}

/** 导入预览（解析+去重，不落库，需令牌）。 */
export async function previewReferenceImport(
  payload: { format: ReferenceImportFormat; raw: string },
  timeoutMs = 8000,
): Promise<ImportPreviewResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/analysis/reference-accounts/import/preview`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ImportPreviewResult;
  } finally {
    clearTimeout(timer);
  }
}

export interface ImportCommitRow {
  name: string;
  platform?: string;
  homepageUrl?: string;
  domain?: string;
  note?: string;
  action: 'create' | 'skip';
}

export interface ImportCommitResult {
  created: number;
  skipped: number;
  ids: string[];
}

/** 提交导入（按每行 action 创建，需令牌）。 */
export async function commitReferenceImport(
  rows: ImportCommitRow[],
  timeoutMs = 8000,
): Promise<ImportCommitResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/analysis/reference-accounts/import`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify({ rows }),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ImportCommitResult;
  } finally {
    clearTimeout(timer);
  }
}

// ============ 素材导入（T2.2）============

export type MaterialImportFormat = 'csv' | 'json' | 'markdown' | 'lines' | 'form' | 'excel';

export interface MaterialImportCandidate {
  index: number;
  title: string;
  body: string;
  sourceUrl?: string;
  author?: string;
  collectedAt?: string;
  licenseNote?: string;
  fingerprint: string;
  status: 'new' | 'duplicate';
  existingId?: string;
  reason?: string;
  batchDuplicateOf?: number;
  action: 'create' | 'skip' | 'merge' | 'copy';
}

export interface MaterialImportPreviewResult {
  dbChecked: boolean;
  parsed: number;
  skipped: string[];
  candidates: MaterialImportCandidate[];
}

/** 素材导入预览（解析+指纹去重，不落库，需令牌）。 */
export async function previewMaterialImport(
  payload: { referenceAccountId: string; format: MaterialImportFormat; raw: string },
  timeoutMs = 8000,
): Promise<MaterialImportPreviewResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/analysis/materials/import/preview`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as MaterialImportPreviewResult;
  } finally {
    clearTimeout(timer);
  }
}

export interface MaterialImportCommitRow {
  action: 'create' | 'skip' | 'merge' | 'copy';
  title: string;
  body?: string;
  sourceUrl?: string;
  author?: string;
  collectedAt?: string;
  licenseNote?: string;
  existingId?: string;
}

export interface MaterialImportCommitResult {
  created: number;
  skipped: number;
  ids: string[];
}

/** 提交素材导入（按每行 action 三选一：跳过/合并/副本，需令牌）。 */
export async function commitMaterialImport(
  referenceAccountId: string,
  rows: MaterialImportCommitRow[],
  timeoutMs = 8000,
): Promise<MaterialImportCommitResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/analysis/materials/import`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify({ referenceAccountId, rows }),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as MaterialImportCommitResult;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- T2.3 单篇拆解（ANALYSIS_SINGLE）----------

export interface AnalysisItem {
  id: string;
  kind: string;
  materialId?: string | null;
  accountId?: string | null;
  structured: Record<string, unknown> | null;
  version: number;
  createdAt: string;
}

export interface AnalysisRunItem {
  id: string;
  type: string;
  status: string;
  scope: Record<string, unknown> | null;
  model?: string | null;
  output?: Record<string, unknown> | null;
  createdAt: string;
  analyses?: AnalysisItem[];
}

export interface DecomposeResult {
  taskId: string;
  dispatched: boolean;
}

/** 触发单篇拆解（异步任务，返回 taskId；需令牌）。 */
export async function decomposeMaterial(
  materialId: string,
  timeoutMs = 8000,
): Promise<DecomposeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/analysis/materials/${encodeURIComponent(materialId)}/decompose`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as DecomposeResult;
  } finally {
    clearTimeout(timer);
  }
}

/** 某素材的全部拆解结果（需令牌）。 */
export async function listAnalysesForMaterial(
  materialId: string,
  timeoutMs = 8000,
): Promise<AnalysisItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/analysis/materials/${encodeURIComponent(materialId)}/analyses`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AnalysisItem[];
  } finally {
    clearTimeout(timer);
  }
}

/** 拆解任务列表（AnalysisRun, type=single，需令牌）。 */
export async function listAnalysisRuns(timeoutMs = 8000): Promise<AnalysisRunItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/analysis/runs`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AnalysisRunItem[];
  } finally {
    clearTimeout(timer);
  }
}

// ---------- T2.4 账号级汇总（ANALYSIS_ACCOUNT_SUMMARY）→ 策略草稿 ----------

export interface SummarizeResult {
  taskId: string;
  dispatched: boolean;
}

/** 触发账号级汇总（聚合选中拆解 → 产出策略草稿，异步任务，返回 taskId；需令牌）。 */
export async function summarizeAccount(
  ownedAccountId: string,
  analysisIds: string[],
  timeoutMs = 8000,
): Promise<SummarizeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/analysis/accounts/${encodeURIComponent(ownedAccountId)}/summary`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify({ analysisIds }),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as SummarizeResult;
  } finally {
    clearTimeout(timer);
  }
}

/** 账号级汇总任务列表（AnalysisRun, type=account_summary，需令牌）。 */
export async function listAccountRuns(timeoutMs = 8000): Promise<AnalysisRunItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/analysis/account-runs`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AnalysisRunItem[];
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 策略版本（T1.7 后端 + T2.4 前端：查看/编辑/设默认）----------

export type StrategyJson = Record<string, unknown>;

export interface StrategyItem {
  id: string;
  ownedAccountId: string;
  version: number;
  status: string;
  isDefault: boolean;
  position: StrategyJson;
  audience: StrategyJson;
  pillars: unknown[];
  titlePref: StrategyJson;
  structure: unknown;
  tone: StrategyJson;
  boundaries: unknown[];
  sourceAnalysisIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type StrategyUpdateDto = Partial<{
  status: string;
  position: StrategyJson;
  audience: StrategyJson;
  pillars: unknown[];
  titlePref: StrategyJson;
  structure: unknown;
  tone: StrategyJson;
  boundaries: unknown[];
  sourceAnalysisIds: string[];
}>;

/** 某自有账号的策略版本列表（按 version 倒序，需令牌）。 */
export async function listStrategies(
  ownedAccountId: string,
  timeoutMs = 8000,
): Promise<StrategyItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/strategies?ownedAccountId=${encodeURIComponent(ownedAccountId)}`,
      {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...authHeader() },
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as StrategyItem[];
  } finally {
    clearTimeout(timer);
  }
}

/** 单条策略版本明细（需令牌）。 */
export async function getStrategy(id: string, timeoutMs = 8000): Promise<StrategyItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/strategies/${encodeURIComponent(id)}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as StrategyItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新策略版本字段/状态（需令牌）。设默认/绑定账号统一走 bindStrategy。 */
export async function updateStrategy(
  id: string,
  dto: StrategyUpdateDto,
  timeoutMs = 8000,
): Promise<StrategyItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/strategies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(dto),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as StrategyItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 绑定某策略版本为自有账号的当前默认策略（T2.5，需令牌）。strategyId 为 null 表示解绑。 */
export async function bindStrategy(
  ownedAccountId: string,
  strategyId: string | null,
  timeoutMs = 8000,
): Promise<{ id: string; defaultStrategyVersionId: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/owned-accounts/${encodeURIComponent(ownedAccountId)}/bind-strategy`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify({ strategyId }),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { id: string; defaultStrategyVersionId: string | null };
  } finally {
    clearTimeout(timer);
  }
}

// ============ 选题 / 标题管理（T3.1）============

export type TopicStatus = 'draft' | 'active' | 'archived';
export type TopicSourceType = 'manual' | 'ai_gen' | 'derived';
export type TitleStatus = 'draft' | 'selected' | 'rejected';

export interface TopicItem {
  id: string;
  strategyId: string | null;
  analysisId: string | null;
  title: string;
  audience: string | null;
  angle: string | null;
  status: TopicStatus;
  tags: unknown;
  sourceType: TopicSourceType;
  createdAt: string;
  updatedAt: string;
}

export interface TitleCandidateItem {
  id: string;
  topicId: string;
  text: string;
  basis: string | null;
  score: number | null;
  tags: unknown;
  selected: boolean;
  status: TitleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateResult {
  taskId: string;
  dispatched: boolean;
}

/** 选题列表（可按 strategyId/analysisId/status 过滤，需令牌）。 */
export async function listTopics(
  params: { strategyId?: string; analysisId?: string; status?: string } = {},
  timeoutMs = 8000,
): Promise<TopicItem[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/topics${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TopicItem[];
  } finally {
    clearTimeout(timer);
  }
}

/** 新建选题（需令牌）。 */
export async function createTopic(
  payload: {
    title: string;
    sourceType: TopicSourceType;
    strategyId?: string;
    analysisId?: string;
    audience?: string;
    angle?: string;
    tags?: unknown;
    status?: TopicStatus;
  },
  timeoutMs = 8000,
): Promise<TopicItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/topics`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TopicItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新选题（需令牌）。 */
export async function updateTopic(
  id: string,
  dto: Partial<{
    title: string;
    audience: string;
    angle: string;
    status: TopicStatus;
    sourceType: TopicSourceType;
    tags: unknown;
  }>,
  timeoutMs = 8000,
): Promise<TopicItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/topics/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(dto),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TopicItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 删除选题（软删，需令牌）。 */
export async function deleteTopic(
  id: string,
  timeoutMs = 8000,
): Promise<{ id: string; deleted: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/topics/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { id: string; deleted: boolean };
  } finally {
    clearTimeout(timer);
  }
}

/** 触发选题生成（TOPIC_GEN，异步任务，返回 taskId；需令牌）。 */
export async function generateTopics(
  payload: { strategyId?: string; analysisId?: string; count?: number },
  timeoutMs = 8000,
): Promise<GenerateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/topics/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as GenerateResult;
  } finally {
    clearTimeout(timer);
  }
}

/** 某选题下的标题候选列表（需令牌）。 */
export async function listTitles(
  topicId: string,
  timeoutMs = 8000,
): Promise<TitleCandidateItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/topics/${encodeURIComponent(topicId)}/titles`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TitleCandidateItem[];
  } finally {
    clearTimeout(timer);
  }
}

/** 新建标题候选（需令牌）。 */
export async function createTitle(
  topicId: string,
  payload: {
    text: string;
    basis?: string;
    score?: number;
    tags?: unknown;
    status?: TitleStatus;
  },
  timeoutMs = 8000,
): Promise<TitleCandidateItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/topics/${encodeURIComponent(topicId)}/titles`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TitleCandidateItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新标题候选（需令牌）。 */
export async function updateTitle(
  topicId: string,
  titleId: string,
  dto: Partial<{
    text: string;
    basis: string;
    score: number;
    status: TitleStatus;
    tags: unknown;
  }>,
  timeoutMs = 8000,
): Promise<TitleCandidateItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/topics/${encodeURIComponent(topicId)}/titles/${encodeURIComponent(titleId)}`,
      {
        method: 'PATCH',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify(dto),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TitleCandidateItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 删除标题候选（物理删除，需令牌）。 */
export async function deleteTitle(
  topicId: string,
  titleId: string,
  timeoutMs = 8000,
): Promise<{ id: string; deleted: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/topics/${encodeURIComponent(topicId)}/titles/${encodeURIComponent(titleId)}`,
      {
        method: 'DELETE',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...authHeader() },
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { id: string; deleted: boolean };
  } finally {
    clearTimeout(timer);
  }
}

/** 选中某标题（互斥，需令牌）。 */
export async function selectTitle(
  topicId: string,
  titleId: string,
  timeoutMs = 8000,
): Promise<TitleCandidateItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/topics/${encodeURIComponent(topicId)}/titles/${encodeURIComponent(titleId)}/select`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...authHeader() },
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TitleCandidateItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 触发标题生成（TITLE_GEN，异步任务，返回 taskId；需令牌）。 */
export async function generateTitles(
  topicId: string,
  payload: { count?: number } = {},
  timeoutMs = 8000,
): Promise<GenerateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/topics/${encodeURIComponent(topicId)}/titles/generate`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify(payload),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在上方输入框粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as GenerateResult;
  } finally {
    clearTimeout(timer);
  }
}

// ============ 内容项目（T3.2：选中标题一键建内容项目）============

export type ContentProjectStatus =
  | 'TOPIC_SELECTING'
  | 'PENDING_CREATION'
  | 'CREATING'
  | 'PENDING_REVIEW'
  | 'NEEDS_REVISION'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED';

// T3.9 公众号发布状态：草稿已同步 / 已发布 / 已登记定时 / 失败
export type WeChatPublishStatus = 'DRAFT_SYNCED' | 'PUBLISHED' | 'SCHEDULED' | 'FAILED' | null;
export type ContentType = 'article' | 'image';

export interface ContentProjectItem {
  id: string;
  platform: string;
  ownedAccountId: string;
  ownedAccount?: { id: string; name: string } | null;
  topicId: string | null;
  topic?: { id: string; title: string } | null;
  selectedTitleId: string | null;
  strategyVersionId: string | null;
  contentType: ContentType;
  status: ContentProjectStatus;
  contextSnapshot: Record<string, unknown> | null;
  promptTemplateVersionId: string | null;
  // T3.9 公众号发布回写字段
  externalMediaId?: string | null;
  publishStatus?: WeChatPublishStatus;
  publishError?: string | null;
  scheduledAt?: string | null;
  publishTaskId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectResult {
  id: string;
  ownedAccountId: string;
  topicId: string;
  selectedTitleId: string;
  strategyVersionId: string | null;
  status: ContentProjectStatus;
}

/** 选中标题一键建内容项目（自动继承账号/策略/选题/标题，需令牌）。 */
export async function createContentProjectFromTitle(
  titleCandidateId: string,
  timeoutMs = 8000,
): Promise<CreateProjectResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify({ titleCandidateId }),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as CreateProjectResult;
  } finally {
    clearTimeout(timer);
  }
}

/** 内容项目列表（可按 ownedAccountId / status 过滤，需令牌）。 */
export async function listContentProjects(
  params: { ownedAccountId?: string; status?: string } = {},
  timeoutMs = 8000,
): Promise<ContentProjectItem[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentProjectItem[];
  } finally {
    clearTimeout(timer);
  }
}

// ============ 创作上下文面板 / AI 操作入口（T3.3）============

export type ProjectStage = 'draft' | 'continue' | 'rewrite' | 'compress' | 'expand';

/** 创作上下文面板数据（继承的「依据」）。 */
export interface ProjectContext {
  account: { id: string; name: string } | null;
  title: { text: string; basis: string | null } | null;
  topic: { title: string; audience: string | null; angle: string | null; tags: unknown } | null;
  strategy: { id: string; version: number; summary: string } | null;
  promptTemplate: { id: string; version: number } | null;
  analysisSummary: string;
  /** 各字段来源标记（T5.2）：snapshot=创建时定格，live=实时绑定投影。 */
  fieldOrigins: Record<string, 'snapshot' | 'live'>;
}

/** 刷新内容项目上下文快照（重新定格标题/选题/策略/分析，并指向当前平台最新模板；需令牌）。 */
export async function refreshContentProjectContext(
  id: string,
  timeoutMs = 8000,
): Promise<ProjectContext> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/refresh-context`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ProjectContext;
  } finally {
    clearTimeout(timer);
  }
}

/** 读取内容项目继承的「依据」（需令牌）。 */
export async function getContentProjectContext(
  id: string,
  timeoutMs = 8000,
): Promise<ProjectContext> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/context`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ProjectContext;
  } finally {
    clearTimeout(timer);
  }
}

/** 触发内容项目 AI 生成（ARTICLE_GEN 异步任务，T3.5 注册处理器；需令牌）。 */
export async function triggerProjectGeneration(
  id: string,
  stage: ProjectStage,
  model?: string,
  timeoutMs = 8000,
): Promise<{ taskId: string; dispatched: boolean; stage: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(model ? { stage, model } : { stage }),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { taskId: string; dispatched: boolean; stage: string };
  } finally {
    clearTimeout(timer);
  }
}

// ============ 内容项目详情 / 版本链（T3.4）============

export interface ContentProjectDetail {
  id: string;
  workingContent: string | null;
  currentVersionId: string | null;
  status: ContentProjectStatus;
  contentType: ContentType;
  publishedAt: string | null;
  externalUrl: string | null;
  aiGenerated: boolean;
  aiDeclaration: string | null;
  publishNote: string | null;
  // T3.9 公众号发布回写字段
  externalMediaId?: string | null;
  publishStatus?: WeChatPublishStatus;
  publishError?: string | null;
  scheduledAt?: string | null;
  publishTaskId?: string | null;
  selectedTitle?: { id: string; text: string } | null;
}

// ============ T3.11 合规预审（广告法极限词/敏感词，送审前自动标红硬卡点）============

export type ComplianceSeverity = 'blocking' | 'warning';

/** 单条命中明细（含原文位置，供标红）。 */
export interface ComplianceMatch {
  word: string;
  category: 'absolute' | 'sensitive';
  severity: ComplianceSeverity;
  start: number;
  end: number;
  suggestion?: string;
}

/** 标红分段：hit=true 的片段即风险词。 */
export interface ComplianceHighlightSegment {
  text: string;
  hit: boolean;
  severity?: ComplianceSeverity;
  suggestion?: string;
}

/** 合规预审结果。 */
export interface ComplianceCheckResult {
  checkId: string;
  projectId: string;
  versionId: string | null;
  passed: boolean;
  riskCount: number;
  blockingCount: number;
  warningCount: number;
  maxSeverity: ComplianceSeverity | null;
  service: string;
  summary: string | null;
  matches: ComplianceMatch[];
  highlights: ComplianceHighlightSegment[];
  checkedAt: string;
}

/** 读取内容项目明细（含 workingContent / currentVersionId，供编辑器初始化；需令牌）。 */
export async function getContentProject(
  id: string,
  timeoutMs = 8000,
): Promise<ContentProjectDetail> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentProjectDetail;
  } finally {
    clearTimeout(timer);
  }
}

/** 自动保存编辑器缓冲（workingContent，不入版本历史；需令牌）。 */
export async function updateContentProject(
  id: string,
  patch: {
    workingContent?: string;
    status?: ContentProjectStatus;
    contentType?: ContentType;
    externalUrl?: string;
    aiGenerated?: boolean;
    aiDeclaration?: string;
  },
  timeoutMs = 8000,
): Promise<ContentProjectDetail> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(patch),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentProjectDetail;
  } finally {
    clearTimeout(timer);
  }
}

// ============ T3.8 复制/导出 + 发布信息录入 + AI 生成标识声明入口 ============

export interface ExportProjectResult {
  filename: string;
  content: string;
}

/** 导出内容项目为规范 Markdown（含 AI 声明页脚；需令牌）。前端据 filename 下载 .md / 复制纯文本。 */
export async function exportContentProject(
  id: string,
  timeoutMs = 8000,
): Promise<ExportProjectResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/export`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ExportProjectResult;
  } finally {
    clearTimeout(timer);
  }
}

export type PublishStatus = 'PUBLISHED' | 'ARCHIVED';

export interface RecordPublicationPayload {
  publishedAt?: string;
  externalUrl?: string;
  publishNote?: string;
  status?: PublishStatus;
}

/** 手动记录发布信息（APPROVED → PUBLISHED/ARCHIVED；需令牌）。 */
export async function recordPublication(
  id: string,
  payload: RecordPublicationPayload,
  timeoutMs = 8000,
): Promise<ContentProjectDetail> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/publication`,
      {
        method: 'PATCH',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify(payload),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentProjectDetail;
  } finally {
    clearTimeout(timer);
  }
}

// ============ T3.9 公众号发布执行（草稿箱同步 / 发布 / 群发 / 状态）============

export interface WeChatPublishState {
  status: string | null;
  publishStatus: WeChatPublishStatus;
  externalMediaId: string | null;
  externalUrl: string | null;
  publishError: string | null;
  scheduledAt: string | null;
  publishTaskId: string | null;
}

/** 同步草稿箱（add_draft），回写 media_id。 */
export async function syncWeChatDraft(id: string, timeoutMs = 20000): Promise<ContentProjectDetail> {
  return wechatPost(`content-projects/${encodeURIComponent(id)}/publish/sync-draft`, {}, timeoutMs);
}

/** 正式发布（freepublish），回写文章链接。 */
export async function submitWeChatPublish(id: string, timeoutMs = 30000): Promise<ContentProjectDetail> {
  return wechatPost(`content-projects/${encodeURIComponent(id)}/publish/submit`, {}, timeoutMs);
}

/** 群发（可定时），回写 msg_id / 定时状态。 */
export async function massWeChatPublish(
  id: string,
  payload: { scheduleTime?: string },
  timeoutMs = 20000,
): Promise<ContentProjectDetail> {
  return wechatPost(`content-projects/${encodeURIComponent(id)}/publish/mass`, payload, timeoutMs);
}

/** T3.9 公众号发布专用 POST（统一令牌 + 错误语义）。 */
async function wechatPost(
  path: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<ContentProjectDetail> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentProjectDetail;
  } finally {
    clearTimeout(timer);
  }
}

/** 读取当前发布状态。 */
export async function getWeChatPublishState(id: string, timeoutMs = 8000): Promise<WeChatPublishState> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/publish/state`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as WeChatPublishState;
  } finally {
    clearTimeout(timer);
  }
}

export interface ContentVersionItem {
  id: string;
  projectId: string;
  versionNo: number;
  content: string;
  source: string;
  note: string | null;
  createdById: string | null;
  createdBy?: { id: string; username: string } | null;
  createdAt: string;
}

/** 显式保存版本（落一条 ContentVersion + 置 currentVersionId；需令牌）。 */
export async function saveContentVersion(
  id: string,
  body: { content: string; note?: string; source?: string },
  timeoutMs = 8000,
): Promise<ContentVersionItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/versions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(body),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentVersionItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 版本历史列表（versionNo 倒序；需令牌）。 */
export async function listContentVersions(
  id: string,
  timeoutMs = 8000,
): Promise<ContentVersionItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/versions`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentVersionItem[];
  } finally {
    clearTimeout(timer);
  }
}

/** 恢复某版本（设 currentVersionId + 还原 workingContent；需令牌）。 */
export async function restoreContentVersion(
  id: string,
  versionId: string,
  timeoutMs = 8000,
): Promise<ContentVersionItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...authHeader() },
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentVersionItem;
  } finally {
    clearTimeout(timer);
  }
}

// ============ 生成运行记录 / 采纳·放弃 staging 版本（T3.5）============

export interface GenerationRunItem {
  id: string;
  projectId: string;
  stage: string;
  model: string;
  status: string;
  promptTemplateVersionId: string | null;
  outputVersionId: string | null;
  cost: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  outputVersion?: { id: string; versionNo: number; source: string } | null;
}

/** 内容项目的生成运行记录（GenerationRun，按创建时间倒序，供查看生成状态/结果；需令牌）。 */
export async function listGenerationRuns(
  projectId: string,
  timeoutMs = 8000,
): Promise<GenerationRunItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(projectId)}/generation-runs`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json', ...authHeader() },
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as GenerationRunItem[];
  } finally {
    clearTimeout(timer);
  }
}

/** 采纳 staging 版本（设 currentVersionId + 还原工作缓冲；需令牌）。 */
export async function adoptContentVersion(
  id: string,
  versionId: string,
  timeoutMs = 8000,
): Promise<ContentVersionItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/adopt`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...authHeader() },
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentVersionItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 放弃 staging 版本（硬删，需非当前生效版本；需令牌）。 */
export async function discardContentVersion(
  id: string,
  versionId: string,
  timeoutMs = 8000,
): Promise<{ id: string; deleted: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`,
      {
        method: 'DELETE',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...authHeader() },
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { id: string; deleted: boolean };
  } finally {
    clearTimeout(timer);
  }
}

// ============ 审核状态机（T3.6）============

export interface ReviewChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  note?: string | null;
}

export interface ContentReview {
  id: string;
  projectId: string;
  checklist: ReviewChecklistItem[];
  comment: string | null;
  decidedById: string | null;
  decidedBy?: { id: string; username: string } | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 审核状态中文标签（复用内容项目状态枚举的审核相关取值）。 */
export const REVIEW_STATUS_LABELS: Record<string, string> = {
  TOPIC_SELECTING: '选题中',
  PENDING_CREATION: '待创建',
  CREATING: '创作中',
  PENDING_REVIEW: '待审核',
  NEEDS_REVISION: '需修改',
  APPROVED: '已审核',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
};

/** 读取内容项目审核记录（清单 + 意见 + 决定人/时间；需令牌）。 */
export async function getContentProjectReview(
  id: string,
  timeoutMs = 8000,
): Promise<ContentReview> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/review`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentReview;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新审核清单（整体替换；需令牌）。 */
export async function updateReviewChecklist(
  id: string,
  items: ReviewChecklistItem[],
  timeoutMs = 8000,
): Promise<ContentReview> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/review/checklist`,
      {
        method: 'PATCH',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify({ items }),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentReview;
  } finally {
    clearTimeout(timer);
  }
}

/** 标记待审核（CREATING/NEEDS_REVISION → PENDING_REVIEW；需令牌）。
 * opts.overrideCompliance=true 时，即使合规预审存在阻断级风险词也强制送审。 */
export async function submitForReview(
  id: string,
  opts?: { overrideCompliance?: boolean },
  timeoutMs = 8000,
): Promise<ContentProjectDetail> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/review/submit`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify({ overrideCompliance: opts?.overrideCompliance ?? false }),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) {
      // 尝试解析结构化错误（如合规预审拦截 COMPLIANCE_BLOCKED），否则回退状态码
      try {
        const body = await res.json();
        if (body && body.message) throw new Error(body.message);
      } catch {
        /* 非 JSON 错误体，忽略 */
      }
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as ContentProjectDetail;
  } finally {
    clearTimeout(timer);
  }
}

/** T3.11 运行合规预审（同步、离线确定性）：对当前/指定版本正文扫描，返回命中与标红分段（需令牌）。 */
export async function checkCompliance(
  id: string,
  opts?: { versionId?: string; content?: string },
  timeoutMs = 8000,
): Promise<ComplianceCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/compliance/check`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify({ versionId: opts?.versionId ?? null, content: opts?.content ?? null }),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ComplianceCheckResult;
  } finally {
    clearTimeout(timer);
  }
}

/** 退回修改（PENDING_REVIEW → NEEDS_REVISION，需退回意见；需令牌）。 */
export async function sendBackForRevision(
  id: string,
  comment: string,
  timeoutMs = 8000,
): Promise<ContentProjectDetail> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/review/send-back`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify({ comment }),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentProjectDetail;
  } finally {
    clearTimeout(timer);
  }
}

/** 审核通过（PENDING_REVIEW/NEEDS_REVISION → APPROVED，清单需全勾选；需令牌）。 */
export async function approveReview(
  id: string,
  timeoutMs = 8000,
): Promise<ContentProjectDetail> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(id)}/review/approve`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...authHeader() },
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ContentProjectDetail;
  } finally {
    clearTimeout(timer);
  }
}

// ============ 朱雀检测 / 第三方润色（T3.7）============

export type TextReviewDecision = 'accepted' | 'ignored' | 'flagged';

export interface TextReviewRunItem {
  id: string;
  projectId: string;
  versionId: string;
  service: string;
  summary: string | null;
  detectedAt: string | null;
  status: string;
  userDecision: TextReviewDecision | null;
  serviceVersion: string | null;
  /** 文章后续修改后，旧结果自动标「旧版本结果」。 */
  stale: boolean;
}

/** 触发对某版本的检测（TEXT_DETECT，绑定版本不改文；需令牌）。 */
export async function detectVersion(
  projectId: string,
  versionId: string,
  opts: { service?: string; model?: string } = {},
  timeoutMs = 8000,
): Promise<{ taskId: string; dispatched: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/detect`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify(opts),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { taskId: string; dispatched: boolean };
  } finally {
    clearTimeout(timer);
  }
}

/** 列出内容项目的检测记录（含旧版本标记与用户决定；需令牌）。 */
export async function listTextReviews(
  projectId: string,
  timeoutMs = 8000,
): Promise<TextReviewRunItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(projectId)}/text-reviews`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json', ...authHeader() },
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TextReviewRunItem[];
  } finally {
    clearTimeout(timer);
  }
}

/** 记录对某条检测结果的决策（accepted/ignored/flagged；需令牌）。 */
export async function decideTextReview(
  projectId: string,
  runId: string,
  decision: TextReviewDecision,
  timeoutMs = 8000,
): Promise<TextReviewRunItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(projectId)}/text-reviews/${encodeURIComponent(runId)}/decision`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify({ decision }),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TextReviewRunItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 触发生成润色（TEXT_POLISH，原稿不变；结果写 polish staging 版本待采纳/放弃；需令牌）。 */
export async function polishProject(
  projectId: string,
  opts: { model?: string; tone?: string } = {},
  timeoutMs = 8000,
): Promise<{ taskId: string; dispatched: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/content-projects/${encodeURIComponent(projectId)}/polish`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify(opts),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { taskId: string; dispatched: boolean };
  } finally {
    clearTimeout(timer);
  }
}

// ==================== 起号计划（T4.1 图文起号计划） ====================

export type LaunchPlanType = 'article' | 'image';
export type LaunchPlanStatus = 'draft' | 'active' | 'paused' | 'done';
export type LaunchTaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

export interface LaunchTask {
  id: string;
  planId: string;
  type: LaunchPlanType;
  title: string | null;
  caption: string | null;
  materialRefs: unknown;
  projectId: string | null;
  status: LaunchTaskStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  imageItems?: LaunchImageItem[];
}

/** 图片组中的单张图片（T4.2 贴图起号计划）。 */
export interface LaunchImageItem {
  id: string;
  taskId: string;
  assetId: string;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
}

/** 媒体资产（用于图片组选图 / 预览），来自 /api/media 列表。 */
export interface MediaAssetItem {
  id: string;
  ownerType: string;
  ownerId: string;
  filePath: string;
  checksum: string;
  type: string;
  size: number;
  source: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface LaunchPlan {
  id: string;
  ownedAccountId: string;
  type: LaunchPlanType;
  goal: string;
  start: string | null;
  end: string | null;
  frequency: string | null;
  status: LaunchPlanStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  tasks?: LaunchTask[];
  _count?: { tasks: number };
}

export interface LaunchPlanProgress {
  total: number;
  byStatus: Record<string, number>;
  done: number;
  completionRate: number;
  linked: number;
}

/** 列出起号计划（可按 ownedAccountId / type 过滤）。 */
export async function listLaunchPlans(
  params: { ownedAccountId?: string; type?: string } = {},
  timeoutMs = 8000,
): Promise<LaunchPlan[]> {
  const qs = new URLSearchParams();
  if (params.ownedAccountId) qs.set('ownedAccountId', params.ownedAccountId);
  if (params.type) qs.set('type', params.type);
  const query = qs.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/plans${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchPlan[];
  } finally {
    clearTimeout(timer);
  }
}

/** 创建起号计划（T4.1）。 */
export async function createLaunchPlan(
  payload: { ownedAccountId: string; type: LaunchPlanType; goal: string; start?: string; end?: string; frequency?: string; status?: LaunchPlanStatus },
  timeoutMs = 8000,
): Promise<LaunchPlan> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/plans`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchPlan;
  } finally {
    clearTimeout(timer);
  }
}

/** 获取计划详情（含任务列表）。 */
export async function getLaunchPlan(id: string, timeoutMs = 8000): Promise<LaunchPlan> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/plans/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchPlan;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新计划（部分字段）。 */
export async function updateLaunchPlan(
  id: string,
  payload: Partial<{ type: LaunchPlanType; goal: string; start: string; end: string; frequency: string; status: LaunchPlanStatus }>,
  timeoutMs = 8000,
): Promise<LaunchPlan> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/plans/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchPlan;
  } finally {
    clearTimeout(timer);
  }
}

/** 删除计划（软删）+ 清理其子任务。 */
export async function deleteLaunchPlan(id: string, timeoutMs = 8000): Promise<{ id: string; deleted: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/plans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { id: string; deleted: boolean };
  } finally {
    clearTimeout(timer);
  }
}

/** 计划级对账：按关联项目发布状态推导各任务状态并返回进度。 */
export async function syncLaunchPlan(id: string, timeoutMs = 8000): Promise<LaunchPlanProgress> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/plans/${encodeURIComponent(id)}/sync`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchPlanProgress;
  } finally {
    clearTimeout(timer);
  }
}

/** 计划进度统计。 */
export async function getLaunchPlanProgress(id: string, timeoutMs = 8000): Promise<LaunchPlanProgress> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/plans/${encodeURIComponent(id)}/progress`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchPlanProgress;
  } finally {
    clearTimeout(timer);
  }
}

/** 在计划下创建任务。 */
export async function createLaunchTask(
  planId: string,
  payload: { type: LaunchPlanType; title?: string; caption?: string; materialRefs?: unknown; projectId?: string; scheduledAt?: string },
  timeoutMs = 8000,
): Promise<LaunchTask> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/plans/${encodeURIComponent(planId)}/tasks`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchTask;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新任务（可关联/解除关联项目、改状态等）。 */
export async function updateLaunchTask(
  taskId: string,
  payload: Partial<{ type: LaunchPlanType; title: string; caption: string; materialRefs: unknown; projectId: string | null; status: LaunchTaskStatus; scheduledAt: string }>,
  timeoutMs = 8000,
): Promise<LaunchTask> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchTask;
  } finally {
    clearTimeout(timer);
  }
}

/** 删除任务。 */
export async function deleteLaunchTask(taskId: string, timeoutMs = 8000): Promise<{ id: string; deleted: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { id: string; deleted: boolean };
  } finally {
    clearTimeout(timer);
  }
}

/** 单任务按关联项目状态推导（状态随项目更新）。 */
export async function syncLaunchTask(taskId: string, timeoutMs = 8000): Promise<LaunchTask> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/tasks/${encodeURIComponent(taskId)}/sync`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchTask;
  } finally {
    clearTimeout(timer);
  }
}

// ============ 内容日历（T4.4）============

export type CalendarKind = 'topic' | 'title' | 'content' | 'launch';

export interface CalendarItem {
  kind: CalendarKind;
  id: string;
  title: string;
  status: string | null;
  /** 锚点日期，本地 YYYY-MM-DD。 */
  date: string;
  accountName: string | null;
  /** 前端跳转路由。 */
  link: string;
}

export interface CalendarResult {
  items: CalendarItem[];
  range: { from: string; to: string };
}

export const CALENDAR_KIND_LABELS: Record<CalendarKind, string> = {
  topic: '选题',
  title: '标题',
  content: '内容项目',
  launch: '起号任务',
};

/** 内容日历聚合（按日期范围拉取四类条目；需令牌）。 */
export async function fetchCalendar(
  params: { from?: string; to?: string; ownedAccountId?: string } = {},
  timeoutMs = 10000,
): Promise<CalendarResult> {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.ownedAccountId) qs.set('ownedAccountId', params.ownedAccountId);
  const query = qs.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/calendar${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as CalendarResult;
  } finally {
    clearTimeout(timer);
  }
}

/** 拖拽改期：按 kind 回写对应实体的日期字段（需令牌）。 */
export async function rescheduleCalendarItem(
  kind: CalendarKind,
  id: string,
  date: string,
  timeoutMs = 8000,
): Promise<CalendarItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/${apiPrefix()}/calendar/items/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
        body: JSON.stringify({ date }),
      },
    );
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (res.status === 404) throw new Error('该日历项不存在或不属于当前用户');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as CalendarItem;
  } finally {
    clearTimeout(timer);
  }
}

// ============ 图片组（T4.2 贴图起号计划） ============

/** 列出某图片组（任务）的有序图片项。 */
export async function listLaunchImageItems(taskId: string, timeoutMs = 8000): Promise<LaunchImageItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/tasks/${encodeURIComponent(taskId)}/images`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchImageItem[];
  } finally {
    clearTimeout(timer);
  }
}

/** 向图片组新增一张图片。 */
export async function addLaunchImageItem(
  taskId: string,
  payload: { assetId: string; caption?: string; sortOrder?: number },
  timeoutMs = 8000,
): Promise<LaunchImageItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/tasks/${encodeURIComponent(taskId)}/images`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchImageItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新图片组中单张图片的配文或顺序。 */
export async function updateLaunchImageItem(
  taskId: string,
  itemId: string,
  payload: { caption?: string; sortOrder?: number },
  timeoutMs = 8000,
): Promise<LaunchImageItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchImageItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 删除图片组中的一张图片。 */
export async function deleteLaunchImageItem(taskId: string, itemId: string, timeoutMs = 8000): Promise<{ id: string; deleted: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { id: string; deleted: boolean };
  } finally {
    clearTimeout(timer);
  }
}

/** 拖拽重排图片组：提交拖拽后的完整 id 顺序。 */
export async function reorderLaunchImageItems(
  taskId: string,
  orderedIds: string[],
  timeoutMs = 8000,
): Promise<LaunchImageItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/launch/tasks/${encodeURIComponent(taskId)}/images/reorder`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify({ orderedIds }),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LaunchImageItem[];
  } finally {
    clearTimeout(timer);
  }
}

/** 列出媒体资产（用于图片组选图）。可按 type 过滤（如 image）。 */
export async function listMediaAssets(
  params: { type?: string; take?: number } = {},
  timeoutMs = 8000,
): Promise<MediaAssetItem[]> {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.take) qs.set('take', String(params.take));
  const query = qs.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/media${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { items?: MediaAssetItem[]; persisted?: boolean };
    return body.items ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/** 媒体资产预览/原图地址（鉴权由 http 拦截器自动附带）。 */
export function mediaFileUrl(assetId: string): string {
  return `/${apiPrefix()}/media/${encodeURIComponent(assetId)}/file`;
}

export interface OwnedAccountItem {
  id: string;
  name: string;
  platform: string;
  status: string;
  /** 以下为详情字段（列表接口同样返回），供「账号与策略」面板编辑定位/受众/栏目。 */
  position?: unknown;
  audience?: unknown;
  columns?: unknown;
  defaultStrategyVersionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 列出当前用户的自有账号（新建起号计划时选择归属账号）。 */
export async function listOwnedAccounts(timeoutMs = 8000): Promise<OwnedAccountItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/owned-accounts`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as OwnedAccountItem[];
  } finally {
    clearTimeout(timer);
  }
}

// ============ 账号与策略面板（前端补齐：OwnedAccount CRUD + 策略版本创建/删除）============

export type OwnedAccountStatus = 'active' | 'paused' | 'archived';

export interface OwnedAccountPayload {
  name: string;
  platform?: 'wechat';
  status?: OwnedAccountStatus;
  position?: unknown;
  audience?: unknown;
  columns?: unknown;
}

export interface CreateStrategyPayload {
  ownedAccountId: string;
  version?: number;
  status?: 'draft' | 'active' | 'archived';
  position?: StrategyJson;
  audience?: StrategyJson;
  pillars?: unknown;
  titlePref?: StrategyJson;
  structure?: unknown;
  tone?: StrategyJson;
  boundaries?: unknown;
  sourceAnalysisIds?: string[];
}

/**
 * 账号域统一请求：令牌、超时、401/404 语义与结构化错误信息。
 * path 相对 API 前缀，由调用方对动态段做 encodeURIComponent。
 */
async function accountRequest<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeader(),
      },
    });
    if (res.status === 401) {
      throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    }
    if (res.status === 404) throw new Error('记录不存在或不属于当前用户');
    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { message?: unknown; error?: unknown };
        const msg = body?.message;
        detail = Array.isArray(msg)
          ? msg.join('；')
          : String(msg ?? body?.error ?? '');
      } catch {
        /* 非 JSON 错误体，回退状态码 */
      }
      throw new Error(`HTTP ${res.status}${detail ? '：' + detail : ''}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 自有账号详情（需令牌）。 */
export function getOwnedAccount(id: string): Promise<OwnedAccountItem> {
  return accountRequest<OwnedAccountItem>(`owned-accounts/${encodeURIComponent(id)}`);
}

/** 新建自有账号（userId 由服务端从令牌注入，需令牌）。 */
export function createOwnedAccount(payload: OwnedAccountPayload): Promise<OwnedAccountItem> {
  return accountRequest<OwnedAccountItem>('owned-accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** 更新自有账号（部分字段，需令牌）。 */
export function updateOwnedAccount(
  id: string,
  dto: Partial<OwnedAccountPayload>,
): Promise<OwnedAccountItem> {
  return accountRequest<OwnedAccountItem>(`owned-accounts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

/** 删除自有账号（软删，需令牌）。 */
export function deleteOwnedAccount(id: string): Promise<{ id: string; deleted: boolean }> {
  return accountRequest<{ id: string; deleted: boolean }>(
    `owned-accounts/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

/** 手动新建策略版本（缺省版本号由服务端取 max+1，需令牌）。 */
export function createStrategy(payload: CreateStrategyPayload): Promise<StrategyItem> {
  return accountRequest<StrategyItem>('strategies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** 删除策略版本（软删；若为默认则服务端顺手清空账号外键，需令牌）。 */
export function deleteStrategy(id: string): Promise<{ id: string; deleted: boolean }> {
  return accountRequest<{ id: string; deleted: boolean }>(
    `strategies/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

// ============ 素材库（T4.3）============

export interface MaterialListItem {
  id: string;
  referenceAccountId: string;
  referenceAccountName: string | null;
  platform: string | null;
  title: string;
  author: string | null;
  sourceUrl: string | null;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  hasAnalysis: boolean;
  isDuplicate: boolean;
  fingerprint: string;
  importedAt: string | null;
  collectedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MaterialSearchResult {
  items: MaterialListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MaterialGraph {
  material: MaterialListItem | null;
  analyses: Array<{ id: string; kind: string; accountId: string | null; createdAt: string | null; topics: Array<{ id: string; title: string }> }>;
  topics: Array<{ id: string; title: string; audience: string | null; status: string }>;
  titleCandidates: Array<{ id: string; text: string; status: string; selected: boolean }>;
  contentProjects: Array<{ id: string; status: string; publishedAt: string | null; generationRuns: Array<{ id: string; stage: string; model: string | null; status: string }>; launchTasks: Array<{ id: string; title: string | null; status: string }> }>;
  generationRuns: Array<{ id: string; stage: string; model: string | null; status: string }>;
  launchTasks: Array<{ id: string; title: string | null; status: string }>;
}

export interface DeletedMaterial {
  id: string;
  title: string;
  referenceAccountId: string;
  deletedAt: string | null;
}

export interface TagCount {
  tag: string;
  count: number;
}

/** 素材库搜索 / 多维度筛选（参数经 params 对象传入，不拼 SQL）。 */
export async function searchMaterials(
  params: Record<string, string | number | boolean | undefined> = {},
  timeoutMs = 8000,
): Promise<MaterialSearchResult> {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '' && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/library/materials${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as MaterialSearchResult;
  } finally {
    clearTimeout(timer);
  }
}

/** 标签聚合（筛选建议）。 */
export async function fetchMaterialTags(timeoutMs = 8000): Promise<TagCount[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/library/materials/tags`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TagCount[];
  } finally {
    clearTimeout(timer);
  }
}

/** 回收站：已软删素材列表。 */
export async function fetchDeletedMaterials(timeoutMs = 8000): Promise<DeletedMaterial[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/library/materials/deleted`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as DeletedMaterial[];
  } finally {
    clearTimeout(timer);
  }
}

/** 关系回溯：素材 → 分析 → 选题 → 标题/项目 → 生成/起号。 */
export async function fetchMaterialGraph(id: string, timeoutMs = 8000): Promise<MaterialGraph> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/library/materials/${encodeURIComponent(id)}/graph`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as MaterialGraph;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新素材标签 / 收藏 / 归档（PATCH）。 */
export async function updateMaterial(
  id: string,
  body: { tags?: string[]; favorite?: boolean; archived?: boolean },
  timeoutMs = 8000,
): Promise<MaterialListItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/library/materials/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(body),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as MaterialListItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 软删素材（DELETE，进入回收站）。 */
export async function deleteMaterial(id: string, timeoutMs = 8000): Promise<{ id: string; deleted: true }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/library/materials/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { id: string; deleted: true };
  } finally {
    clearTimeout(timer);
  }
}

/** 从回收站恢复素材（POST）。 */
export async function restoreMaterial(id: string, timeoutMs = 8000): Promise<{ id: string; restored: true }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/library/materials/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { id: string; restored: true };
  } finally {
    clearTimeout(timer);
  }
}

// ============ 发布后效果数据回收（T3.10）============

export type MetricSource =
  | 'manual'
  | 'wechat_user_read'
  | 'wechat_article_read'
  | 'wechat_user_summary';

export interface MetricItem {
  id: string;
  contentProjectId: string;
  externalArticleId: string | null;
  metricDate: string;
  readCount: number;
  shareCount: number;
  favoriteCount: number;
  likeCount: number;
  followerIncrease: number;
  unfollowCount: number;
  source: MetricSource;
  fetchedAt: string;
  // 关联维度 label（看板/明细展示）
  accountName?: string | null;
  topicTitle?: string | null;
  titleText?: string | null;
  projectTitle?: string | null;
}

export interface MetricListResult {
  items: MetricItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MetricDimensionRow {
  key: string;
  label: string;
  readCount: number;
  shareCount: number;
  favoriteCount: number;
  likeCount: number;
  followerIncrease: number;
  unfollowCount: number;
  count: number;
}

export interface MetricDashboard {
  dimension: 'topic' | 'title' | 'account';
  totals: MetricDimensionRow;
  rows: MetricDimensionRow[];
  generatedAt: string;
}

export interface CreateMetricPayload {
  contentProjectId: string;
  metricDate: string; // YYYY-MM-DD
  externalArticleId?: string;
  readCount?: number;
  shareCount?: number;
  favoriteCount?: number;
  likeCount?: number;
  followerIncrease?: number;
  unfollowCount?: number;
  source?: MetricSource;
}

/** 效果指标列表（筛选 + 分页 + 维度 label，需令牌）。 */
export async function fetchMetrics(
  params: Record<string, string | number | undefined> = {},
  timeoutMs = 8000,
): Promise<MetricListResult> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/metrics${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as MetricListResult;
  } finally {
    clearTimeout(timer);
  }
}

/** 按选题/标题/账号维度聚合的效果看板（需令牌）。 */
export async function fetchMetricDashboard(
  dimension: 'topic' | 'title' | 'account',
  params: Record<string, string | undefined> = {},
  timeoutMs = 8000,
): Promise<MetricDashboard> {
  const qs = new URLSearchParams();
  qs.set('dimension', dimension);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/metrics/dashboard?${qs.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as MetricDashboard;
  } finally {
    clearTimeout(timer);
  }
}

/** 手动录入单条效果指标（需令牌）。 */
export async function createMetric(
  payload: CreateMetricPayload,
  timeoutMs = 8000,
): Promise<MetricItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/metrics`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as MetricItem;
  } finally {
    clearTimeout(timer);
  }
}

/** 触发一次微信公众号统计拉取（需已配置公众号资质 + PG/Redis 环境）。 */
export async function pullWechatMetrics(
  days = 7,
  timeoutMs = 30000,
): Promise<{ pulled: number; note: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/metrics/pull?days=${encodeURIComponent(String(days))}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { pulled: number; note: string };
  } finally {
    clearTimeout(timer);
  }
}

/** 内容项目列表（精简，供指标录入选择归属项目；需令牌）。 */
export interface MetricProjectOption {
  id: string;
  title: string | null;
  topicTitle: string | null;
}

/** 取已发布内容项目（含 externalMediaId 可对齐微信统计），供录入选择。 */
export async function fetchPublishedProjects(
  params: { ownedAccountId?: string } = {},
  timeoutMs = 8000,
): Promise<MetricProjectOption[]> {
  const qs = new URLSearchParams();
  if (params.ownedAccountId) qs.set('ownedAccountId', params.ownedAccountId);
  const query = qs.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/content-projects${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = (await res.json()) as Array<{
      id: string;
      topic?: { title: string } | null;
      selectedTitle?: { text: string } | null;
    }>;
    return items.map((p) => ({
      id: p.id,
      title: p.selectedTitle?.text ?? p.topic?.title ?? null,
      topicTitle: p.topic?.title ?? null,
    }));
  } finally {
    clearTimeout(timer);
  }
}

// ============ T4.6 成本/配额看板 ============
export type CostPeriod = '7d' | '30d' | 'thisMonth' | 'all';
export type QuotaStatus = 'ok' | 'warning' | 'exceeded';

export interface CostTotals {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  runningRuns: number;
  queuedRuns: number;
  totalCost: number;
  totalDurationMs: number;
  avgDurationMs: number;
  successRate: number;
}

export interface CostByModelRow {
  model: string;
  runs: number;
  success: number;
  failed: number;
  cancelled: number;
  totalCost: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

export interface CostByStageRow {
  stage: string;
  runs: number;
  success: number;
  failed: number;
  totalCost: number;
  avgDurationMs: number;
}

export interface CostDailyRow {
  date: string;
  runs: number;
  success: number;
  failed: number;
  totalCost: number;
}

export interface QuotaAlert {
  provider: string;
  model: string;
  budget: number;
  spent: number;
  ratio: number;
  status: QuotaStatus;
  hasRuns: boolean;
}

export interface QuotaSummary {
  totalBudget: number;
  totalSpent: number;
  anyExceeded: boolean;
  anyWarning: boolean;
  unconfiguredModels: string[];
}

export interface CostOverview {
  period: CostPeriod;
  totals: CostTotals;
  byModel: CostByModelRow[];
  byStage: CostByStageRow[];
  daily: CostDailyRow[];
  quota: { alerts: QuotaAlert[]; summary: QuotaSummary };
  generatedAt: string;
  dbConnected: boolean;
}

/** T4.6 成本/配额看板总览：总花费/次数/成功率 + 按模型/阶段 + 日序列 + 配额预警（需令牌）。 */
export async function getCostOverview(
  params: Record<string, string | number | undefined> = {},
  timeoutMs = 10000,
): Promise<CostOverview> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/dashboard/cost/overview${query ? `?${query}` : ''}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (res.status === 401) throw new Error('需要登录令牌：请在系统设置页粘贴 Bearer 令牌后重试');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as CostOverview;
  } finally {
    clearTimeout(timer);
  }
}
