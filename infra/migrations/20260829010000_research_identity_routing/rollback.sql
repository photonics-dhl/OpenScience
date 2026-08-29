ALTER TABLE "agent_tasks" DROP COLUMN IF EXISTS "interest_context";

ALTER TABLE "research_identity_profiles"
  DROP CONSTRAINT IF EXISTS "research_identity_profiles_signal_overlap_check",
  DROP CONSTRAINT IF EXISTS "research_identity_profiles_rejected_signals_count_check",
  DROP CONSTRAINT IF EXISTS "research_identity_profiles_accepted_signals_count_check",
  DROP COLUMN IF EXISTS "accepted_signals",
  DROP COLUMN IF EXISTS "rejected_signals";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260829010000_research_identity_routing';
