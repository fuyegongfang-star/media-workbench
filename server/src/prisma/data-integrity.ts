import { Prisma } from '@prisma/client';
import { requestContext } from '../common/request-context';

/**
 * 数据完整性扩展（T1.3 / 深入设计 §2.2 软删、§2.4 审计）。
 *
 * 两件事：
 *  1) 软删作用域：对带 deletedAt 的实体，list 类查询统一注入 deletedAt:null；
 *     delete / deleteMany 转写为 update / updateMany 并置 deletedAt，绝不物理删除。
 *  2) 审计：create / update / delete（含批量）写入 AuditEvent，不记明文密钥；
 *     失败仅告警，绝不阻断主流程。
 *
 * 设计要点：
 *  - 转换与审计统一走「内层 client」（defineExtension 捕获的 prisma），
 *    因此不会再次触发本扩展，避免递归。
 *  - AuditEvent 自身不审计（防自递归）。
 *  - 核心判定/改写抽成纯函数（isSoftDeletable / withSoftDeleteFilter /
 *    buildSoftDeleteMutation / extractObjectId / buildAuditEventData），
 *    不依赖数据库即可单测。
 */

// 带 deletedAt 字段的实体（与 schema.prisma 保持一致；User 无 deletedAt）。
export const SOFT_DELETE_MODELS = new Set<string>([
  'OwnedAccount',
  'ReferenceAccount',
  'SourceMaterial',
  'MediaAsset',
  'AccountStrategy',
  'Topic',
  'ContentProject',
  'LaunchPlan',
]);

const READ_OPERATIONS = new Set<string>([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const AUDITED_OPERATIONS = new Set<string>([
  'create',
  'update',
  'delete',
  'createMany',
  'updateMany',
  'deleteMany',
]);

export function isSoftDeletable(model: string | undefined): boolean {
  return model ? SOFT_DELETE_MODELS.has(model) : false;
}

/**
 * 读取类查询注入软删过滤；若调用方已显式给出 deletedAt（如管理端"查看已删"），
 * 则尊重其意图，不再覆盖。
 */
export function withSoftDeleteFilter(
  model: string | undefined,
  operation: string,
  args: Record<string, any> = {},
): Record<string, any> {
  if (!isSoftDeletable(model)) return args;
  if (!READ_OPERATIONS.has(operation)) return args;
  if (args.where && args.where.deletedAt !== undefined) return args;
  return {
    ...args,
    where: { ...(args.where ?? {}), deletedAt: null },
  };
}

/**
 * 将物理删除改写为软删更新。返回 null 表示无需改写（非删除操作）。
 */
export function buildSoftDeleteMutation(
  model: string | undefined,
  operation: string,
  args: Record<string, any> = {},
): { operation: 'update' | 'updateMany'; args: Record<string, any> } | null {
  if (!isSoftDeletable(model)) return null;
  const now = new Date();
  if (operation === 'delete') {
    return {
      operation: 'update',
      args: { where: args.where, data: { deletedAt: now } },
    };
  }
  if (operation === 'deleteMany') {
    return {
      operation: 'updateMany',
      args: { where: args.where ?? {}, data: { deletedAt: now } },
    };
  }
  return null;
}

/** 从查询参数/返回结果中提取被操作对象的主键 id（批量操作记为 'many'）。 */
export function extractObjectId(
  operation: string,
  args: Record<string, any> = {},
  result: any = undefined,
): string | undefined {
  if (operation === 'deleteMany' || operation === 'updateMany' || operation === 'createMany') {
    return 'many';
  }
  if (result && typeof result === 'object' && result !== null && 'id' in result) {
    return String(result.id);
  }
  const where = args?.where;
  if (where && where.id) return String(where.id);
  return undefined;
}

/** 构造 AuditEvent.create 的数据体（不写任何明文密钥）。 */
export function buildAuditEventData(params: {
  model: string | undefined;
  operation: string;
  objectId: string | undefined;
  userId: string | null | undefined;
}): Record<string, any> {
  return {
    userId: params.userId ?? null,
    objectType: params.model ?? 'Unknown',
    objectId: params.objectId ?? '',
    action: params.operation,
  };
}

async function writeAudit(
  prisma: any,
  model: string | undefined,
  operation: string,
  objectId: string | undefined,
  userId: string | null | undefined,
): Promise<void> {
  if (model === 'AuditEvent') return; // 不自审计
  try {
    const inner = prisma as Record<string, any>;
    await inner['auditEvent'].create({
      data: buildAuditEventData({ model, operation, objectId, userId }),
    });
  } catch {
    // 审计失败绝不影响主流程；不回显任何数据（深入设计 §2.4）
  }
}

export const dataIntegrityExtension = Prisma.defineExtension((prisma) =>
  prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const m = model ?? '';

          if (isSoftDeletable(m)) {
            const isDelete = operation === 'delete' || operation === 'deleteMany';

            // 读取类查询注入软删过滤
            if (READ_OPERATIONS.has(operation) && args.where?.deletedAt === undefined) {
              args.where = { ...(args.where ?? {}), deletedAt: null };
            }

            // 物理删除 → 软删更新（走内层 client，避免递归）
            if (isDelete) {
              const mutation = buildSoftDeleteMutation(m, operation, args);
              if (mutation) {
                const inner = prisma as unknown as Record<string, any>;
                const result = await inner[m][mutation.operation](mutation.args);
                await writeAudit(
                  prisma,
                  m,
                  operation === 'delete' ? 'delete' : 'delete_many',
                  extractObjectId(operation, args, result),
                  requestContext.getUserId(),
                );
                return result;
              }
            }
          }

          const result = await query(args);

          if (AUDITED_OPERATIONS.has(operation) && m !== 'AuditEvent') {
            await writeAudit(
              prisma,
              m,
              operation,
              extractObjectId(operation, args, result),
              requestContext.getUserId(),
            );
          }
          return result;
        },
      },
    },
  }),
);
