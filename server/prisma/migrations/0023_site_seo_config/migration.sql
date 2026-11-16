-- T6.7 Site branding / TDK / SEO-GEO / footer metadata.
-- Additive only: existing single site_configs row keeps the default '{}'.
-- Values are validated by server/src/modules/system/seo.util.ts before being written.
ALTER TABLE "site_configs"
  ADD COLUMN "seo_config" JSONB NOT NULL DEFAULT '{}';
