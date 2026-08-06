-- Migration 13: Sandbox Jobs
-- Created: 2026-08-06
-- Purpose: P1E-4 Sandbox Controller data model (Spec §10.3, §15)

-- Sandbox job status enum
CREATE TYPE sandbox_job_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
  'cancelled'
);

-- Sandbox jobs table
CREATE TABLE sandbox_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  script TEXT NOT NULL,
  status sandbox_job_status NOT NULL DEFAULT 'pending',
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT sandbox_jobs_user_workspace_fk FOREIGN KEY (user_id, workspace_id)
    REFERENCES memberships(user_id, workspace_id) ON DELETE CASCADE
);

-- Sandbox artifacts table (temporary storage for PNG/SVG outputs)
CREATE TABLE sandbox_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES sandbox_jobs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sandbox_jobs_workspace ON sandbox_jobs(workspace_id);
CREATE INDEX idx_sandbox_jobs_user ON sandbox_jobs(user_id);
CREATE INDEX idx_sandbox_jobs_status ON sandbox_jobs(status);
CREATE INDEX idx_sandbox_jobs_created ON sandbox_jobs(created_at);
CREATE INDEX idx_sandbox_artifacts_job ON sandbox_artifacts(job_id);

-- Rollback script
-- DROP INDEX IF EXISTS idx_sandbox_artifacts_job;
-- DROP INDEX IF EXISTS idx_sandbox_jobs_created;
-- DROP INDEX IF EXISTS idx_sandbox_jobs_status;
-- DROP INDEX IF EXISTS idx_sandbox_jobs_user;
-- DROP INDEX IF EXISTS idx_sandbox_jobs_workspace;
-- DROP TABLE IF EXISTS sandbox_artifacts;
-- DROP TABLE IF EXISTS sandbox_jobs;
-- DROP TYPE IF EXISTS sandbox_job_status;
