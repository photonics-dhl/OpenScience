-- Seed: P1E-5 Python Sandbox Quota Policies
-- Created: 2026-08-06
-- Purpose: 三档配额（free/pro/team）× 三类资源（任务数/并发数/运行时）= 9 条策略

-- Free tier (user_level = 'free')
INSERT INTO quota_policies (id, scope, scope_key, resource, limit_value, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'user_level', 'free', 'python_task_count', 3, NOW(), NOW()),
  (gen_random_uuid(), 'user_level', 'free', 'concurrent_tasks', 1, NOW(), NOW()),
  (gen_random_uuid(), 'user_level', 'free', 'python_runtime_seconds', 900, NOW(), NOW());

-- Pro tier (user_level = 'pro')
INSERT INTO quota_policies (id, scope, scope_key, resource, limit_value, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'user_level', 'pro', 'python_task_count', 50, NOW(), NOW()),
  (gen_random_uuid(), 'user_level', 'pro', 'concurrent_tasks', 3, NOW(), NOW()),
  (gen_random_uuid(), 'user_level', 'pro', 'python_runtime_seconds', 9000, NOW(), NOW());

-- Team tier (user_level = 'team')
INSERT INTO quota_policies (id, scope, scope_key, resource, limit_value, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'user_level', 'team', 'python_task_count', 200, NOW(), NOW()),
  (gen_random_uuid(), 'user_level', 'team', 'concurrent_tasks', 10, NOW(), NOW()),
  (gen_random_uuid(), 'user_level', 'team', 'python_runtime_seconds', 36000, NOW(), NOW());

-- Rollback script
-- DELETE FROM quota_policies WHERE resource IN ('python_task_count', 'concurrent_tasks', 'python_runtime_seconds');
