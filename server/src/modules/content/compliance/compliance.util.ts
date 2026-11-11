/**
 * T3.11 合规预审纯函数工具。与 Prisma/网络无关，便于单测，同时被 compliance.service 复用。
 */

import type { ComplianceSeverity, ComplianceWord } from './compliance-dictionary';

export interface ComplianceMatch {
  /** 命中的词语。 */
  word: string;
  category: 'absolute' | 'sensitive';
  severity: ComplianceSeverity;
  /** 命中在原文中的起止位置（字符索引，含 start 不含 end），供前端精确标红。 */
  start: number;
  end: number;
  suggestion?: string;
}

export interface ComplianceSummary {
  passed: boolean;
  riskCount: number;
  blockingCount: number;
  warningCount: number;
  /** 最高风险级别：blocking / warning / null（无风险）。 */
  maxSeverity: ComplianceSeverity | null;
}

/** 从内置/自定义词表派生检测词（统一小写，便于不区分大小写匹配）。 */
export function normalizeWords(words: ComplianceWord[]): ComplianceWord[] {
  return words
    .map((w) => ({ ...w, word: w.word.trim() }))
    .filter((w) => w.word.length > 0);
}

/**
 * 扫描正文，返回全部命中的风险词及其位置（供标红）。
 * - 不区分大小写（中文场景主要防全角/半角与英文混入）。
 * - 一个词多次出现均记录（标红每一处）。
 * - 同位置完全重复的去重；较长匹配优先保留（避免「顶级」与「最顶级」重复标红同一段时丢失外层）。
 */
export function scanCompliance(text: string, words: ComplianceWord[]): ComplianceMatch[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const norm = normalizeWords(words);
  const raw: ComplianceMatch[] = [];

  for (const w of norm) {
    const needle = w.word.toLowerCase();
    if (!needle) continue;
    let from = 0;
    // 循环找所有出现（含重叠）
    while (true) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      raw.push({
        word: w.word,
        category: w.category,
        severity: w.severity,
        start: idx,
        end: idx + needle.length,
        suggestion: w.suggestion,
      });
      from = idx + 1; // 允许重叠（如「顶级」与「最顶级」）
    }
  }

  if (raw.length === 0) return [];
  // 按起点排序，去除完全相同的重复区间
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const seen = new Set<string>();
  const dedup: ComplianceMatch[] = [];
  for (const m of raw) {
    const key = `${m.start}:${m.end}:${m.word}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(m);
  }
  return dedup;
}

/** 汇总命中结果为 passed / 各分级计数 / 最高级别。 */
export function summarizeCompliance(matches: ComplianceMatch[]): ComplianceSummary {
  let blockingCount = 0;
  let warningCount = 0;
  for (const m of matches) {
    if (m.severity === 'blocking') blockingCount++;
    else warningCount++;
  }
  const maxSeverity: ComplianceSeverity | null = blockingCount > 0 ? 'blocking' : warningCount > 0 ? 'warning' : null;
  return {
    passed: blockingCount === 0,
    riskCount: matches.length,
    blockingCount,
    warningCount,
    maxSeverity,
  };
}

/** 合并自定义词表（去重，后出现的自定义项覆盖同名同义词的内置项）。 */
export function mergeCustomWords(base: ComplianceWord[], extra?: ComplianceWord[]): ComplianceWord[] {
  if (!extra || extra.length === 0) return base;
  const map = new Map<string, ComplianceWord>();
  for (const w of normalizeWords(base)) map.set(w.word.toLowerCase(), w);
  for (const w of normalizeWords(extra)) map.set(w.word.toLowerCase(), w);
  return [...map.values()];
}

/**
 * 生成面向前端渲染的「标红分段」：按命中区间切分原文为 [{text, hit}] 序列。
 * hit=true 的片段即为需标红的风险词。位置越界/空文本安全返回整段 hit=false。
 */
export function renderHighlight(text: string, matches: ComplianceMatch[]): { text: string; hit: boolean; severity?: ComplianceSeverity; suggestion?: string }[] {
  if (!text) return [];
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const segs: { text: string; hit: boolean; severity?: ComplianceSeverity; suggestion?: string }[] = [];
  let cursor = 0;
  for (const m of sorted) {
    const s = Math.max(0, Math.min(m.start, text.length));
    const e = Math.max(s, Math.min(m.end, text.length));
    if (e <= cursor) continue; // 被前段覆盖
    if (s > cursor) segs.push({ text: text.slice(cursor, s), hit: false });
    segs.push({ text: text.slice(s, e), hit: true, severity: m.severity, suggestion: m.suggestion });
    cursor = e;
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor), hit: false });
  return segs;
}

/** 生成可读的预审结论摘要（用于 ComplianceCheck.summary 与接口返回）。 */
export function buildComplianceSummaryText(text: string, matches: ComplianceMatch[]): string | null {
  const s = summarizeCompliance(matches);
  if (matches.length === 0) return '未检出广告法极限词/敏感词风险（仅基于内置词典，不替代法务终审）';
  const blockingWords = matches.filter((m) => m.severity === 'blocking').map((m) => m.word);
  const warningWords = matches.filter((m) => m.severity === 'warning').map((m) => m.word);
  const parts: string[] = [];
  if (blockingWords.length) parts.push(`阻断(${blockingWords.length})：${[...new Set(blockingWords)].join('、')}`);
  if (warningWords.length) parts.push(`提示(${warningWords.length})：${[...new Set(warningWords)].join('、')}`);
  return `检出 ${matches.length} 处风险词（${parts.join('；')}）`;
}
