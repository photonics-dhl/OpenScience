-- Archive newly captured research_record values before explicitly applying this destructive rollback.
ALTER TABLE "versions" DROP COLUMN "research_record";
