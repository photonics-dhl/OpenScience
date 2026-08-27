import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationRoot = new URL(
  '../../../infra/search/migrations/20260827010000_search_retrieval/',
  import.meta.url,
);
const schemaPath = new URL('../../../infra/search/schema.prisma', import.meta.url);

describe('search retrieval migration', () => {
  it('is expand-only, tenant-scoped and locator preserving', async () => {
    const migration = await readFile(new URL('migration.sql', migrationRoot), 'utf8');

    for (const table of [
      'search_model_versions',
      'search_chunks',
      'search_embeddings',
      'search_index_tasks',
      'search_query_metrics',
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration).toContain('"workspace_id" UUID NOT NULL');
    expect(migration).toContain('"locator" JSONB NOT NULL');
    expect(migration).toContain('"search_vector" TSVECTOR GENERATED ALWAYS AS');
    expect(migration).toContain('CREATE INDEX "search_chunks_search_vector_idx"');
    expect(migration).toContain('USING GIN');
    expect(migration).toContain('octet_length("vector") = 4096');
    expect(migration).toContain('"dimension" = 1024');
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "chunk_id")');
    expect(migration).not.toContain('DROP TABLE');
    expect(migration).not.toContain('CREATE EXTENSION');
  });

  it('keeps query telemetry content-free and provides a mechanical rollback', async () => {
    const [migration, rollback] = await Promise.all([
      readFile(new URL('migration.sql', migrationRoot), 'utf8'),
      readFile(new URL('rollback.sql', migrationRoot), 'utf8'),
    ]);
    const metricTable = migration.slice(migration.indexOf('CREATE TABLE "search_query_metrics"'));

    expect(metricTable).toContain('"query_hash" CHAR(64) NOT NULL');
    expect(metricTable).not.toMatch(/"(query|text|payload|embedding)"\s/);
    expect(rollback).toContain('DROP TABLE IF EXISTS "search_query_metrics"');
    expect(rollback).toContain('DROP TABLE IF EXISTS "search_chunks"');
    expect(rollback).toContain(
      'DELETE FROM "_prisma_migrations" WHERE "migration_name" = \'20260827010000_search_retrieval\'',
    );
  });

  it('exposes only portable Prisma records and keeps tsvector database-owned', async () => {
    const schema = await readFile(schemaPath, 'utf8');

    for (const model of [
      'SearchModelVersion',
      'SearchChunk',
      'SearchEmbedding',
      'SearchIndexTask',
      'SearchQueryMetric',
    ]) {
      expect(schema).toContain(`model ${model}`);
    }
    expect(schema).toMatch(/searchVector\s+Unsupported\("tsvector"\)\?/);
    expect(schema).toMatch(/vector\s+Bytes/);
    expect(schema).not.toContain('env("DATABASE_URL")');
    expect(schema).toContain('env("SEARCH_DATABASE_URL")');
  });
});
