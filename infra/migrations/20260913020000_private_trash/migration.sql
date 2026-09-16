-- Additive private trash. No existing research data is marked or removed.
ALTER TABLE research_objects ADD COLUMN deleted_at TIMESTAMP(3), ADD COLUMN trash_entry_id UUID;
ALTER TABLE agent_sessions ADD COLUMN deleted_at TIMESTAMP(3), ADD COLUMN trash_entry_id UUID;
ALTER TABLE agent_tasks ADD COLUMN deleted_at TIMESTAMP(3), ADD COLUMN trash_entry_id UUID;
ALTER TABLE artifacts ADD COLUMN deleted_at TIMESTAMP(3), ADD COLUMN trash_entry_id UUID, ADD COLUMN bytes_purged_at TIMESTAMP(3);
ALTER TABLE presentation_assets ADD COLUMN deleted_at TIMESTAMP(3), ADD COLUMN trash_entry_id UUID;
CREATE TABLE trash_entries (
  id UUID PRIMARY KEY, kind TEXT NOT NULL, resource_id UUID NOT NULL, owner_id UUID NOT NULL,
  workspace_id UUID, research_object_id UUID, parent_id UUID, label TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'trashed', retained_reason TEXT, deleted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  purge_after TIMESTAMP(3) NOT NULL, purged_at TIMESTAMP(3), last_error TEXT, purge_scope JSONB,
  CONSTRAINT trash_entries_kind_check CHECK (kind IN ('research_object','session','task','asset','artifact')),
  CONSTRAINT trash_entries_state_check CHECK (state IN ('trashed','purge_pending','restored','purged','retained'))
);
CREATE INDEX trash_entries_owner_id_state_deleted_at_idx ON trash_entries(owner_id,state,deleted_at);
CREATE INDEX trash_entries_state_purge_after_idx ON trash_entries(state,purge_after);
CREATE INDEX trash_entries_kind_resource_id_state_idx ON trash_entries(kind,resource_id,state);
CREATE INDEX trash_entries_parent_id_idx ON trash_entries(parent_id);
CREATE UNIQUE INDEX trash_entries_active_resource_key ON trash_entries(kind,resource_id) WHERE state IN ('trashed','purge_pending');
CREATE TABLE trash_object_cleanup (
  object_key TEXT PRIMARY KEY, trash_entry_id UUID NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX trash_object_cleanup_trash_entry_id_state_idx ON trash_object_cleanup(trash_entry_id,state);

-- A late task or child insert must not revive deleted research. Parent row locks are shared with publication.
CREATE FUNCTION openscience_require_live_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ro UUID; sid UUID; aid UUID; tid UUID; gone TIMESTAMP(3); row_json JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(728413920);
  IF TG_OP = 'DELETE' THEN NEW := OLD; END IF;
  IF current_setting('openscience.trash_mutation', true) = 'on' THEN RETURN NEW; END IF;
  row_json := to_jsonb(NEW);
  IF TG_OP='INSERT' AND EXISTS (SELECT 1 FROM trash_entries WHERE resource_id=(row_json->>'id')::uuid
    AND kind=CASE TG_TABLE_NAME WHEN 'research_objects' THEN 'research_object' WHEN 'agent_sessions' THEN 'session'
      WHEN 'agent_tasks' THEN 'task' WHEN 'artifacts' THEN 'artifact' WHEN 'presentation_assets' THEN 'asset' ELSE '' END
    AND state IN ('trashed','purge_pending','purged')) THEN
    RAISE EXCEPTION 'Deleted resource identity cannot be recreated by a late writer' USING ERRCODE='55000';
  END IF;
  IF row_json->>'deleted_at' IS NOT NULL THEN RAISE EXCEPTION 'Content is in trash' USING ERRCODE = '55000'; END IF;
  IF TG_TABLE_NAME = 'research_objects' THEN
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Research Object is in trash' USING ERRCODE = '55000'; END IF;
    RETURN NEW;
  END IF;
  ro := NULLIF(row_json->>'research_object_id','')::uuid;
  IF TG_TABLE_NAME = 'agent_tasks' THEN
    sid := NEW.session_id;
    SELECT research_object_id, deleted_at INTO ro, gone FROM agent_sessions WHERE id = sid FOR UPDATE;
    IF gone IS NOT NULL THEN RAISE EXCEPTION 'Conversation is in trash' USING ERRCODE = '55000'; END IF;
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Task is in trash' USING ERRCODE = '55000'; END IF;
  ELSIF TG_TABLE_NAME = 'ingestion_tasks' THEN
    SELECT research_object_id INTO ro FROM ingestion_batches WHERE id = NEW.batch_id;
    tid := NEW.agent_task_id; aid := NEW.artifact_id;
  ELSIF TG_TABLE_NAME = 'manifest_entries' THEN
    SELECT v.research_object_id INTO ro FROM version_manifests m JOIN versions v ON v.id = m.version_id WHERE m.id = NEW.manifest_id;
    aid := NEW.artifact_id;
  ELSIF TG_TABLE_NAME = 'version_manifests' THEN
    SELECT research_object_id INTO ro FROM versions WHERE id = NEW.version_id;
  ELSIF TG_TABLE_NAME = 'sdf_nodes' THEN
    SELECT research_object_id INTO ro FROM sdf_documents WHERE id = NEW.sdf_document_id;
  ELSIF TG_TABLE_NAME = 'changesets' THEN
    SELECT research_object_id INTO ro FROM commits WHERE id = NEW.commit_id;
  ELSIF TG_TABLE_NAME = 'reviews' THEN
    SELECT research_object_id INTO ro FROM pull_requests WHERE id = NEW.pr_id;
  ELSIF TG_TABLE_NAME = 'comments' THEN
    IF NEW.issue_id IS NOT NULL THEN SELECT research_object_id INTO ro FROM issues WHERE id = NEW.issue_id;
    ELSIF NEW.pr_id IS NOT NULL THEN SELECT research_object_id INTO ro FROM pull_requests WHERE id = NEW.pr_id;
    ELSE SELECT p.research_object_id INTO ro FROM reviews r JOIN pull_requests p ON p.id=r.pr_id WHERE r.id=NEW.review_id; END IF;
  ELSIF TG_TABLE_NAME = 'publications' THEN
    SELECT research_object_id INTO ro FROM versions WHERE id = NEW.version_id;
  ELSIF TG_TABLE_NAME = 'fork_relations' THEN
    ro := NEW.forked_ro_id;
    IF EXISTS (SELECT 1 FROM research_objects WHERE id=NEW.source_ro_id AND deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Fork source is in trash' USING ERRCODE='55000';
    END IF;
  ELSIF TG_TABLE_NAME = 'hermes_research_steps' THEN
    SELECT research_object_id INTO ro FROM hermes_research_runs WHERE id = NEW.run_id;
    tid := NEW.agent_task_id; aid := NEW.artifact_id;
  ELSIF TG_TABLE_NAME = 'evidence_records' THEN aid := NEW.artifact_id;
  ELSIF TG_TABLE_NAME = 'tool_approvals' THEN tid := NEW.task_id;
  ELSIF TG_TABLE_NAME = 'temporary_documents' THEN tid := NEW.agent_task_id;
  ELSIF TG_TABLE_NAME = 'presentation_assets' THEN
    tid := NULLIF(NEW.provenance->>'taskId','')::uuid;
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Asset is in trash' USING ERRCODE = '55000'; END IF;
  END IF;
  IF tid IS NOT NULL AND EXISTS (SELECT 1 FROM agent_tasks t JOIN agent_sessions s ON s.id=t.session_id
    LEFT JOIN research_objects r ON r.id=s.research_object_id WHERE t.id=tid AND (t.deleted_at IS NOT NULL OR s.deleted_at IS NOT NULL OR r.deleted_at IS NOT NULL))
  THEN RAISE EXCEPTION 'Source task is in trash' USING ERRCODE = '55000'; END IF;
  IF aid IS NOT NULL THEN
    SELECT deleted_at INTO gone FROM artifacts WHERE id=aid FOR UPDATE;
    IF NOT FOUND OR gone IS NOT NULL THEN RAISE EXCEPTION 'Source artifact is unavailable' USING ERRCODE = '55000'; END IF;
  END IF;
  IF ro IS NOT NULL THEN
    SELECT deleted_at INTO gone FROM research_objects WHERE id=ro FOR UPDATE;
    IF gone IS NOT NULL THEN RAISE EXCEPTION 'Research Object is in trash' USING ERRCODE = '55000'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Existing FKs omit manifest/blob and JSON references. Serialize reference additions against GC.
CREATE FUNCTION openscience_guard_storage_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE candidate RECORD; document TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(728413920);
  IF current_setting('openscience.trash_mutation', true) = 'on' THEN RETURN NEW; END IF;
  document := to_jsonb(NEW)::text;
  FOR candidate IN SELECT object_key FROM trash_object_cleanup WHERE state IN ('deleting','deleted') LOOP
    IF strpos(document, candidate.object_key) > 0 THEN
      RAISE EXCEPTION 'Object has been purged; upload it again before referencing it' USING ERRCODE='55000';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['research_objects','agent_sessions','agent_tasks','artifacts','presentation_assets','ingestion_batches','ingestion_tasks','versions','version_manifests','manifest_entries','sdf_documents','sdf_nodes','commits','changesets','evidence_records','claim_nodes','hermes_research_runs','hermes_research_steps','tool_approvals','authors','contributions','license_assignments','branches','visibility_grants','visibility_requests','issues','pull_requests','reviews','comments','identifiers','publications','fork_relations','presentation_asset_claims','ai_reviews','appeals'] LOOP
    EXECUTE format('CREATE TRIGGER trash_live_parent BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION openscience_require_live_parent()',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['blobs','artifacts','agent_tasks','presentation_assets','manifest_entries','version_manifests','versions','sdf_documents','changesets','evidence_records','temporary_documents'] LOOP
    EXECUTE format('CREATE TRIGGER a_trash_storage_reference BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION openscience_guard_storage_reference()',table_name);
  END LOOP;
END $$;
CREATE TRIGGER trash_temporary_document_source BEFORE INSERT ON temporary_documents FOR EACH ROW EXECUTE FUNCTION openscience_require_live_parent();
CREATE FUNCTION openscience_preserve_public_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM versions v JOIN publications p ON p.version_id=v.id WHERE v.research_object_id=OLD.id) THEN
    RAISE EXCEPTION 'Published Research Objects can only be archived' USING ERRCODE='55000';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER trash_preserve_public_history BEFORE DELETE ON research_objects FOR EACH ROW EXECUTE FUNCTION openscience_preserve_public_history();

