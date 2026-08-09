-- Serialize signup-code delivery even when an environment applied the challenge table earlier.
CREATE UNIQUE INDEX IF NOT EXISTS "signup_challenges_one_active_email_idx"
ON "signup_challenges"("email") WHERE "consumed_at" IS NULL;
