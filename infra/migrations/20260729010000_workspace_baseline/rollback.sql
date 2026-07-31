-- Compensation rollback for 20260729010000_workspace_baseline.
DROP TABLE IF EXISTS "workspace_invitations";
DROP TABLE IF EXISTS "memberships";
DROP TABLE IF EXISTS "workspaces";
DROP TYPE IF EXISTS "WorkspaceInvitationStatus";
DROP TYPE IF EXISTS "WorkspaceRole";
DROP TYPE IF EXISTS "WorkspaceStatus";
DROP TYPE IF EXISTS "WorkspaceType";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260729010000_workspace_baseline';
