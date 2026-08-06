-- Migration 21 回滚：删除 sandbox_jobs.context 与 users.level
ALTER TABLE sandbox_jobs DROP COLUMN IF EXISTS context;

ALTER TABLE users DROP COLUMN IF EXISTS level;
