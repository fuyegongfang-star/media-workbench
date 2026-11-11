import { IsString } from 'class-validator';

/** 拖拽改期：传入目标日期（YYYY-MM-DD，本地日）。类型合法性由 service 进一步校验。 */
export class RescheduleItemDto {
  /** 目标日期，本地 YYYY-MM-DD。 */
  @IsString()
  date!: string;
}
