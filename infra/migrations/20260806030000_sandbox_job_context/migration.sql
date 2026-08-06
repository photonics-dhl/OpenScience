-- Migration 21: sandbox_jobs.context + users.level（P1E-5 收尾，对齐设计文档 2026-08-06-p1e-5 §2.1）
-- context：作业上下文（visualizationType/description，均可选），随创建请求落库并在 GET 响应带回
-- users.level：配额 user_level 档位的用户来源（free/pro/team），既有行默认 'free'；
--   配合 getCurrentUser 选出后传入 checkPythonTaskQuota，恢复三维配额的 user_level 回退层
-- 两列均幂等写法，重复 deploy 安全。

ALTER TABLE sandbox_jobs ADD COLUMN IF NOT EXISTS context JSONB;

ALTER TABLE users ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'free';
