-- Migration 20 回滚：删除沙箱表、枚举与沙箱配额 seed
DELETE FROM quota_policies
WHERE scope = 'user_level'
  AND resource IN ('python_task_count', 'concurrent_tasks', 'python_runtime_seconds');

DROP INDEX IF EXISTS idx_sandbox_artifacts_job;
DROP INDEX IF EXISTS idx_sandbox_jobs_created;
DROP INDEX IF EXISTS idx_sandbox_jobs_status;
DROP INDEX IF EXISTS idx_sandbox_jobs_user;
DROP INDEX IF EXISTS idx_sandbox_jobs_workspace;
DROP TABLE IF EXISTS sandbox_artifacts;
DROP TABLE IF EXISTS sandbox_jobs;
DROP TYPE IF EXISTS sandbox_job_status;
