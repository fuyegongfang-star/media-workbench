import { Global, Module } from '@nestjs/common';

/** 深入设计 §2.2：list 查询统一注入 deletedAt: null（T1.3 落地查询作用域中间件）。 */
export const NOT_DELETED = { deletedAt: null } as const;

@Global()
@Module({})
export class CommonModule {}
