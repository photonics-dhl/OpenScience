import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const migrationName = '20260830010000_external_retrieval_lifecycle';
const migrationRoot = resolve(root, `infra/migrations/${migrationName}`);

describe('external retrieval lifecycle migration', () => {
  it('creates tenant-scoped source, rights, temporary object metadata and access audit tables', () => {
    const up = readFileSync(resolve(migrationRoot, 'migration.sql'), 'utf8');

    expect(up).toContain('CREATE TABLE "external_sources"');
    expect(up).toContain('CREATE TABLE "source_rights_decisions"');
    expect(up).toContain('CREATE TABLE "temporary_documents"');
    expect(up).toContain('CREATE TABLE "temporary_document_accesses"');
    expect(up).toContain('FOREIGN KEY ("external_source_id", "workspace_id")');
    expect(up).toContain('FOREIGN KEY ("temporary_document_id", "workspace_id")');
    expect(up).toContain('"subject_user_id" UUID');
    expect(up).toContain('"valid_until" TIMESTAMPTZ');
    expect(up).toContain('"cleanup_fence_token" UUID');
    expect(up).toContain('"cleanup_retry_at" TIMESTAMPTZ');
    expect(up).toContain('"agent_task_id" UUID NOT NULL');
    expect(up).toContain('CREATE UNIQUE INDEX "source_rights_decisions_task_source_key"');
    expect(up).toContain('CREATE UNIQUE INDEX "temporary_documents_agent_task_id_key"');
    expect(up).toContain('"basis" = \'institutional_access\' AND "cache_allowed" AND "download_policy" = \'authorized_user_only\'');
    expect(up).toContain('CHECK ("content_hash" ~ \'^[0-9a-f]{64}$\')');
    expect(up).toContain('CHECK ("object_key" = \'hermes-cache/\' || "workspace_id"::text || \'/\' || "id"::text || \'/\' || btrim("content_hash"))');
    expect(up).toContain('CHECK ("expires_at" = "created_at" + INTERVAL \'72 hours\')');
    expect(up).toContain('"expires_at" > "created_at" AND "expires_at" <= "created_at" + INTERVAL \'10 minutes\'');
    expect(up).toContain('CHECK ("size_bytes" > 0)');
    expect(up).not.toMatch(/BYTEA|large object|public-read/iu);
  });

  it('preserves provenance metadata while making cached bytes independently expirable', () => {
    const up = readFileSync(resolve(migrationRoot, 'migration.sql'), 'utf8');

    expect(up).toContain('"parser_provenance" JSONB');
    expect(up).toContain('"locator" JSONB');
    expect(up).toContain('"deleted_at" TIMESTAMPTZ');
    expect(up).toContain('"cleanup_lease_until" TIMESTAMPTZ');
    expect(up).toContain('"cleanup_attempts" INTEGER NOT NULL DEFAULT 0');
    expect(up).toContain('CREATE INDEX "temporary_documents_expiry_idx"');
    expect(up).toContain('CREATE INDEX "temporary_documents_cleanup_retry_idx"');
  });

  it('provides a mechanical rollback limited to this migration', () => {
    const down = readFileSync(resolve(migrationRoot, 'rollback.sql'), 'utf8');

    expect(down).toContain('DROP TABLE IF EXISTS "temporary_document_accesses"');
    expect(down).toContain('DROP TABLE IF EXISTS "temporary_documents"');
    expect(down).toContain('DROP TABLE IF EXISTS "source_rights_decisions"');
    expect(down).toContain('DROP TABLE IF EXISTS "external_sources"');
    expect(down).toContain(`DELETE FROM "_prisma_migrations" WHERE "migration_name" = '${migrationName}'`);
    expect(down).toContain("RAISE EXCEPTION 'external retrieval rollback blocked: cached objects remain'");
    expect(down).not.toMatch(/DROP TABLE IF EXISTS "users"|DROP TABLE IF EXISTS "workspaces"/u);
  });
});
