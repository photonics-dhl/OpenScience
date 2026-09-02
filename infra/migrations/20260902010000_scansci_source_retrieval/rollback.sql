DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "source_rights_decisions"
    WHERE "basis" = 'source_retrieval'
  ) THEN
    RAISE EXCEPTION 'ScanSci source_retrieval rollback blocked: dependent rows remain';
  END IF;
END $$;

ALTER TABLE "source_rights_decisions"
  ALTER COLUMN "basis" TYPE TEXT USING "basis"::TEXT;

DROP TYPE "SourceRightsBasis";

CREATE TYPE "SourceRightsBasis" AS ENUM (
  'open_access',
  'institutional_access',
  'public_domain',
  'self_authored',
  'unknown',
  'prohibited'
);

ALTER TABLE "source_rights_decisions"
  ALTER COLUMN "basis" TYPE "SourceRightsBasis"
  USING "basis"::"SourceRightsBasis";

DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20260902010000_scansci_source_retrieval';
