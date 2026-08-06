-- Migration 20: Sandbox Jobs（P1E-4/5，Spec §10.3, §15）
-- 规整自 packages/database/migrations/13-sandbox-jobs.sql + 14-sandbox-quota-policies.sql
-- 说明：这两个 SQL 原本游离在 prisma migrate 流程外，可能已在云上手工执行过，
-- 因此本迁移全部使用幂等写法（IF NOT EXISTS / duplicate_object 捕获 / 存在性守卫），
-- 无论云上表是否已存在，`migrate deploy` 都能安全通过并将本迁移标记为已应用。

-- Sandbox job status enum（CREATE TYPE 无 IF NOT EXISTS，用 DO 块捕获重复）
DO $$ BEGIN
  CREATE TYPE sandbox_job_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'timeout',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sandbox jobs table
CREATE TABLE IF NOT EXISTS sandbox_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  script TEXT NOT NULL,
  status sandbox_job_status NOT NULL DEFAULT 'pending',
  result JSONB,
  runtime_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT sandbox_jobs_user_workspace_fk FOREIGN KEY (user_id, workspace_id)
    REFERENCES memberships(user_id, workspace_id) ON DELETE CASCADE
);

-- Sandbox artifacts table (temporary storage for PNG/SVG outputs)
CREATE TABLE IF NOT EXISTS sandbox_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES sandbox_jobs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sandbox_jobs_workspace ON sandbox_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_jobs_user ON sandbox_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_jobs_status ON sandbox_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sandbox_jobs_created ON sandbox_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_sandbox_artifacts_job ON sandbox_artifacts(job_id);

-- P1E-5 沙箱配额 seed：三档（free/pro/team）× 三类资源 = 9 条策略
-- 存在性守卫：已 seed 过（含云上手工执行 14 号文件的场景）则跳过
INSERT INTO quota_policies (id, scope, scope_key, resource, limit_value, created_at, updated_at)
SELECT gen_random_uuid(), v.scope_key, v.resource, v.limit_value, NOW(), NOW()
FROM (VALUES
  ('free', 'python_task_count', 3),
  ('free', 'concurrent_tasks', 1),
  ('free', 'python_runtime_seconds', 900),
  ('pro', 'python_task_count', 50),
  ('pro', 'concurrent_tasks', 3),
  ('pro', 'python_runtime_seconds', 9000),
  ('team', 'python_task_count', 200),
  ('team', 'concurrent_tasks', 10),
  ('team', 'python_runtime_seconds', 36000)
) AS v(scope_key, resource, limit_value)
WHERE NOT EXISTS (
  SELECT 1 FROM quota_policies q
  WHERE q.scope = 'user_level'
    AND q.scope_key = v.scope_key
    AND q.resource = v.resource
);
