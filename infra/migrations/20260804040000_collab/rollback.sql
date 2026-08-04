-- P1C-1 迁移 12 回滚（逆序：表 → 类型；contributions Restrict 无引用行时安全）

DROP TABLE IF EXISTS "notifications";
DROP TABLE IF EXISTS "license_assignments";
DROP TABLE IF EXISTS "contributions";
DROP TABLE IF EXISTS "authors";
DROP TABLE IF EXISTS "comments";
DROP TABLE IF EXISTS "reviews";
DROP TABLE IF EXISTS "pull_requests";
DROP TABLE IF EXISTS "issues";
DROP TABLE IF EXISTS "fork_relations";
DROP TYPE IF EXISTS "CreditRole";
DROP TYPE IF EXISTS "ReviewVerdict";
DROP TYPE IF EXISTS "IssueKind";
