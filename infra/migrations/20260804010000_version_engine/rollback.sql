-- P1B-4 迁移 9 回滚（逆序：entries→manifests→versions→changesets→commits→branches + 类型）

DROP TABLE IF EXISTS "manifest_entries";
DROP TABLE IF EXISTS "version_manifests";
DROP TABLE IF EXISTS "versions";
DROP TYPE IF EXISTS "VersionStatus";
DROP TABLE IF EXISTS "changesets";
DROP TABLE IF EXISTS "commits";
DROP TABLE IF EXISTS "branches";
