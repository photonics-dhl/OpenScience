DROP TABLE IF EXISTS "presentation_asset_claims";
DROP TABLE IF EXISTS "presentation_assets";
DROP TABLE IF EXISTS "evidence_records";
DROP TABLE IF EXISTS "claim_nodes";
DROP TABLE IF EXISTS "research_identity_profiles";

DROP INDEX IF EXISTS "versions_id_research_object_id_key";
DROP INDEX IF EXISTS "artifacts_id_workspace_id_key";
DROP INDEX IF EXISTS "research_objects_id_workspace_id_key";

DROP TYPE IF EXISTS "PresentationAssetStatus";
DROP TYPE IF EXISTS "PresentationAssetKind";
DROP TYPE IF EXISTS "ExtractionStatus";
DROP TYPE IF EXISTS "ClaimRelation";
DROP TYPE IF EXISTS "EvidenceKind";
DROP TYPE IF EXISTS "ClaimAssessment";
DROP TYPE IF EXISTS "ClaimKind";
DROP TYPE IF EXISTS "ResearchIdentity";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260826010000_research_intelligence_core';
