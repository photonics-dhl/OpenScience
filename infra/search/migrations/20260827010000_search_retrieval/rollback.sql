DROP TABLE IF EXISTS "search_query_metrics";
DROP TABLE IF EXISTS "search_index_tasks";
DROP TABLE IF EXISTS "search_embeddings";
DROP TABLE IF EXISTS "search_chunks";
DROP TABLE IF EXISTS "search_model_versions";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260827010000_search_retrieval';
