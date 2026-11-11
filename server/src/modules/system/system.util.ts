/**
 * 系统设置纯函数（不依赖数据库，可单测）。
 */

/** 合规开关默认值（深入设计 §12 合规：AI 生成标识声明默认为必填）。 */
export const DEFAULT_COMPLIANCE: Record<string, unknown> = {
  aiDisclosureRequired: true,
  autoSaveEnabled: true,
  strictReview: false,
};

/**
 * 合并合规开关：默认 → 已存值 → 入参，后者覆盖前者。
 * 仅接受布尔值，非布尔字段忽略，避免异常输入污染 Json。
 */
export function mergeCompliance(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...DEFAULT_COMPLIANCE };
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (typeof value === 'boolean') merged[key] = value;
  }
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (typeof value === 'boolean') merged[key] = value;
  }
  return merged;
}
