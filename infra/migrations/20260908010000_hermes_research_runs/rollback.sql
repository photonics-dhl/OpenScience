DROP TABLE IF EXISTS "hermes_research_steps";
DROP TABLE IF EXISTS "hermes_research_runs";

DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20260908010000_hermes_research_runs';
