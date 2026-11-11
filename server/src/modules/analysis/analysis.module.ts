import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';
import { GenerationModule } from '../generation/generation.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { ReferenceImportService } from './reference-import.service';
import { ReferenceImportController } from './reference-import.controller';
import { MaterialImportService } from './material-import.service';
import { MaterialImportController } from './material-import.controller';

/**
 * 对标分析模块（Phase 2 起）。
 * - T2.1：对标账号批量导入（解析/去重预览 + 按决策提交）。
 * - T2.2：素材批量导入（csv/json/markdown/lines/form/excel + 指纹去重预览 + 三选一）。
 * - T2.3：单篇拆解（ANALYSIS_SINGLE）—— AnalysisService 注册处理器到 TaskHandlerRegistry，
 *   经 LlmProviderService 调 LLM 并写 AnalysisRun + Analysis(kind=single)。
 * 复用 AuthModule 的 AccessTokenGuard、TasksModule 的任务中心与注册表、GenerationModule 的 LLM 解析。
 */
@Module({
  imports: [AuthModule, TasksModule, GenerationModule],
  controllers: [AnalysisController, ReferenceImportController, MaterialImportController],
  providers: [AnalysisService, ReferenceImportService, MaterialImportService],
  exports: [AnalysisService, ReferenceImportService, MaterialImportService],
})
export class AnalysisModule {}
