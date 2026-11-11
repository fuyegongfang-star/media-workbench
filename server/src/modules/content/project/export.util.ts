// ============ T3.8 导出 / 发布信息 / AI 生成标识声明（纯函数）============
// 不依赖数据库 / LLM 密钥，可单测（server/test/export.test.mjs）。

/** 默认 AI 生成内容声明（合规 §12：生成式 AI / 深度合成内容应显著标识）。 */
export const DEFAULT_AI_DECLARATION =
  '本文由人工智能辅助生成，相关内容已由人工审核编辑。';

export interface ExportProjectInput {
  title?: string | null;
  accountName?: string | null;
  topicTitle?: string | null;
  strategyVersion?: number | null;
  aiGenerated: boolean;
  aiDeclaration?: string | null;
  publishedAt?: string | null;
  externalUrl?: string | null;
  /** 当前生效版本正文；缺省时由调用方用 workingContent 兜底。 */
  body: string;
}

/** 确保文本以单个换行结尾，便于拼接页脚。 */
function ensureTrailingNewline(s: string): string {
  if (!s) return '';
  return s.endsWith('\n') ? s : s + '\n';
}

/** YAML 标量安全包裹：含特殊字符或首尾空白时用 JSON 字符串（YAML 兼容标量）。 */
function yamlScalar(s: string): string {
  if (/[:#\-{}\[\],&*?|<>=!%@`"]/.test(s) || s.trim() !== s) {
    return JSON.stringify(s);
  }
  return s;
}

/**
 * 渲染导出 Markdown：
 *  - 顶部 YAML front-matter 元信息（标题/账号/选题/策略版本/AI 标识/发布信息）
 *  - 正文（来自当前生效版本，缺省 workingContent）
 *  - AI 生成标识声明页脚（仅当 aiGenerated=true；用户自定义声明优先，否则用默认声明）
 * 纯函数，便于单测；不做任何 IO，不触碰密钥。
 */
export function renderExportMarkdown(input: ExportProjectInput): string {
  const lines: string[] = ['---'];
  if (input.title) lines.push(`title: ${yamlScalar(input.title)}`);
  if (input.accountName) lines.push(`account: ${yamlScalar(input.accountName)}`);
  if (input.topicTitle) lines.push(`topic: ${yamlScalar(input.topicTitle)}`);
  if (input.strategyVersion != null) lines.push(`strategyVersion: ${input.strategyVersion}`);
  lines.push(`aiGenerated: ${input.aiGenerated ? 'true' : 'false'}`);
  if (input.publishedAt) lines.push(`publishedAt: ${input.publishedAt}`);
  if (input.externalUrl) lines.push(`externalUrl: ${yamlScalar(input.externalUrl)}`);
  lines.push('---', '');

  if (input.title) {
    lines.push(`# ${input.title}`, '');
  }

  lines.push(ensureTrailingNewline(input.body || ''));

  if (input.aiGenerated) {
    const decl =
      (input.aiDeclaration && input.aiDeclaration.trim()) || DEFAULT_AI_DECLARATION;
    lines.push('---', '', `> **AI 生成内容声明（合规 §12）**：${decl}`, '');
  }

  return lines.join('\n');
}

/** 导出文件名：标题 + 日期，净化非法字符与路径穿越（防文件名非法 / 目录逃逸）。 */
export function buildExportFilename(
  title?: string | null,
  projectId?: string | null,
): string {
  const base = (title && title.trim()) || '内容项目';
  const safe = base.replace(/[\\/:*?"<>|\n\r\t]+/g, '_').slice(0, 80) || '内容项目';
  const stamp = new Date().toISOString().slice(0, 10);
  const idTail = projectId ? `-${String(projectId).slice(0, 8)}` : '';
  return `${safe}${idTail}-${stamp}.md`;
}

// ============ T3.8 发布信息录入校验（纯函数）============

export interface PublishRecordInput {
  publishedAt?: string | null;
  externalUrl?: string | null;
  publishNote?: string | null;
  status?: 'PUBLISHED' | 'ARCHIVED' | null;
}

export interface ValidatedPublishRecord {
  ok: boolean;
  error?: string;
  data?: {
    publishedAt: Date | null;
    externalUrl?: string;
    publishNote?: string | null;
    status: 'PUBLISHED' | 'ARCHIVED';
  };
}

/** 校验并规整「发布信息录入」输入；返回 {ok, data, error}，不抛异常（边界安全）。 */
export function validatePublishRecordInput(input: unknown): ValidatedPublishRecord {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: '发布信息必须是对象' };
  }
  const o = input as Record<string, unknown>;

  let publishedAt: Date | null = null;
  if (o.publishedAt !== undefined && o.publishedAt !== null && o.publishedAt !== '') {
    const d = new Date(String(o.publishedAt));
    if (isNaN(d.getTime())) return { ok: false, error: 'publishedAt 不是合法时间' };
    publishedAt = d;
  }

  let externalUrl: string | undefined;
  if (o.externalUrl !== undefined && o.externalUrl !== null) {
    const s = String(o.externalUrl).trim();
    if (s.length > 2000) return { ok: false, error: 'externalUrl 过长（≤2000）' };
    externalUrl = s || undefined;
  }

  let publishNote: string | null | undefined;
  if (o.publishNote !== undefined && o.publishNote !== null) {
    publishNote = String(o.publishNote).slice(0, 2000) || null;
  }

  const statusRaw =
    o.status === undefined || o.status === null ? 'PUBLISHED' : String(o.status);
  if (statusRaw !== 'PUBLISHED' && statusRaw !== 'ARCHIVED') {
    return { ok: false, error: 'status 仅允许 PUBLISHED / ARCHIVED' };
  }

  return {
    ok: true,
    data: { publishedAt, externalUrl, publishNote, status: statusRaw as 'PUBLISHED' | 'ARCHIVED' },
  };
}
