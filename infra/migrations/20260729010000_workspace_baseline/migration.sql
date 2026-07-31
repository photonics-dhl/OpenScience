CREATE TYPE "WorkspaceType" AS ENUM ('personal', 'team');
CREATE TYPE "WorkspaceStatus" AS ENUM ('active', 'archived');
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'maintainer', 'author', 'contributor', 'reviewer', 'viewer');
CREATE TYPE "WorkspaceInvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'revoked', 'expired');

CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "WorkspaceType" NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 一个用户最多一个 personal 空间（Prisma schema 不支持部分唯一索引，此处手写）
CREATE UNIQUE INDEX "workspaces_personal_owner_key" ON "workspaces"("owner_id") WHERE "type" = 'personal';

CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "memberships_workspace_id_user_id_key" ON "memberships"("workspace_id", "user_id");
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

CREATE TABLE "workspace_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "status" "WorkspaceInvitationStatus" NOT NULL DEFAULT 'pending',
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "workspace_invitations_workspace_id_idx" ON "workspace_invitations"("workspace_id");
CREATE INDEX "workspace_invitations_email_idx" ON "workspace_invitations"("email");
