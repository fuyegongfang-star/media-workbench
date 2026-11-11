import type { ChatMessage } from '../../generation/provider.contract';

// ============ 选题 / 标题生成提示词与解析（T3.1）============
// 纯函数：渲染消息 + 解析 LLM 输出 + 规范化字段，不依赖数据库/LLM 密钥，可单测。

export interface TopicDraft {
  title: string;
  audience?: string;
  angle?: string;
  tags?: string[];
}

export interface TitleDraft {
  text: string;
  basis?: string;
  tags?: string[];
  score?: number;
}

// ---------- 通用工具 ----------

export function clampCount(n: unknown, def: number, max = 20): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return def;
  return Math.min(Math.max(Math.floor(v), 1), max);
}

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').map(String);
  if (typeof v === 'string' && v.trim()) return [v];
  return [];
}

/** 从 JSON 文本中稳健抽取数组：支持裸数组、{ key: [...] }、markdown 围栏、前后散文。 */
function extractArray(raw: string): unknown[] | null {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  const candidate = s.slice(start, end + 1);
  try {
    const v = JSON.parse(candidate);
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).topics)) {
      return (v as Record<string, unknown>).topics as unknown[];
    }
    if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).titles)) {
      return (v as Record<string, unknown>).titles as unknown[];
    }
  } catch {
    /* 落到 null */
  }
  return null;
}

// ---------- 策略摘要（供选题/标题注入上下文）----------

/** 纯函数：把 AccountStrategy 的 Json 字段拼成可读摘要，空则返回占位。 */
export function summarizeStrategy(s: {
  position?: unknown;
  audience?: unknown;
  pillars?: unknown;
  titlePref?: unknown;
  structure?: unknown;
  tone?: unknown;
  boundaries?: unknown;
}): string {
  const parts: string[] = [];
  if (s.position) parts.push(`定位：${asString(s.position)}`);
  if (s.audience) parts.push(`受众：${asString(s.audience)}`);
  if (Array.isArray(s.pillars) && s.pillars.length) parts.push(`栏目支柱：${s.pillars.join('、')}`);
  if (s.titlePref) parts.push(`标题偏好：${asString(s.titlePref)}`);
  if (s.structure) parts.push(`结构：${asString(s.structure)}`);
  if (s.tone) parts.push(`调性：${asString(s.tone)}`);
  if (Array.isArray(s.boundaries) && s.boundaries.length) parts.push(`边界：${s.boundaries.join('、')}`);
  return parts.join('\n') || '（策略为空）';
}

// ---------- 选题生成（TOPIC_GEN）----------

const TOPIC_GEN_SYSTEM =
  '你是一名资深新媒体选题策划，擅长基于账号策略与对标分析，产出可执行、有差异化的选题清单。请严格按用户指令输出 JSON 数组。';

export const DEFAULT_TOPIC_GEN_USER_TEMPLATE = `基于以下账号策略与对标分析，产出 {{count}} 个候选选题，仅输出 JSON 数组（不要包含 markdown 代码块）：
[
  { "title": "选题标题", "audience": "目标受众", "angle": "切入角度/钩子", "tags": ["标签1","标签2"] }
]
账号策略摘要：
{{strategySummary}}
对标分析摘要：
{{analysisSummary}}`;

/** 纯函数：渲染选题生成消息（system + user）。模板缺省用内置兜底。 */
export function renderTopicGenMessages(
  ctx: { strategySummary?: string; analysisSummary?: string; count?: number; platform?: string },
  template?: string,
): ChatMessage[] {
  const userTpl = template && template.trim() ? template : DEFAULT_TOPIC_GEN_USER_TEMPLATE;
  const count = clampCount(ctx.count, 5);
  const user = userTpl
    .replace(/\{\{\s*count\s*\}\}/g, String(count))
    .replace(/\{\{\s*strategySummary\s*\}\}/g, ctx.strategySummary || '（暂无策略）')
    .replace(/\{\{\s*analysisSummary\s*\}\}/g, ctx.analysisSummary || '（暂无对标分析）')
    .replace(/\{\{\s*platform\s*\}\}/g, ctx.platform || 'wechat');
  return [
    { role: 'system', content: TOPIC_GEN_SYSTEM },
    { role: 'user', content: user },
  ];
}

export function normalizeTopicDraft(input: Record<string, unknown>): TopicDraft | null {
  const title = asString(input.title).trim();
  if (!title) return null;
  return {
    title,
    audience: input.audience !== undefined ? asString(input.audience) : undefined,
    angle: input.angle !== undefined ? asString(input.angle) : undefined,
    tags: asStringArray(input.tags),
  };
}

/** 纯函数：从 LLM 文本稳健解析选题数组；无有效数组则兜底 { rawText }。 */
export function parseTopics(raw: string): { topics: TopicDraft[]; rawText?: string } {
  if (!raw) return { topics: [], rawText: '' };
  const arr = extractArray(raw);
  if (arr) {
    const topics = arr
      .map((x) => normalizeTopicDraft(x as Record<string, unknown>))
      .filter((t): t is TopicDraft => t !== null);
    if (topics.length) return { topics };
  }
  return { topics: [], rawText: raw };
}

// ---------- 标题生成（TITLE_GEN）----------

const TITLE_GEN_SYSTEM =
  '你是一名资深新媒体标题策划，擅长基于选题与账号策略，产出高点击、合规、不夸大诱导的标题候选清单。请严格按用户指令输出 JSON 数组。';

export const DEFAULT_TITLE_GEN_USER_TEMPLATE = `基于以下选题与账号策略，产出 {{count}} 个标题候选，仅输出 JSON 数组（不要包含 markdown 代码块）：
[
  { "text": "标题文案", "basis": "依据/卖点", "tags": ["标签"], "score": 8 }
]
选题：{{topicTitle}}
切入角度：{{topicAngle}}
账号策略摘要：{{strategySummary}}`;

/** 纯函数：渲染标题生成消息（system + user）。模板缺省用内置兜底。 */
export function renderTitleGenMessages(
  ctx: {
    topicTitle: string;
    topicAngle?: string;
    strategySummary?: string;
    count?: number;
    platform?: string;
  },
  template?: string,
): ChatMessage[] {
  const userTpl = template && template.trim() ? template : DEFAULT_TITLE_GEN_USER_TEMPLATE;
  const count = clampCount(ctx.count, 8);
  const user = userTpl
    .replace(/\{\{\s*count\s*\}\}/g, String(count))
    .replace(/\{\{\s*topicTitle\s*\}\}/g, ctx.topicTitle ?? '')
    .replace(/\{\{\s*topicAngle\s*\}\}/g, ctx.topicAngle || '（未指定）')
    .replace(/\{\{\s*strategySummary\s*\}\}/g, ctx.strategySummary || '（暂无策略）')
    .replace(/\{\{\s*platform\s*\}\}/g, ctx.platform || 'wechat');
  return [
    { role: 'system', content: TITLE_GEN_SYSTEM },
    { role: 'user', content: user },
  ];
}

export function normalizeTitleDraft(input: Record<string, unknown>): TitleDraft | null {
  const text = asString(input.text).trim();
  if (!text) return null;
  const score = typeof input.score === 'number' ? input.score : undefined;
  return {
    text,
    basis: input.basis !== undefined ? asString(input.basis) : undefined,
    tags: asStringArray(input.tags),
    score: typeof score === 'number' ? score : undefined,
  };
}

/** 纯函数：从 LLM 文本稳健解析标题数组；无有效数组则兜底 { rawText }。 */
export function parseTitleCandidates(raw: string): { titles: TitleDraft[]; rawText?: string } {
  if (!raw) return { titles: [], rawText: '' };
  const arr = extractArray(raw);
  if (arr) {
    const titles = arr
      .map((x) => normalizeTitleDraft(x as Record<string, unknown>))
      .filter((t): t is TitleDraft => t !== null);
    if (titles.length) return { titles };
  }
  return { titles: [], rawText: raw };
}
