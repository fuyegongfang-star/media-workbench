/**
 * 提示词模板管理（T6 体验优化）：预设 + 自定义 + 按账号风格选择。
 *
 * 设计取舍（零迁移）：
 * - 复用既有 `PromptTemplate` 表，不新增列、不改唯一约束 `[taskType, platform, version]`，
 *   避免给生产 PostgreSQL 加列/重建约束的风险。
 * - 模板展示名 / 适用范围（全局 or 指定账号）存入 `variables` JSON 的保留键 `__meta`。
 *   seed 预置模板没有 `__meta` → 视为「内置预设」（不可删、可停用、可另存新版本）。
 * - 「账号专属优先、全局兜底、同范围内取最新 version」的选择逻辑抽成纯函数 pickPromptTemplate，
 *   不依赖数据库，可单测；各生成环节统一调用。
 * 密钥/正文不落此模块；全部模板内容经参数绑定读写，绝不拼接 SQL。
 */

import type { PromptTaskType } from '@prisma/client';

/** 9 类环节的中文名、用途说明与可用占位符（供设置页展示与校验）。 */
export interface PromptTaskMeta {
  label: string;
  desc: string;
  variables: string[];
  group: '对标拆解' | '选题标题' | '正文创作' | '润色检测';
}

export const PROMPT_TASK_META: Record<string, PromptTaskMeta> = {
  single_analysis: {
    label: '单篇对标拆解', group: '对标拆解',
    desc: '从单篇素材拆解可复用的结构、钩子、论点与表达方式',
    variables: ['materialTitle', 'materialContent', 'accountName'],
  },
  account_summary: {
    label: '账号汇总 / 策略归纳', group: '对标拆解',
    desc: '聚合多篇拆解，归纳对标账号的内容策略与风格',
    variables: ['analysisItems', 'accountName'],
  },
  strategy_draft: {
    label: '策略草稿', group: '对标拆解',
    desc: '由汇总结果生成账号定位/受众/调性草稿（预留）',
    variables: ['analysisSummary'],
  },
  topic_gen: {
    label: '选题生成', group: '选题标题',
    desc: '根据策略与对标分析批量产出选题',
    variables: ['strategySummary', 'analysisSummary', 'count'],
  },
  title_gen: {
    label: '标题生成', group: '选题标题',
    desc: '针对单个选题产出多个候选标题',
    variables: ['topicTitle', 'topicAudience', 'topicAngle', 'topicTags', 'strategySummary', 'count'],
  },
  article_draft: {
    label: '正文初稿（按账号风格）', group: '正文创作',
    desc: '一键生成正文初稿；{{strategySummary}} 会代入该账号的策略与调性',
    variables: ['title', 'titleBasis', 'topicTitle', 'topicAudience', 'topicAngle', 'topicTags', 'strategySummary', 'analysisSummary'],
  },
  article_edit: {
    label: '正文续写 / 改写', group: '正文创作',
    desc: '在现有正文上执行续写、改写、压缩、扩写',
    variables: ['title', 'currentContent', 'action'],
  },
  polish: {
    label: '润色去 AI 味', group: '润色检测',
    desc: '修正语病、去除生硬 AI 腔；{{tone}} 为可选语气基调，{{text}} 为待润色片段',
    variables: ['tone', 'text'],
  },
  caption_gen: {
    label: '配文生成', group: '润色检测',
    desc: '生成发布配文/摘要（预留）',
    variables: ['title', 'content'],
  },
};

export const PROMPT_TASK_TYPES = Object.keys(PROMPT_TASK_META) as PromptTaskType[];

export type PromptScope = 'global' | 'account';

/** variables.__meta 的结构（自定义模板写入，内置预设没有）。 */
export interface PromptTemplateMeta {
  label: string;
  scope: PromptScope;
  ownedAccountId: string | null;
  custom: true;
}

export interface PromptTemplateRowLike {
  id: string;
  taskType: string;
  platform: string;
  version: number;
  content: string;
  enabled: boolean;
  variables: unknown;
}

const META_KEY = '__meta';

/** 安全解析 variables.__meta；非法/缺失返回 null（视为内置预设）。 */
export function parseTemplateMeta(variables: unknown): PromptTemplateMeta | null {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) return null;
  const m = (variables as Record<string, unknown>)[META_KEY];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label.slice(0, 80).trim() : '';
  const scope: PromptScope = o.scope === 'account' ? 'account' : 'global';
  const ownedAccountId = scope === 'account' && typeof o.ownedAccountId === 'string' && o.ownedAccountId
    ? o.ownedAccountId.slice(0, 64)
    : null;
  return { label, scope: ownedAccountId ? 'account' : scope, ownedAccountId, custom: true };
}

/** 构造写入 variables 的 JSON（保留占位符说明 + __meta）。 */
export function buildTemplateVariables(meta: {
  label: string;
  scope: PromptScope;
  ownedAccountId?: string | null;
  placeholders?: string[];
}): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const p of meta.placeholders ?? []) vars[p] = 'string';
  const accountId = meta.scope === 'account' ? (meta.ownedAccountId ?? null) : null;
  vars[META_KEY] = {
    label: meta.label.trim().slice(0, 80),
    scope: accountId ? 'account' : 'global',
    ownedAccountId: accountId,
    custom: true,
  } satisfies PromptTemplateMeta;
  return vars;
}

/**
 * 选择生效模板：账号专属优先 → 全局兜底；同范围内取最新 version。
 * 只考虑 enabled=true 且 taskType/platform 匹配的行（调用方通常先按此过滤）。
 */
export function pickPromptTemplate<T extends PromptTemplateRowLike>(
  rows: T[],
  ownedAccountId?: string | null,
): T | null {
  const enabled = rows.filter((r) => r.enabled);
  const scored = enabled.map((r) => {
    const meta = parseTemplateMeta(r.variables);
    const isAccount = meta?.scope === 'account' && !!meta.ownedAccountId;
    const matches = isAccount && !!ownedAccountId && meta!.ownedAccountId === ownedAccountId;
    // 排序权重：账号专属且命中 > 全局 > 其它账号专属（不采用）
    const rank = matches ? 2 : isAccount ? -1 : 1;
    return { row: r, rank, version: r.version };
  });
  const candidates = scored.filter((s) => s.rank > 0);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.rank - a.rank || b.version - a.version || a.row.id.localeCompare(b.row.id));
  return candidates[0].row;
}

/** 计算某个 (taskType, platform) 的下一个版本号（现有最大 +1）。 */
export function nextTemplateVersion(
  rows: Array<{ taskType: string; platform: string; version: number }>,
  taskType: string,
  platform: string,
): number {
  const max = rows
    .filter((r) => r.taskType === taskType && r.platform === platform)
    .reduce((acc, r) => Math.max(acc, r.version), 0);
  return max + 1;
}

/** 校验模板内容：非空、长度上限、至少保留一个占位符或明确说明（不过度限制）。 */
export function validateTemplateContent(content: unknown): { ok: boolean; error?: string; value?: string } {
  if (typeof content !== 'string' || !content.trim()) return { ok: false, error: '模板内容不能为空' };
  if (content.length > 20000) return { ok: false, error: '模板内容不能超过 20000 字符' };
  return { ok: true, value: content };
}

/** taskType 合法性（白名单，防任意字符串写入枚举列）。 */
export function isPromptTaskType(v: unknown): v is PromptTaskType {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PROMPT_TASK_META, v);
}

/** 渲染 {{var}} 占位符（未提供的变量保留原样，便于排查拼写）。 */
export function renderPromptPlaceholders(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : m,
  );
}
