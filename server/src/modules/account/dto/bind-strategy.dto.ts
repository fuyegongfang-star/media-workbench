import { IsOptional } from 'class-validator';

/**
 * 绑定策略版本到自有账号（T2.5）。
 * strategyId 为待绑定的 AccountStrategy.id；省略或为 null 表示解绑。
 * 经全局 ValidationPipe 白名单；此处不强制字符串类型，由服务层做非空/归属校验（允许 null 解绑）。
 */
export class BindStrategyDto {
  @IsOptional()
  strategyId?: string | null;
}
