// T2.1 对标账号批量导入控制器：预览（无令牌 401）/ 提交（无令牌 401）。
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { ReferenceImportService, type CommitRow } from './reference-import.service';
import {
  ImportReferenceCommitDto,
  ImportReferencePreviewDto,
} from './dto/import-reference-accounts.dto';

@Controller('analysis/reference-accounts')
@UseGuards(AccessTokenGuard)
export class ReferenceImportController {
  constructor(private readonly svc: ReferenceImportService) {}

  /** 解析 + 去重预览，不落库；供前端展示候选与重复标记。 */
  @Post('import/preview')
  preview(@Body() dto: ImportReferencePreviewDto) {
    return this.svc.previewReferenceImport(dto.raw, dto.format);
  }

  /** 按每行 action 提交创建；action=create 入库，action=skip 跳过。 */
  @Post('import')
  commit(@Body() dto: ImportReferenceCommitDto) {
    return this.svc.commitReferenceImport(dto.rows as CommitRow[]);
  }
}
