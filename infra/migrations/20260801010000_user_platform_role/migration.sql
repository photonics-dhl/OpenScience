CREATE TYPE "PlatformRole" AS ENUM ('user', 'moderator', 'platform_admin');

ALTER TABLE "users" ADD COLUMN "platform_role" "PlatformRole" NOT NULL DEFAULT 'user';
