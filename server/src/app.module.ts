import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
// §3 后端模块划分：7 个 PRD 导航模块 + 4 个跨切面模块
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ContentModule } from './modules/content/content.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { LaunchModule } from './modules/launch/launch.module';
import { LibraryModule } from './modules/library/library.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { AccountModule } from './modules/account/account.module';
import { SystemModule } from './modules/system/system.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { NotificationModule } from './modules/notification/notification.module';
import { GenerationModule } from './modules/generation/generation.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommonModule } from './modules/common/common.module';
import { CalendarModule } from './modules/calendar/calendar.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    CommonModule,
    DashboardModule,
    ContentModule,
    AnalysisModule,
    LaunchModule,
    LibraryModule,
    MetricsModule,
    AccountModule,
    SystemModule,
    ObservabilityModule,
    NotificationModule,
    GenerationModule,
    TasksModule,
    StorageModule,
    AuthModule,
    CalendarModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
