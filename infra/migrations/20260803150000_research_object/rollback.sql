-- P1B-2 迁移 7 回滚（先表后类型，无 FK 耦合顺序依赖——sdf_nodes→sdf_documents→research_objects）

DROP TABLE IF EXISTS "sdf_nodes";
DROP TABLE IF EXISTS "sdf_documents";
DROP TABLE IF EXISTS "research_objects";
DROP TYPE IF EXISTS "SdfNodeType";
DROP TYPE IF EXISTS "RoVisibility";
DROP TYPE IF EXISTS "RoStatus";
