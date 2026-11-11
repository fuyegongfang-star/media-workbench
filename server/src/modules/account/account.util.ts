/**
 * 账号与策略模块的纯函数（T1.7）：不依赖数据库，可单测。
 * 覆盖策略版本号递增与"设为默认策略"的切换意图规划。
 */

/**
 * 判断值是否为合法的 Prisma Json 值（递归：对象/数组/字符串/数字/布尔/null）。
 * 用于 DTO 校验器 IsPrismaJson，以及服务端兜底校验。
 */
export function isPrismaJsonValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isPrismaJsonValue);
  if (t === 'object') {
    return Object.values(value as Record<string, unknown>).every(isPrismaJsonValue);
  }
  return false;
}

/** 计算策略下一版本号：在该自有账号现有版本集合上取 max + 1（无则 1）。 */
export function nextStrategyVersion(existingVersions: number[]): number {
  if (!existingVersions.length) return 1;
  return Math.max(...existingVersions) + 1;
}

/**
 * 规划"设为默认策略"的切换意图（纯函数，便于单测）。
 * - isDefault === true：目标置默认；若目标当前不是默认，需清掉同账号下其它默认。
 * - isDefault === false：显式取消默认（仅当目标当前是默认时才需动）。
 * - isDefault 未传：保持现状。
 */
export function planDefaultStrategyToggle(params: {
  isDefault?: boolean;
  strategyId: string;
  activeDefaultId: string | null;
}): { targetDefault: boolean; unsetOthers: boolean } {
  const { isDefault, strategyId, activeDefaultId } = params;
  if (isDefault === true) {
    return { targetDefault: true, unsetOthers: activeDefaultId !== strategyId };
  }
  if (isDefault === false) {
    // 显式取消：仅当目标当前是默认才有意义（unsetOthers 留给调用方按需处理）
    return { targetDefault: false, unsetOthers: activeDefaultId === strategyId };
  }
  return { targetDefault: activeDefaultId === strategyId, unsetOthers: false };
}

/**
 * 规划"策略版本绑定到自有账号"的目标外键值（纯函数，便于单测）。
 * - strategyId 为 null/undefined：解绑，目标外键置 null。
 * - 否则：目标外键 = strategyId。
 * 返回值 changed 供调用方判断是否需要落库，避免无谓写操作。
 */
export function planBindStrategyToAccount(params: {
  strategyId: string | null | undefined;
  currentBoundId: string | null;
}): { boundId: string | null; changed: boolean } {
  const boundId = params.strategyId ?? null;
  return { boundId, changed: boundId !== params.currentBoundId };
}
