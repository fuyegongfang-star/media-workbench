import { IsArray, IsString } from 'class-validator';

/** 拖拽重排：提交拖拽后的完整 id 顺序（T4.2）。服务端按真实存在集合校验。 */
export class ReorderImageItemsDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}
