CREATE TABLE "research_organizations" (
  "id" UUID NOT NULL,
  "ror_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "country_code" CHAR(2),
  "types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL,
  "dataset_version" TEXT NOT NULL,
  "source_updated_at" TIMESTAMP(3),
  "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "research_organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "research_organizations_ror_id_check" CHECK ("ror_id" ~ '^https://ror\.org/0[0-9a-hj-km-np-tv-z]{6}[0-9]{2}$'),
  CONSTRAINT "research_organizations_status_check" CHECK ("status" IN ('active', 'inactive', 'withdrawn'))
);

CREATE UNIQUE INDEX "research_organizations_ror_id_key" ON "research_organizations"("ror_id");
CREATE INDEX "research_organizations_status_idx" ON "research_organizations"("status");
CREATE INDEX "research_organizations_country_code_idx" ON "research_organizations"("country_code");
CREATE INDEX "research_organizations_domains_gin_idx" ON "research_organizations" USING GIN ("domains");

ALTER TABLE "identity_credentials" ADD COLUMN "research_organization_id" UUID;
ALTER TABLE "institution_email_challenges" ADD COLUMN "research_organization_id" UUID;
CREATE INDEX "identity_credentials_research_organization_id_idx" ON "identity_credentials"("research_organization_id");
CREATE INDEX "institution_email_challenges_research_organization_id_idx" ON "institution_email_challenges"("research_organization_id");
ALTER TABLE "identity_credentials" ADD CONSTRAINT "identity_credentials_research_organization_id_fkey" FOREIGN KEY ("research_organization_id") REFERENCES "research_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "institution_email_challenges" ADD CONSTRAINT "institution_email_challenges_research_organization_id_fkey" FOREIGN KEY ("research_organization_id") REFERENCES "research_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
