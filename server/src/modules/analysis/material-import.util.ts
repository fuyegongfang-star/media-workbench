// T2.2 素材批量导入：解析 + 指纹去重纯函数（无 DB 依赖，可单测）。
// 支持的导入格式：csv / json / markdown / lines / form（单条 JSON）/ excel（.xlsx/.xls）。
// 去重指纹（深入设计 §2.1）：normalize(text)=小写 + 去除全部空白与标点；
//   fingerprint = sha256(normalize(title) + '\n' + normalize(body))。
import { createHash } from 'node:crypto';

export type MaterialFormat = 'csv' | 'json' | 'markdown' | 'lines' | 'form' | 'excel';

export interface MaterialRow {
  title: string;
  body: string;
  sourceUrl?: string;
  author?: string;
  collectedAt?: string; // ISO 日期字符串
  licenseNote?: string;
}

export type MaterialAction = 'create' | 'skip' | 'merge' | 'copy';

export interface MaterialImportCandidate extends MaterialRow {
  index: number;
  fingerprint: string;
  status: 'new' | 'duplicate';
  existingId?: string; // 命中库内已有素材 id（合并时引用）
  reason?: string;
  batchDuplicateOf?: number; // 批次内首次出现行 index（批次内重复时引用）
  action: MaterialAction; // 默认动作，前端可改
}

/** 规范化用于指纹比较：转小写、去除所有空白与标点（\p{P} 覆盖中英文标点）。 */
export function normalizeMaterialText(text: string): string {
  return (text ?? '').toLowerCase().replace(/[\s\p{P}]+/gu, '');
}

/** 计算素材去重指纹（深入设计 §2.1）。 */
export function computeFingerprint(title: string, body: string): string {
  return createHash('sha256')
    .update(normalizeMaterialText(title) + '\n' + normalizeMaterialText(body))
    .digest('hex');
}

/** CSV 双引号包裹与转义切分（够用，不追求 RFC 全兼容）。 */
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

/** 表头同义词 → 规范键（中/英均可）。 */
function canonicalMaterialKey(h: string): keyof MaterialRow | null {
  const k = h.trim().toLowerCase().replace(/[\s_]/g, '');
  if (k === 'title' || k === '标题' || k === '题目') return 'title';
  if (k === 'body' || k === '正文' || k === '内容' || k === 'content') return 'body';
  if (k === 'sourceurl' || k === 'url' || k === '链接' || k === '来源' || k === '来源链接')
    return 'sourceUrl';
  if (k === 'author' || k === '作者') return 'author';
  if (k === 'collectedat' || k === '采集时间' || k === '日期') return 'collectedAt';
  if (k === 'licensenote' || k === '授权' || k === '授权说明') return 'licenseNote';
  return null;
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function coerceMaterialRow(o: Record<string, unknown>): MaterialRow {
  return {
    title: clean(o.title),
    body: clean(o.body ?? o.content),
    sourceUrl: clean(o.sourceUrl ?? o.url) || undefined,
    author: clean(o.author) || undefined,
    collectedAt: clean(o.collectedAt) || undefined,
    licenseNote: clean(o.licenseNote) || undefined,
  };
}

function parseJson(text: string, skipped: string[]): MaterialRow[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('JSON 解析失败：' + (e as Error).message);
  }
  const arr = Array.isArray(data) ? data : [data]; // form 单对象也支持
  const rows: MaterialRow[] = [];
  arr.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      skipped.push(`第 ${i + 1} 项：不是对象`);
      return;
    }
    const r = coerceMaterialRow(item as Record<string, unknown>);
    if (!r.title) {
      skipped.push(`第 ${i + 1} 项：缺少 title`);
      return;
    }
    rows.push(r);
  });
  return rows;
}

function parseCsv(text: string, skipped: string[]): MaterialRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  let headerMap: (keyof MaterialRow | null)[] | null = null;
  let start = 0;
  if (/\b(title|标题|题目|正文|内容|链接|作者|采集|授权)\b/i.test(lines[0])) {
    headerMap = splitCsvLine(lines[0]).map((h) => canonicalMaterialKey(h));
    start = 1;
  }
  const rows: MaterialRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    if (headerMap) {
      headerMap.forEach((key, idx) => {
        if (key) obj[key] = cells[idx] ?? '';
      });
    } else {
      obj['title'] = cells[0] ?? '';
      obj['body'] = cells[1] ?? '';
      obj['sourceUrl'] = cells[2] ?? '';
      obj['author'] = cells[3] ?? '';
      obj['collectedAt'] = cells[4] ?? '';
      obj['licenseNote'] = cells[5] ?? '';
    }
    const r = coerceMaterialRow(obj);
    if (!r.title) {
      skipped.push(`第 ${i + 1} 行：缺少 title`);
      continue;
    }
    rows.push(r);
  }
  return rows;
}

function parseLines(text: string, skipped: string[]): MaterialRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const rows: MaterialRow[] = [];
  lines.forEach((line, i) => {
    let title = '';
    let body = '';
    const m = line.match(/^(.*?)[\s]*[-–—:：|｜]\s*([\s\S]*)$/);
    if (m) {
      title = m[1].trim();
      body = m[2].trim();
    } else {
      title = line;
      body = '';
    }
    if (!title) {
      skipped.push(`第 ${i + 1} 行：无法解析标题`);
      return;
    }
    rows.push({ title, body });
  });
  return rows;
}

function parseMarkdown(text: string, _skipped: string[]): MaterialRow[] {
  const lines = text.split('\n');
  const headingRe = /^(\s*)(#{1,6})\s+(.*)$/;
  // 若文档存在二级及以上标题，则以 ## 作为素材分隔（# 视为文档标题/前言，并入首个素材正文）；
  // 否则退化为以 # 作为分隔，保证"只有一级标题"的文档也能拆分。
  let hasL2 = false;
  for (const line of lines) {
    const h = line.match(headingRe);
    if (h && h[2].length >= 2) {
      hasL2 = true;
      break;
    }
  }
  const threshold = hasL2 ? 2 : 1;
  const rows: MaterialRow[] = [];
  let curTitle: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (curTitle === null) return;
    const body = buf.join('\n').trim();
    rows.push({ title: curTitle, body });
    buf = [];
  };
  for (const line of lines) {
    const h = line.match(headingRe);
    if (h && h[2].length >= threshold) {
      flush();
      curTitle = h[3].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  // 整篇无达标标题：当作单条素材，标题用首行或「未命名素材」
  if (rows.length === 0 && text.trim()) {
    const firstLine = text.trim().split('\n')[0].slice(0, 80);
    rows.push({ title: firstLine || '未命名素材', body: text.trim() });
  }
  return rows;
}

/**
 * 解析 Excel（.xlsx/.xls）：读取首个工作表，按表头映射到素材字段。
 * 依赖 xlsx 库（SheetJS）。若未安装，抛出清晰错误（不伪造通过）。
 */
export async function parseExcel(base64: string): Promise<MaterialRow[]> {
  let XLSX: { read: (b: Buffer, o: unknown) => { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_json: (ws: unknown, o: unknown) => Record<string, unknown>[] } };
  try {
    // 动态导入：避免未安装时构建失败；运行时按需加载
    // @ts-expect-error 动态可选依赖，类型由 package.json 的 xlsx 提供
    XLSX = await import('xlsx');
  } catch {
    throw new Error('Excel 解析需要 xlsx 依赖，请先安装（npm i xlsx）');
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    throw new Error('Excel 内容不是合法 base64');
  }
  const wb = XLSX.read(buf, { type: 'buffer' });
  if (!wb.SheetNames.length) throw new Error('Excel 工作簿为空');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const records = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const rows: MaterialRow[] = [];
  const skipped: string[] = [];
  records.forEach((rec, i) => {
    const mapped: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      const ck = canonicalMaterialKey(k);
      if (ck) mapped[ck] = v;
    }
    const r = coerceMaterialRow(mapped);
    if (!r.title) {
      skipped.push(`第 ${i + 1} 行：缺少 title`);
      return;
    }
    rows.push(r);
  });
  if (skipped.length) {
    // 不抛异常，容忍脏行；解析结果仍为有效行集合
  }
  return rows;
}

export interface MaterialParseResult {
  rows: MaterialRow[];
  skipped: string[];
}

/** 解析批量文本为素材行；结构错误（JSON 语法错）抛错，脏行计入 skipped。 */
export async function parseMaterials(raw: string, format: MaterialFormat): Promise<MaterialParseResult> {
  const text = (raw ?? '').replace(/\r\n/g, '\n');
  const skipped: string[] = [];
  let rows: MaterialRow[];
  switch (format) {
    case 'json':
    case 'form':
      rows = parseJson(text, skipped);
      break;
    case 'csv':
      rows = parseCsv(text, skipped);
      break;
    case 'lines':
      rows = parseLines(text, skipped);
      break;
    case 'markdown':
      rows = parseMarkdown(text, skipped);
      break;
    case 'excel':
      rows = await parseExcel(text);
      break;
    default:
      throw new Error(`不支持的导入格式：${format}`);
  }
  return { rows, skipped };
}

/**
 * 基于已存在（fingerprint→id）映射标记候选：
 * - 命中库内 → duplicate + existingId（默认动作 skip，用户可改 merge/copy）
 * - 批次内重复 → duplicate + batchDuplicateOf（默认动作 skip）
 * - 其余 → new（默认动作 create）
 */
export function classifyMaterialCandidates(
  rows: MaterialRow[],
  existingByFingerprint: Map<string, string>,
): MaterialImportCandidate[] {
  const seen = new Map<string, number>();
  return rows.map((row, index) => {
    const fp = computeFingerprint(row.title, row.body);
    let status: 'new' | 'duplicate' = 'new';
    let existingId: string | undefined;
    let reason: string | undefined;
    let batchDuplicateOf: number | undefined;
    let action: MaterialAction = 'create';
    if (existingByFingerprint.has(fp)) {
      status = 'duplicate';
      existingId = existingByFingerprint.get(fp);
      reason = '与库内已有素材指纹相同';
      action = 'skip';
    } else if (seen.has(fp)) {
      status = 'duplicate';
      batchDuplicateOf = seen.get(fp);
      reason = '批次内重复';
      action = 'skip';
    } else {
      seen.set(fp, index);
    }
    return { ...row, index, fingerprint: fp, status, existingId, reason, batchDuplicateOf, action };
  });
}
