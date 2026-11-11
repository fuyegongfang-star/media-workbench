// T2.1 对标账号批量导入：解析与去重纯函数（无 DB 依赖，可单测）。
// 支持的导入格式：csv / json / lines（每行 "名称 - 主页URL" 或 "名称：URL" 或仅名称）。

export type ReferenceFormat = 'csv' | 'json' | 'lines';

export interface ReferenceRow {
  name: string;
  platform?: string;
  homepageUrl?: string;
  domain?: string;
  note?: string;
}

export interface ImportCandidate extends ReferenceRow {
  index: number;
  status: 'new' | 'duplicate';
  existingId?: string;
  reason?: string;
}

/** 首期仅 wechat（prisma 枚举约束，多平台见 开发排期 §4 P2）。 */
export const VALID_PLATFORMS = new Set<string>(['wechat']);

/** 规范化名称用于去重比较：去首尾空白、转小写、压缩内部空白。 */
export function normalizeRefName(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 从主页 URL 派生域名（去掉 www. 前缀）；非法 URL 返回 null。 */
export function deriveDomain(homepageUrl?: string | null): string | null {
  if (!homepageUrl) return null;
  try {
    const host = new URL(homepageUrl).hostname;
    return host.startsWith('www.') ? host.slice(4) : host || null;
  } catch {
    return null;
  }
}

export interface ParseResult {
  rows: ReferenceRow[];
  skipped: string[];
}

/**
 * 解析批量文本为候选对照账号行。
 * - 结构错误（JSON 语法错 / 顶层非数组）抛错，由调用方转 400。
 * - 逐行缺 name 计入 skipped，不抛异常，容忍脏数据。
 */
export function parseReferenceAccounts(raw: string, format: ReferenceFormat): ParseResult {
  const text = (raw ?? '').replace(/\r\n/g, '\n');
  const skipped: string[] = [];
  switch (format) {
    case 'json':
      return parseJson(text, skipped);
    case 'csv':
      return parseCsv(text, skipped);
    case 'lines':
      return parseLines(text, skipped);
    default:
      throw new Error(`不支持的导入格式：${format}`);
  }
}

function coerceRow(o: Record<string, unknown>, name: string): ReferenceRow {
  const platform =
    typeof o.platform === 'string' && o.platform.trim() && VALID_PLATFORMS.has(o.platform.trim())
      ? o.platform.trim()
      : 'wechat';
  const homepageUrl =
    typeof o.homepageUrl === 'string' && o.homepageUrl.trim() ? o.homepageUrl.trim() : undefined;
  const domain = typeof o.domain === 'string' && o.domain.trim() ? o.domain.trim() : undefined;
  const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim() : undefined;
  return {
    name,
    platform,
    homepageUrl: homepageUrl || undefined,
    // 未显式给 domain 时按 homepageUrl 派生
    domain: domain || deriveDomain(homepageUrl) || undefined,
    note: note || undefined,
  };
}

function parseJson(text: string, skipped: string[]): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('JSON 解析失败：' + (e as Error).message);
  }
  if (!Array.isArray(data)) throw new Error('JSON 顶层必须是数组');
  const rows: ReferenceRow[] = [];
  data.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      skipped.push(`第 ${i + 1} 行：不是对象`);
      return;
    }
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) {
      skipped.push(`第 ${i + 1} 行：缺少 name`);
      return;
    }
    rows.push(coerceRow(o, name));
  });
  return { rows, skipped };
}

/** 处理双引号包裹与转义的基础 CSV 切分（够用，不追求 RFC 全兼容）。 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** 表头同义词 → 规范驼峰键（中/英均可）。 */
function canonicalKey(h: string): 'name' | 'platform' | 'homepageUrl' | 'domain' | 'note' | null {
  const k = h.trim().toLowerCase();
  if (k === 'name' || k === '名称' || k === '账号' || k === '账号名') return 'name';
  if (k === 'platform' || k === '平台') return 'platform';
  if (k === 'homepageurl' || k === 'homepage' || k === 'url' || k === '主页' || k === '链接' || k === '链接地址')
    return 'homepageUrl';
  if (k === 'domain' || k === '域名') return 'domain';
  if (k === 'note' || k === '备注' || k === '说明') return 'note';
  return null;
}

function parseCsv(text: string, skipped: string[]): ParseResult {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], skipped };
  let headerMap: (string | null)[] | null = null;
  let start = 0;
  // 首行含表头关键词则当作 header（中英表头同义词 → 规范键，保留原列序对齐）
  if (/\b(name|名称|账号|平台|主页|域名|备注)\b/i.test(lines[0])) {
    headerMap = splitCsvLine(lines[0]).map((h) => canonicalKey(h));
    start = 1;
  }
  const rows: ReferenceRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    if (headerMap) {
      headerMap.forEach((key, idx) => {
        if (key) obj[key] = cells[idx] ?? '';
      });
    } else {
      obj['name'] = cells[0] ?? '';
      obj['platform'] = cells[1] ?? '';
      obj['homepageUrl'] = cells[2] ?? '';
      obj['domain'] = cells[3] ?? '';
      obj['note'] = cells[4] ?? '';
    }
    const name = (obj['name'] ?? '').trim();
    if (!name) {
      skipped.push(`第 ${i + 1} 行：缺少 name`);
      continue;
    }
    rows.push(coerceRow(obj, name));
  }
  return { rows, skipped };
}

function parseLines(text: string, skipped: string[]): ParseResult {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const rows: ReferenceRow[] = [];
  const urlPattern =
    /(https?:\/\/\S+|(?:www\.)?[a-z0-9-]+(?:\.[a-z]{2,})+(?:\/\S*)?)/i;
  lines.forEach((line, i) => {
    let name = line;
    let url: string | undefined;
    // "名称 - URL" / "名称：URL" / "名称 – URL"
    let m = line.match(
      /^(.*?)[\s]*[-–—:：]\s*(https?:\/\/\S+|(?:www\.)?[a-z0-9-]+(?:\.[a-z]{2,})+(?:\/\S*)?)\s*$/i,
    );
    if (m) {
      name = m[1];
      url = m[2];
    } else {
      // "名称 (URL)" / "名称（URL）"
      m = line.match(
        /^(.*?)\s*[\(（]\s*(https?:\/\/\S+|(?:www\.)?[a-z0-9-]+(?:\.[a-z]{2,})+(?:\/\S*)?)\s*[\)）]\s*$/i,
      );
      if (m) {
        name = m[1];
        url = m[2];
      }
    }
    name = name.trim();
    if (!name) {
      skipped.push(`第 ${i + 1} 行：无法解析出名称`);
      return;
    }
    if (url) url = url.trim();
    // 防御：万一名称里仍带了 url，剥离
    if (!url) {
      const um = name.match(urlPattern);
      if (um) {
        url = um[1];
        name = name.replace(urlPattern, '').replace(/[\s\-–—:：()（）]+$/, '').trim();
      }
    }
    rows.push(coerceRow({ name, homepageUrl: url }, name));
  });
  return { rows, skipped };
}

/**
 * 基于已存在（小写名→id）映射标记候选状态：
 * - 命中已存在 → duplicate + existingId
 * - 批次内重复 → duplicate（reason=批次内重复）
 * - 其余 → new（并加入 seen 供批次内去重）
 */
export function classifyCandidates(
  rows: ReferenceRow[],
  existingLower: Map<string, string>,
): ImportCandidate[] {
  const seen = new Set<string>();
  const out: ImportCandidate[] = [];
  rows.forEach((row, index) => {
    const key = normalizeRefName(row.name);
    let status: 'new' | 'duplicate' = 'new';
    let existingId: string | undefined;
    let reason: string | undefined;
    if (existingLower.has(key)) {
      status = 'duplicate';
      existingId = existingLower.get(key);
      reason = '与已有对标账号同名';
    } else if (seen.has(key)) {
      status = 'duplicate';
      reason = '批次内重复';
    } else {
      seen.add(key);
    }
    out.push({ ...row, index, status, existingId, reason });
  });
  return out;
}
