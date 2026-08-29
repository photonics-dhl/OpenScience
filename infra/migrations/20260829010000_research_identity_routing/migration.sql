ALTER TABLE "research_identity_profiles"
  ADD COLUMN "accepted_signals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "rejected_signals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "research_identity_profiles"
  ADD CONSTRAINT "research_identity_profiles_accepted_signals_count_check"
    CHECK (cardinality("accepted_signals") <= 100),
  ADD CONSTRAINT "research_identity_profiles_rejected_signals_count_check"
    CHECK (cardinality("rejected_signals") <= 100),
  ADD CONSTRAINT "research_identity_profiles_signal_overlap_check"
    CHECK (NOT ("accepted_signals" && "rejected_signals"));

ALTER TABLE "agent_tasks" ADD COLUMN "interest_context" JSONB;

INSERT INTO "research_identity_profiles" (
  "user_id", "identities", "primary_identity", "accepted_signals", "rejected_signals"
)
SELECT
  "id", ARRAY['reader'::"ResearchIdentity"], 'reader'::"ResearchIdentity", ARRAY[]::TEXT[], ARRAY[]::TEXT[]
FROM "users"
ON CONFLICT ("user_id") DO NOTHING;
