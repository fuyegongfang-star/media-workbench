/**
 * T3.7 文本检测（朱雀 / LLM）纯函数工具。
 * 与 Prisma/网络无关，便于单测；同时被 text-review.service 复用。
 */

export interface NormalizedDetectResult {
  /** 归一化后的可读摘要（优先 summary，其次依据分值/概率拼出）。 */
  summary: string;
  /** 服务端版本/模型标识（用于展示「检测引擎版本」）。 */
  serviceVersion?: string;
}

/**
 * 归一化检测服务原始响应为 {summary, serviceVersion}。
 * 兼容两类来源：
 *  - 朱雀/Zhuque 类：{ summary, aiProb, probability, version }
 *  - LLM 类：{ aiScore, score, summary, risks, version }
 * 任何来源都原样保留到 TextReviewRun.rawResponse，此处只挑「摘要」字段。
 */
export function normalizeDetectResult(raw: unknown, service?: string): NormalizedDetectResult {
  if (raw === null || typeof raw !== 'object') {
    return { summary: typeof raw === 'string' ? raw : '(空响应)' };
  }
  const r = raw as Record<string, unknown>;

  const summary =
    pickString(r, ['summary', 'conclusion', 'desc', 'description']) ??
    composeScoreSummary(r);

  const serviceVersion =
    pickString(r, ['version', 'serviceVersion', 'model', 'engine']) ?? undefined;

  if (!summary) {
    return { summary: service ? `(${service}) 已检测，无文本摘要` : '(已检测，无文本摘要)' };
  }
  return { summary, serviceVersion };
}

/** 从对象挑第一个存在的字符串字段。 */
function pickString(r: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** 无显式 summary 时，用分值/概率拼一句摘要。 */
function composeScoreSummary(r: Record<string, unknown>): string | null {
  const aiProb = toScore(r['aiProb'] ?? r['probability']);
  const aiScore = toScore(r['aiScore'] ?? r['score']);
  const score = aiProb ?? aiScore;
  if (score !== null) {
    const pct = Math.round(score * 100);
    const kind = aiProb !== null ? 'AI 痕迹概率' : 'AI 评分';
    const risks = Array.isArray(r['risks']) ? (r['risks'] as unknown[]).map(String).slice(0, 3).join('、') : '';
    return `${kind}约 ${pct}%${risks ? `；风险提示：${risks}` : ''}`;
  }
  return null;
}

function toScore(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    // 兼容 0~1 与 0~100
    return v > 1 ? v / 100 : v;
  }
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim().replace('%', ''));
    if (Number.isFinite(n)) return n > 1 ? n / 100 : n;
  }
  return null;
}

/**
 * 判断某条检测记录是否「旧版本结果」：其绑定的 versionId 已不是项目当前版本。
 * 文章后续修改后，旧结果应自动标记过期（深入设计 §1.2）。
 */
export function isStaleReview(versionId: string, currentVersionId: string | null): boolean {
  if (!currentVersionId) return false;
  return versionId !== currentVersionId;
}

/** 用户决定的合法取值。 */
export const REVIEW_DECISIONS = ['accepted', 'ignored', 'flagged'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** 校验用户决定取值；非法返回错误字符串。 */
export function validateDecision(decision: unknown): { ok: true; value: ReviewDecision } | { ok: false; error: string } {
  if (typeof decision !== 'string' || !REVIEW_DECISIONS.includes(decision as ReviewDecision)) {
    return { ok: false, error: `非法的检测决定：${String(decision)}（应为 accepted/ignored/flagged）` };
  }
  return { ok: true, value: decision as ReviewDecision };
}
