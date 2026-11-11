-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('wechat');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'editor');

-- CreateEnum
CREATE TYPE "OwnedAccountStatus" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "MediaAssetType" AS ENUM ('image', 'video', 'audio', 'file');

-- CreateEnum
CREATE TYPE "MediaOwnerType" AS ENUM ('source_material', 'content_project', 'owned_account', 'launch_task');

-- CreateEnum
CREATE TYPE "AnalysisRunType" AS ENUM ('single', 'account_summary');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('queued', 'running', 'success', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AnalysisKind" AS ENUM ('single', 'aggregate');

-- CreateEnum
CREATE TYPE "AccountStrategyStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "PromptTaskType" AS ENUM ('single_analysis', 'account_summary', 'strategy_draft', 'topic_gen', 'title_gen', 'article_draft', 'article_edit', 'polish', 'caption_gen');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "TitleCandidateStatus" AS ENUM ('draft', 'selected', 'rejected');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('article', 'image');

-- CreateEnum
CREATE TYPE "ContentProjectStatus" AS ENUM ('TOPIC_SELECTING', 'PENDING_CREATION', 'CREATING', 'PENDING_REVIEW', 'NEEDS_REVISION', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentVersionSource" AS ENUM ('manual', 'draft', 'continue', 'rewrite', 'compress', 'expand', 'polish', 'detect');

-- CreateEnum
CREATE TYPE "LaunchPlanType" AS ENUM ('article', 'image');

-- CreateEnum
CREATE TYPE "LaunchPlanStatus" AS ENUM ('draft', 'active', 'paused', 'done');

-- CreateEnum
CREATE TYPE "LaunchTaskStatus" AS ENUM ('pending', 'in_progress', 'done', 'skipped');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owned_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'wechat',
    "name" TEXT NOT NULL,
    "position" JSONB,
    "audience" JSONB,
    "columns" JSONB,
    "status" "OwnedAccountStatus" NOT NULL DEFAULT 'active',
    "default_strategy_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "owned_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_accounts" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'wechat',
    "name" TEXT NOT NULL,
    "homepage_url" TEXT,
    "domain" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reference_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_materials" (
    "id" TEXT NOT NULL,
    "reference_account_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source_url" TEXT,
    "author" TEXT,
    "collected_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "license_note" TEXT,
    "fingerprint" TEXT NOT NULL,
    "duplicate_of_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "source_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "owner_type" "MediaOwnerType" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "type" "MediaAssetType" NOT NULL,
    "source" TEXT,
    "license_note" TEXT,
    "usage" TEXT,
    "size" BIGINT,
    "dimensions" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" TEXT NOT NULL,
    "type" "AnalysisRunType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'queued',
    "scope" JSONB NOT NULL,
    "prompt_template_version_id" TEXT,
    "model" TEXT,
    "output" JSONB,
    "error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "material_id" TEXT,
    "account_id" TEXT,
    "kind" "AnalysisKind" NOT NULL,
    "structured" JSONB NOT NULL,
    "useful_flag" BOOLEAN,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_strategies" (
    "id" TEXT NOT NULL,
    "owned_account_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AccountStrategyStatus" NOT NULL DEFAULT 'draft',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "position" JSONB NOT NULL,
    "audience" JSONB NOT NULL,
    "pillars" JSONB NOT NULL,
    "title_pref" JSONB NOT NULL,
    "structure" JSONB NOT NULL,
    "tone" JSONB NOT NULL,
    "boundaries" JSONB NOT NULL,
    "source_analysis_ids" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "account_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "task_type" "PromptTaskType" NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'wechat',
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "strategy_id" TEXT,
    "analysis_id" TEXT,
    "title" TEXT NOT NULL,
    "audience" TEXT,
    "angle" TEXT,
    "status" "TopicStatus" NOT NULL DEFAULT 'draft',
    "tags" JSONB NOT NULL,
    "source_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_candidates" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "basis" TEXT,
    "score" DOUBLE PRECISION,
    "tags" JSONB NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "status" "TitleCandidateStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "title_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_projects" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'wechat',
    "owned_account_id" TEXT NOT NULL,
    "topic_id" TEXT,
    "selected_title_id" TEXT,
    "strategy_version_id" TEXT,
    "content_type" "ContentType" NOT NULL DEFAULT 'article',
    "status" "ContentProjectStatus" NOT NULL DEFAULT 'TOPIC_SELECTING',
    "working_content" TEXT,
    "current_version_id" TEXT,
    "published_at" TIMESTAMP(3),
    "external_url" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "content_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "source" "ContentVersionSource" NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stage" "ContentVersionSource" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_template_version_id" TEXT,
    "prompt_snapshot" TEXT NOT NULL,
    "output_version_id" TEXT,
    "cost" DOUBLE PRECISION,
    "duration_ms" INTEGER,
    "status" "TaskStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_review_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "raw_response" JSONB NOT NULL,
    "summary" TEXT,
    "detected_at" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'queued',
    "user_decision" TEXT,
    "service_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "text_review_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "launch_plans" (
    "id" TEXT NOT NULL,
    "owned_account_id" TEXT NOT NULL,
    "type" "LaunchPlanType" NOT NULL,
    "goal" TEXT NOT NULL,
    "start" TIMESTAMP(3),
    "end" TIMESTAMP(3),
    "frequency" TEXT,
    "status" "LaunchPlanStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "launch_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "launch_tasks" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "caption" TEXT,
    "material_refs" JSONB NOT NULL,
    "project_id" TEXT,
    "status" "LaunchTaskStatus" NOT NULL DEFAULT 'pending',
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "launch_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "base_url" TEXT,
    "model" TEXT NOT NULL,
    "api_key_encrypted" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "owned_accounts_user_id_deleted_at_idx" ON "owned_accounts"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "source_materials_reference_account_id_fingerprint_idx" ON "source_materials"("reference_account_id", "fingerprint");

-- CreateIndex
CREATE INDEX "source_materials_deleted_at_idx" ON "source_materials"("deleted_at");

-- CreateIndex
CREATE INDEX "media_assets_owner_type_owner_id_idx" ON "media_assets"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "media_assets_checksum_idx" ON "media_assets"("checksum");

-- CreateIndex
CREATE INDEX "analysis_runs_type_status_idx" ON "analysis_runs"("type", "status");

-- CreateIndex
CREATE INDEX "analyses_run_id_idx" ON "analyses"("run_id");

-- CreateIndex
CREATE INDEX "analyses_material_id_idx" ON "analyses"("material_id");

-- CreateIndex
CREATE INDEX "analyses_account_id_idx" ON "analyses"("account_id");

-- CreateIndex
CREATE INDEX "account_strategies_owned_account_id_is_default_idx" ON "account_strategies"("owned_account_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "account_strategies_owned_account_id_version_key" ON "account_strategies"("owned_account_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_task_type_platform_version_key" ON "prompt_templates"("task_type", "platform", "version");

-- CreateIndex
CREATE INDEX "topics_status_deleted_at_idx" ON "topics"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "title_candidates_topic_id_selected_idx" ON "title_candidates"("topic_id", "selected");

-- CreateIndex
CREATE INDEX "content_projects_owned_account_id_status_deleted_at_idx" ON "content_projects"("owned_account_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "content_versions_project_id_version_no_idx" ON "content_versions"("project_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_project_id_version_no_key" ON "content_versions"("project_id", "version_no");

-- CreateIndex
CREATE INDEX "generation_runs_project_id_stage_status_idx" ON "generation_runs"("project_id", "stage", "status");

-- CreateIndex
CREATE INDEX "text_review_runs_project_id_version_id_idx" ON "text_review_runs"("project_id", "version_id");

-- CreateIndex
CREATE INDEX "launch_plans_owned_account_id_status_idx" ON "launch_plans"("owned_account_id", "status");

-- CreateIndex
CREATE INDEX "launch_tasks_plan_id_status_idx" ON "launch_tasks"("plan_id", "status");

-- CreateIndex
CREATE INDEX "launch_tasks_project_id_idx" ON "launch_tasks"("project_id");

-- CreateIndex
CREATE INDEX "audit_events_object_type_object_id_idx" ON "audit_events"("object_type", "object_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_provider_model_key" ON "system_configs"("provider", "model");

-- AddForeignKey
ALTER TABLE "owned_accounts" ADD CONSTRAINT "owned_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owned_accounts" ADD CONSTRAINT "owned_accounts_default_strategy_version_id_fkey" FOREIGN KEY ("default_strategy_version_id") REFERENCES "account_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_reference_account_id_fkey" FOREIGN KEY ("reference_account_id") REFERENCES "reference_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "source_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_prompt_template_version_id_fkey" FOREIGN KEY ("prompt_template_version_id") REFERENCES "prompt_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "source_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "reference_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_strategies" ADD CONSTRAINT "account_strategies_owned_account_id_fkey" FOREIGN KEY ("owned_account_id") REFERENCES "owned_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "account_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_candidates" ADD CONSTRAINT "title_candidates_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_owned_account_id_fkey" FOREIGN KEY ("owned_account_id") REFERENCES "owned_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_selected_title_id_fkey" FOREIGN KEY ("selected_title_id") REFERENCES "title_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_strategy_version_id_fkey" FOREIGN KEY ("strategy_version_id") REFERENCES "account_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_prompt_template_version_id_fkey" FOREIGN KEY ("prompt_template_version_id") REFERENCES "prompt_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_output_version_id_fkey" FOREIGN KEY ("output_version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_review_runs" ADD CONSTRAINT "text_review_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_review_runs" ADD CONSTRAINT "text_review_runs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "launch_plans" ADD CONSTRAINT "launch_plans_owned_account_id_fkey" FOREIGN KEY ("owned_account_id") REFERENCES "owned_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "launch_tasks" ADD CONSTRAINT "launch_tasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "launch_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "launch_tasks" ADD CONSTRAINT "launch_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

