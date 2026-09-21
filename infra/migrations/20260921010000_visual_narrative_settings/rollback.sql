-- Application rollback needs no schema rollback. Retain this column while any
-- automatic run exists so its authorization and recovery settings are preserved.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM hermes_research_runs WHERE generation_settings IS NOT NULL) THEN
    RAISE EXCEPTION 'Retain generation_settings: automatic run history exists';
  END IF;
END $$;
ALTER TABLE hermes_research_runs DROP COLUMN generation_settings;
