// T2.2 素材批量导入控制器：预览（无令牌 401）/ 提交（无令牌 401）。
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { MaterialImportService, type MaterialCommitRow } from './material-import.service';
import { MaterialImportCommitDto, MaterialImportPreviewDto } from './dto/material-import.dto';

@Controller('analysis/materials')
@UseGuards(AccessTokenGuard)
export class MaterialImportController {
  constructor(private readonly svc: MaterialImportService) {}

  /** 解析 + 指纹去重预览，不落库；供前端展示候选与重复标记及三选一动作。 */
  @Post('import/preview')
  preview(@Body() dto: MaterialImportPreviewDto) {
    return this.svc.previewMaterialImport(dto.referenceAccountId, dto.raw, dto.format);
  }

  /** 按每行 action 提交：skip 跳过 / create 入库 / copy 保留副本 / merge 设 duplicateOfId。 */
  @Post('import')
  commit(@Body() dto: MaterialImportCommitDto) {
    return this.svc.commitMaterialImport(dto.referenceAccountId, dto.rows as MaterialCommitRow[]);
  }
}
