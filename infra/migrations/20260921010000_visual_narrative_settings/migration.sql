-- Nullable metadata: historical/manual runs retain their original behavior.
ALTER TABLE hermes_research_runs ADD COLUMN generation_settings JSONB;
