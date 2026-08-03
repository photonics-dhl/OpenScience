-- P1B-3 迁移 8 回滚（先表后主键无类型，顺序：artifacts→blobs）

DROP TABLE IF EXISTS "artifacts";
DROP TABLE IF EXISTS "blobs";
