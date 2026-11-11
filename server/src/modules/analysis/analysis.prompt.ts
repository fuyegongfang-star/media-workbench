import type { ChatMessage } from '../generation/provider.contract';

export interface SingleAnalysisMaterial {
  title: string;
  body: string;
}

/** 系统角色：内容策略分析师人设与输出约束。 */
const SYSTEM_ROLE =
  '你是一名资深新媒体内容策略分析师，擅长从单篇素材中拆解可复用的内容要素（主题、受众痛点、钩子、结构、可延伸选题、调性）。请严格按用户指令输出结构化结果。';

/** 单篇拆解默认用户模板（DB 无 PromptTemplate 时的兜底）。占位符：{{title}} {{body}}。 */
export const DEFAULT_SINGLE_ANALYSIS_USER_TEMPLATE = `请对以下单篇素材做结构化拆解，仅输出 JSON（不要包含 markdown 代码块）：
{
  "theme": "核心主题/定位（一句话）",
  "audiencePain": ["目标受众痛点1", "目标受众痛点2"],
  "hooks": ["开头钩子/金句1", "开头钩子/金句2"],
  "structure": "推荐内容结构（如：痛点引入 - 观点展开 - 案例佐证 - 行动号召）",
  "angles": ["可延伸的选题角度1", "可延伸的选题角度2"],
  "tone": "风格调性（如：专业可信 / 轻松幽默 / 犀利直给）",
  "summary": "200 字以内内容摘要"
}
素材标题：{{title}}
素材正文：{{body}}`;

/** 纯函数：渲染单篇拆解消息（system + user）。模板缺省用内置兜底。 */
export function renderAnalysisMessages(
  material: SingleAnalysisMaterial,
  template?: string,
): ChatMessage[] {
  const userTpl = template && template.trim() ? template : DEFAULT_SINGLE_ANALYSIS_USER_TEMPLATE;
  const user = userTpl
    .replace(/\{\{\s*title\s*\}\}/g, material.title ?? '')
    .replace(/\{\{\s*body\s*\}\}/g, material.body ?? '');
  return [
    { role: 'system', content: SYSTEM_ROLE },
    { role: 'user', content: user },
  ];
}

/** 纯函数：从 LLM 文本中稳健解析 JSON；失败兜底为 { rawText }，绝不丢内容。 */
export function parseAnalysisJson(raw: string): Record<string, unknown> {
  if (!raw) return { rawText: '' };
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = s.slice(start, end + 1);
    try {
      const obj = JSON.parse(candidate);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return obj as Record<string, unknown>;
      }
    } catch {
      /* 落到兜底 */
    }
  }
  return { rawText: raw };
}

// ============ 账号级汇总（ANALYSIS_ACCOUNT_SUMMARY → 策略草稿）============

/** 单条被聚合的拆解输入（标题 + 摘要/结构化内容）。 */
export interface AccountAnalysisInput {
  title: string;
  summary: string;
}

/** 规范化后的策略草稿字段卡（与 AccountStrategy 的 Json 字段一一对应）。 */
export interface StrategyDraft {
  position: Record<string, unknown>;
  audience: Record<string, unknown>;
  pillars: unknown[];
  titlePref: Record<string, unknown>;
  structure: string;
  tone: Record<string, unknown>;
  boundaries: unknown[];
}

const ACCOUNT_SUMMARY_SYSTEM_ROLE =
  '你是一名资深新媒体内容策略师，擅长把多篇对标素材的拆解结论，归纳成一份可落地的账号内容策略草稿（定位/受众/栏目支柱/标题偏好/结构范式/调性/边界）。请严格按用户指令输出结构化策略 JSON。';

/** 账号级汇总默认用户模板（DB 无 PromptTemplate 时的兜底）。占位符：{{accountName}} {{analyses}}。 */
export const DEFAULT_ACCOUNT_SUMMARY_USER_TEMPLATE = `请基于以下对标素材的拆解结论，为账号「{{accountName}}」生成一份账号内容策略草稿，仅输出 JSON（不要包含 markdown 代码块）：
{
  "position": { "核心定位": "", "差异化": "" },
  "audience": { "目标人群": "", "核心痛点": "" },
  "pillars": ["内容栏目支柱1", "内容栏目支柱2"],
  "titlePref": { "风格": "", "公式": "" },
  "structure": "推荐内容结构范式（如：痛点引入 - 观点展开 - 案例佐证 - 行动号召）",
  "tone": { "调性": "", "语气词": "" },
  "boundaries": ["内容红线/不碰的选题1", "合规边界2"]
}
以下为各素材拆解结论：
{{analyses}}`;

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}
function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) return [v];
  return [];
}
function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return JSON.stringify(v);
}

/** 纯函数：把 LLM 返回的任意对象规范化为策略草稿字段卡，缺失字段补默认值。 */
export function normalizeStrategyDraft(input: Record<string, unknown>): StrategyDraft {
  return {
    position: asObject(input.position),
    audience: asObject(input.audience),
    pillars: asArray(input.pillars),
    titlePref: asObject(input.titlePref),
    structure: asString(input.structure),
    tone: asObject(input.tone),
    boundaries: asArray(input.boundaries),
  };
}

/** 纯函数：渲染账号级汇总消息（system + user）。模板缺省用内置兜底。 */
export function renderAccountSummaryMessages(
  accountName: string,
  analyses: AccountAnalysisInput[],
  template?: string,
): ChatMessage[] {
  const userTpl =
    template && template.trim() ? template : DEFAULT_ACCOUNT_SUMMARY_USER_TEMPLATE;
  const list =
    analyses.length > 0
      ? analyses
          .map((a, i) => `${i + 1}. 【${a.title || '(未命名素材)'}】${a.summary || '(无摘要)'}`)
          .join('\n')
      : '（无已选拆解结论）';
  const user = userTpl
    .replace(/\{\{\s*accountName\s*\}\}/g, accountName ?? '')
    .replace(/\{\{\s*analyses\s*\}\}/g, list);
  return [
    { role: 'system', content: ACCOUNT_SUMMARY_SYSTEM_ROLE },
    { role: 'user', content: user },
  ];
}

/**
 * 纯函数：从 LLM 文本中解析策略草稿 JSON。
 * 成功返回 { draft: StrategyDraft }（已规范化）；
 * 失败（无 JSON）返回 { rawText }，由调用方决定兜底处理。
 */
export function parseStrategyDraftJson(raw: string): { draft?: StrategyDraft; rawText?: string } {
  if (!raw) return { rawText: '' };
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = s.slice(start, end + 1);
    try {
      const obj = JSON.parse(candidate);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return { draft: normalizeStrategyDraft(obj as Record<string, unknown>) };
      }
    } catch {
      /* 落到兜底 */
    }
  }
  return { rawText: raw };
}
