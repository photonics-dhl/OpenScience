-- Roll back only after stopping trash-capable writers. Resource data is never deleted by this rollback.
-- Refuse to expose hidden content or discard pending cleanup; restore/finish those entries first.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM trash_entries WHERE state IN ('trashed','purge_pending'))
    OR EXISTS (SELECT 1 FROM trash_object_cleanup WHERE state IN ('pending','deleting','deleted'))
    OR EXISTS (SELECT 1 FROM artifacts WHERE bytes_purged_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Retain trash schema while content is hidden or bytes have been purged';
  END IF;
END $$;
DROP TRIGGER trash_preserve_public_history ON research_objects;
DROP FUNCTION openscience_preserve_public_history();
DROP TRIGGER trash_temporary_document_source ON temporary_documents;
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['research_objects','agent_sessions','agent_tasks','artifacts','presentation_assets','ingestion_batches','ingestion_tasks','versions','version_manifests','manifest_entries','sdf_documents','sdf_nodes','commits','changesets','evidence_records','claim_nodes','hermes_research_runs','hermes_research_steps','tool_approvals','authors','contributions','license_assignments','branches','visibility_grants','visibility_requests','issues','pull_requests','reviews','comments','identifiers','publications','fork_relations','presentation_asset_claims','ai_reviews','appeals'] LOOP
    EXECUTE format('DROP TRIGGER trash_live_parent ON %I',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['blobs','artifacts','agent_tasks','presentation_assets','manifest_entries','version_manifests','versions','sdf_documents','changesets','evidence_records','temporary_documents'] LOOP
    EXECUTE format('DROP TRIGGER a_trash_storage_reference ON %I',table_name);
  END LOOP;
END $$;
DROP FUNCTION openscience_require_live_parent();
DROP FUNCTION openscience_guard_storage_reference();
ALTER TABLE research_objects DROP COLUMN deleted_at, DROP COLUMN trash_entry_id;
ALTER TABLE agent_sessions DROP COLUMN deleted_at, DROP COLUMN trash_entry_id;
ALTER TABLE agent_tasks DROP COLUMN deleted_at, DROP COLUMN trash_entry_id;
ALTER TABLE artifacts DROP COLUMN deleted_at, DROP COLUMN trash_entry_id, DROP COLUMN bytes_purged_at;
ALTER TABLE presentation_assets DROP COLUMN deleted_at, DROP COLUMN trash_entry_id;
DROP TABLE trash_object_cleanup;
DROP TABLE trash_entries;

