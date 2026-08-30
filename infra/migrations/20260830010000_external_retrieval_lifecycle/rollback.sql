DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "temporary_documents" WHERE "state" <> 'deleted') THEN
    RAISE EXCEPTION 'external retrieval rollback blocked: cached objects remain';
  END IF;
END $$;

DROP TABLE IF EXISTS "temporary_document_accesses";
DROP TABLE IF EXISTS "temporary_documents";
DROP TABLE IF EXISTS "source_rights_decisions";
DROP TABLE IF EXISTS "external_sources";

DROP TYPE IF EXISTS "TemporaryDocumentState";
DROP TYPE IF EXISTS "SourceDownloadPolicy";
DROP TYPE IF EXISTS "SourceRightsBasis";
DROP TYPE IF EXISTS "ExternalSourceProvider";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260830010000_external_retrieval_lifecycle';
