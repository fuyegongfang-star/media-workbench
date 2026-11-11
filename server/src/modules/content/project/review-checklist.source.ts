// ============ 审核清单单一清单源（T5.2）============
// T3.6 审核清单模板 与 T3.11 合规预审硬卡点 合并为「单一清单源」：
//  - 人工可勾选项（静态项）在本文件集中定义，避免两处维护不一致；
//  - 合规预审项（compliance）由本文件按 DICTIONARY_VERSION 稳定生成，标识 source='compliance'，
//    运行期由 submitForReview 把真实预审结果同步进该项（checked=passed），实现「清单与预审单一真相源」。
// 纯函数，不依赖数据库/LLM 密钥，便于单测。

import { DICTIONARY_VERSION } from '../compliance/compliance-dictionary';

export type ReviewChecklistSource = 'static' | 'compliance';

export interface ReviewChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  note?: string | null;
  /** 清单项来源：static=人工可勾选项；compliance=由 T3.11 合规预审派生（单一清单源）。 */
  source?: ReviewChecklistSource;
}

/** 合规预审清单项的固定 id（与静态项区分，便于运行期定位与同步）。 */
export const COMPLIANCE_CHECKLIST_ID = 'compliance';

/** 人工可勾选的静态审核项（不含合规——合规由派生项承担）。 */
export const REVIEW_CHECKLIST_STATIC_LABELS: string[] = [
  '正文事实与数据核对无误',
  '排版与可读性良好（含 Markdown 结构）',
  '平台规范符合（图文/短视频要求）',
  '引用与版权清晰（无未授权素材）',
  'AI 生成标识声明已添加（合规 §12）',
];

/** 由词典版本生成合规预审清单项 label（含版本戳，字典演进时一眼可见）。 */
export function complianceChecklistLabel(dictionaryVersion: string = DICTIONARY_VERSION): string {
  return `合规预审通过（无阻断级极限词/违禁词，词表 v${dictionaryVersion}）`;
}

/**
 * 组合完整审核清单（单一清单源）：静态项 + 合规派生项。
 * 合规项固定为最后一条，checked 默认 false（运行期由真实预审结果同步）。
 */
export function buildReviewChecklist(
  dictionaryVersion: string = DICTIONARY_VERSION,
): ReviewChecklistItem[] {
  const staticItems = REVIEW_CHECKLIST_STATIC_LABELS.map((label, i) => ({
    id: `r${i + 1}`,
    label,
    checked: false,
    note: null,
    source: 'static' as const,
  }));
  const complianceItem: ReviewChecklistItem = {
    id: COMPLIANCE_CHECKLIST_ID,
    label: complianceChecklistLabel(dictionaryVersion),
    checked: false,
    note: null,
    source: 'compliance',
  };
  return [...staticItems, complianceItem];
}

/** 在已有清单中定位合规项（按 source 或固定 id 匹配；兼容旧数据无 source 字段）。 */
function findComplianceItem(items: ReviewChecklistItem[]): ReviewChecklistItem | undefined {
  return items.find(
    (it) => it.source === 'compliance' || it.id === COMPLIANCE_CHECKLIST_ID,
  );
}

/**
 * 把合规项 stamp 到已有清单（保留 checked/note，仅刷新 label/版本/来源）。
 * - 命中已有合规项：更新其 label 为当前词典版本、补 source 标记。
 * - 未命中：追加一条合规项（checked=false）。
 * 用于 getReview/upsertReview 加载时确保清单与字典版本一致（单一清单源）。
 */
export function stampComplianceItem(
  items: ReviewChecklistItem[],
  dictionaryVersion: string = DICTIONARY_VERSION,
): ReviewChecklistItem[] {
  const list = Array.isArray(items) ? items.slice() : [];
  const idx = list.findIndex(
    (it) => it.source === 'compliance' || it.id === COMPLIANCE_CHECKLIST_ID,
  );
  const fresh: ReviewChecklistItem = {
    id: COMPLIANCE_CHECKLIST_ID,
    label: complianceChecklistLabel(dictionaryVersion),
    checked: false,
    note: null,
    source: 'compliance',
  };
  if (idx >= 0) {
    const existing = list[idx];
    list[idx] = { ...fresh, checked: !!existing.checked, note: existing.note ?? null };
  } else {
    list.push(fresh);
  }
  return list;
}

/**
 * 把真实合规预审结果同步进清单的合规项（运行期单一真相源）。
 * - passed=true：置合规项 checked=true；
 * - passed=false：保持 unchecked（代表存在阻断级风险，需修改或显式覆盖）。
 * 未命中合规项时直接追加。返回新数组，不原地修改入参。
 */
export function syncComplianceChecklistItem(
  items: ReviewChecklistItem[],
  passed: boolean,
  dictionaryVersion: string = DICTIONARY_VERSION,
): ReviewChecklistItem[] {
  const list = Array.isArray(items) ? items.slice() : [];
  const idx = list.findIndex(
    (it) => it.source === 'compliance' || it.id === COMPLIANCE_CHECKLIST_ID,
  );
  const fresh: ReviewChecklistItem = {
    id: COMPLIANCE_CHECKLIST_ID,
    label: complianceChecklistLabel(dictionaryVersion),
    checked: passed,
    note: null,
    source: 'compliance',
  };
  if (idx >= 0) {
    const existing = list[idx];
    list[idx] = { ...fresh, note: existing.note ?? null };
  } else {
    list.push(fresh);
  }
  return list;
}

/** 校验并规整外部传入的清单项（透传 source，缺省 static）。纯函数，便于单测。 */
export function normalizeReviewChecklistInput(input: unknown): {
  ok: boolean;
  items?: ReviewChecklistItem[];
  error?: string;
} {
  if (!Array.isArray(input)) return { ok: false, error: 'checklist 必须是数组' };
  const items: ReviewChecklistItem[] = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: `checklist[${i}] 必须是对象` };
    const o = raw as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label.slice(0, 200).trim() : '';
    if (!label) return { ok: false, error: `checklist[${i}].label 不能为空` };
    const checked = o.checked === true;
    const note = typeof o.note === 'string' ? o.note.slice(0, 500) : null;
    const id = typeof o.id === 'string' && o.id ? o.id.slice(0, 64) : `r${i + 1}`;
    const source = o.source === 'compliance' ? 'compliance' : 'static';
    items.push({ id, label, checked, note, source });
  }
  return { ok: true, items };
}
