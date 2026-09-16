-- Expand only. Draft/internal version_no and all issued public IDs remain intact.
ALTER TABLE "versions" ADD COLUMN "publication_no" INTEGER;

UPDATE "versions" v
SET "publication_no" = COALESCE(substring(p."public_version_id" FROM '-v([1-9][0-9]*)$')::integer, v."version_no")
FROM "publications" p WHERE p."version_id" = v."id";

-- The existing internal revision constraint cannot prevent two publications
-- from receiving the same public ordinal. Null permits any number of drafts.
CREATE UNIQUE INDEX "versions_research_object_id_publication_no_key"
  ON "versions"("research_object_id", "publication_no");

-- An accidentally restarted old writer must fail atomically instead of issuing
-- an unresolvable public link after this migration's one-time backfill.
CREATE FUNCTION require_publication_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM versions v WHERE v.id = NEW.version_id
    AND v.publication_no IS NOT NULL AND v.public_version_id = NEW.public_version_id) THEN
    RAISE EXCEPTION 'Publication requires a lifecycle-compatible writer' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER publications_require_identity BEFORE INSERT ON publications
  FOR EACH ROW EXECUTE FUNCTION require_publication_identity();

-- Reuse the existing research_record snapshot. Historical title/authors/licenses
-- already recorded there are retained; missing fields are captured NOW and the
-- provenance explicitly says so. Never claim these values were recorded at the
-- original publication time, and never alter the previously issued content hash.
WITH legacy AS (
  SELECT v.id, v.research_record, v.publication_no, p.public_version_id, p.published_at,
    r.public_id, r.created_at,
    COALESCE(v.research_record #>> '{dto,citation,title}', r.title) AS title,
    CASE WHEN jsonb_typeof(v.research_record #> '{dto,identity,platformAuthors}') = 'array'
      THEN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'displayName', a.item ->> 'name', 'identityStatus', NULL,
        'isCorresponding', COALESCE((a.item ->> 'isCorresponding')::boolean, false),
        'affiliation', a.item -> 'affiliation', 'sortOrder', a.ordinality - 1
      ) ORDER BY a.ordinality), '[]'::jsonb)
      FROM jsonb_array_elements(v.research_record #> '{dto,identity,platformAuthors}') WITH ORDINALITY a(item, ordinality))
      ELSE (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'displayName', u.display_name, 'identityStatus', u.status,
        'isCorresponding', a.is_corresponding, 'affiliation', a.affiliation, 'sortOrder', a.sort_order
      ) ORDER BY a.sort_order, a.id), '[]'::jsonb) FROM authors a JOIN users u ON u.id = a.user_id WHERE a.research_object_id = r.id)
    END AS authors,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('displayName', u.display_name, 'creditRole', c.credit_role)
      ORDER BY c.created_at, c.id), '[]'::jsonb) FROM contributions c JOIN users u ON u.id = c.user_id WHERE c.research_object_id = r.id) AS contributions,
    CASE WHEN jsonb_typeof(v.research_record #> '{dto,identity,licenses}') = 'array'
      THEN (SELECT COALESCE(jsonb_object_agg(l ->> 'type', l ->> 'identifier'), '{}'::jsonb)
        FROM jsonb_array_elements(v.research_record #> '{dto,identity,licenses}') l)
      ELSE (SELECT COALESCE(jsonb_object_agg(l.license_type, l.license_id), '{}'::jsonb)
        FROM (SELECT DISTINCT ON (license_type) license_type, license_id FROM license_assignments
          WHERE research_object_id = r.id AND (version_id = v.id OR version_id IS NULL)
          ORDER BY license_type, version_id NULLS LAST, created_at DESC, id) l)
    END AS licenses
  FROM versions v JOIN research_objects r ON r.id = v.research_object_id
    JOIN LATERAL (SELECT * FROM publications WHERE version_id = v.id ORDER BY published_at, id LIMIT 1) p ON true
)
UPDATE versions v SET research_record = COALESCE(v.research_record, '{}'::jsonb) || jsonb_build_object(
  'publicationMetadata', jsonb_build_object(
    'schemaVersion', 1, 'captureSource', 'legacy_captured_at_migration', 'capturedAt', CURRENT_TIMESTAMP,
    'fieldSources', jsonb_build_object(
      'title', CASE WHEN l.research_record #>> '{dto,citation,title}' IS NOT NULL THEN 'existing_research_record' ELSE 'live_value_at_migration' END,
      'authors', CASE WHEN jsonb_typeof(l.research_record #> '{dto,identity,platformAuthors}') = 'array' THEN 'existing_research_record' ELSE 'live_value_at_migration' END,
      'licenses', CASE WHEN jsonb_typeof(l.research_record #> '{dto,identity,licenses}') = 'array' THEN 'existing_research_record' ELSE 'live_value_at_migration' END,
      'contributions', 'live_value_at_migration', 'citation', 'derived_at_migration_from_recorded_identity'),
    'title', l.title, 'authors', l.authors, 'contributions', l.contributions, 'licenses', l.licenses,
    'citation', jsonb_build_object('publicId', l.public_id, 'publicVersionId', l.public_version_id,
      'publicationNo', l.publication_no, 'year', EXTRACT(YEAR FROM l.created_at AT TIME ZONE 'UTC')::integer,
      'publishedAt', l.published_at, 'text',
      COALESCE((SELECT string_agg(a ->> 'displayName', ', ' ORDER BY ordinality) FROM jsonb_array_elements(l.authors) WITH ORDINALITY x(a, ordinality)), '')
        || '. ' || l.title || '. ' || l.public_version_id || '. ' || EXTRACT(YEAR FROM l.created_at AT TIME ZONE 'UTC')::text || '.')
  )) FROM legacy l WHERE v.id = l.id;

-- Capture the media that can still be tied to the EXISTING scientific receipt.
-- In particular, do not replace old frozen Claims/Evidence with later live edits.
-- This migration runs before trash columns exist; no soft-deleted rows exist yet.
UPDATE versions v SET research_record = COALESCE(v.research_record, '{}'::jsonb) || jsonb_build_object(
  'historyCapture', jsonb_build_object('state', 'legacy', 'capturedAt', CURRENT_TIMESTAMP,
    'graphSource', CASE WHEN v.research_record ? 'dto' THEN 'existing_research_record' ELSE 'not_recorded' END),
  'historyMedia', jsonb_build_object('captureSource', 'legacy_captured_at_migration', 'capturedAt', CURRENT_TIMESTAMP,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'researchObjectId', a.research_object_id, 'versionId', a.version_id,
      'kind', a.kind, 'objectKey', a.object_key, 'contentHash', a.content_hash,
      'generator', a.generator, 'generatorVersion', a.generator_version, 'promptHash', a.prompt_hash,
      'status', a.status, 'label', a.label, 'provenance', a.provenance,
      'sourceClaimIds', (SELECT jsonb_agg(l.claim_id ORDER BY l.claim_id) FROM presentation_asset_claims l WHERE l.presentation_asset_id = a.id)
    ) ORDER BY a.id) FROM presentation_assets a
    WHERE a.version_id = v.id AND a.research_object_id = v.research_object_id
      AND EXISTS (SELECT 1 FROM presentation_asset_claims l WHERE l.presentation_asset_id = a.id)
      AND NOT EXISTS (
        SELECT 1 FROM presentation_asset_claims l LEFT JOIN claim_nodes c ON c.id = l.claim_id
        WHERE l.presentation_asset_id = a.id AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.research_record #> '{dto,claims}') = 'array'
            THEN v.research_record #> '{dto,claims}' ELSE '[]'::jsonb END) f
          WHERE f ->> 'id' = l.claim_id::text AND f ->> 'kind' = c.kind::text
            AND f ->> 'statement' = c.statement AND f ->> 'assessment' = c.assessment::text
            AND f -> 'conditions' = to_jsonb(c.conditions) AND f -> 'limitations' = to_jsonb(c.limitations)
            AND f ->> 'extractionStatus' = c.extraction_status::text
        )
      )
    ), '[]'::jsonb)
  )
);
