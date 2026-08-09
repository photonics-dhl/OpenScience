-- Additive email-code registration challenge storage.
CREATE TABLE "signup_challenges" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_sent_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "signup_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "signup_challenges_email_created_at_idx" ON "signup_challenges"("email", "created_at");
