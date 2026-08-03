-- P1B-6 迁移 10 回滚（逆序：表 + 索引 + 列）

DROP TABLE IF EXISTS "publications";
DROP TABLE IF EXISTS "identifiers";
DROP INDEX IF EXISTS "versions_public_version_id_key";
DROP INDEX IF EXISTS "research_objects_public_id_key";
ALTER TABLE "versions" DROP COLUMN IF EXISTS "public_version_id";
ALTER TABLE "research_objects" DROP COLUMN IF EXISTS "public_id";
