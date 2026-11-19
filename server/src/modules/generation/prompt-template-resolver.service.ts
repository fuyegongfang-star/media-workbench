import type { PrismaService } from '../../prisma/prisma.service';
import { pickPromptTemplate } from '../system/prompt-template.util';

/**
 * 统一的提示词模板解析函数（T6 体验优化）。
 *
 * 此前 7 处各自 `promptTemplate.findFirst({ enabled:true, orderBy version desc })`，
 * 只能取「全局最新版本」，无法支持「某账号专属模板」。
 * 这里改为取该 (taskType, platform) 的全部启用模板 → 纯函数按
 * 「账号专属且命中 > 全局 > 其它账号专属（忽略）」+ version 降序挑选。
 *
 * 设计成纯函数 + 传入 prisma（而非 DI Service）：各生成 service 无需改 constructor / module 注册，
 * 只替换一行调用即可，侵入最小。未传 ownedAccountId 时行为与旧版完全一致（取最新全局模板）。
 */
export async function resolvePromptTemplate(
  prisma: PrismaService,
  taskType: string,
  platform: string,
  ownedAccountId?: string | null,
): Promise<{ id: string; version: number; content: string } | null> {
  const rows = await prisma.client.promptTemplate.findMany({
    where: { taskType: taskType as never, platform: platform as never, enabled: true },
    orderBy: { version: 'desc' },
  });
  const picked = pickPromptTemplate(
    rows.map((r) => ({
      id: r.id,
      taskType: r.taskType,
      platform: r.platform,
      version: r.version,
      content: r.content,
      enabled: r.enabled,
      variables: r.variables,
    })),
    ownedAccountId,
  );
  return picked ? { id: picked.id, version: picked.version, content: picked.content } : null;
}
