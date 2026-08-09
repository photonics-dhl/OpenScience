-- Repair any duplicate active rows left by an environment that applied the
-- challenge table before delivery serialization existed. Keep the newest row.
WITH "ranked_active" AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "email"
            ORDER BY "last_sent_at" DESC, "created_at" DESC, "id" DESC
        ) AS "active_rank"
    FROM "signup_challenges"
    WHERE "consumed_at" IS NULL
)
UPDATE "signup_challenges" AS "challenge"
SET
    "consumed_at" = CURRENT_TIMESTAMP,
    "expires_at" = LEAST("challenge"."expires_at", CURRENT_TIMESTAMP)
FROM "ranked_active"
WHERE "challenge"."id" = "ranked_active"."id"
  AND "ranked_active"."active_rank" > 1;

-- Serialize signup-code delivery after legacy duplicates have been repaired.
CREATE UNIQUE INDEX IF NOT EXISTS "signup_challenges_one_active_email_idx"
ON "signup_challenges"("email") WHERE "consumed_at" IS NULL;
