import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { observeScanSciProviderState } from '../../src';

const migrationName = '20260830020000_scansci_provider_state';
const migrationRoot = resolve(__dirname, '../../../../infra/migrations', migrationName);
const forwardStatements = statements(readFileSync(resolve(migrationRoot, 'migration.sql'), 'utf8'));
const rollbackStatements = statements(readFileSync(resolve(migrationRoot, 'rollback.sql'), 'utf8'));
const baseUrl = process.env.DATABASE_URL;
const schema = `scansci_provider_state_${randomUUID().replaceAll('-', '')}`;
let administrator: PrismaClient | undefined;
let firstClient: PrismaClient | undefined;
let secondClient: PrismaClient | undefined;

function statements(sql: string): string[] {
  return sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
}

function schemaUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

async function execute(client: PrismaClient, sql: readonly string[]): Promise<void> {
  for (const statement of sql) await client.$executeRawUnsafe(statement);
}

async function objectContract(client: PrismaClient): Promise<{ table: boolean; column: boolean; index: boolean }> {
  const [table] = await client.$queryRawUnsafe<Array<{ exists: boolean }>>(
    'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = \'external_provider_states\') AS "exists"',
    schema,
  );
  const [column] = await client.$queryRawUnsafe<Array<{ exists: boolean }>>(
    'SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = \'notifications\' AND column_name = \'idempotency_key\') AS "exists"',
    schema,
  );
  const [index] = await client.$queryRawUnsafe<Array<{ exists: boolean }>>(
    'SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = \'notifications_idempotency_key_key\') AS "exists"',
    schema,
  );
  return { table: table?.exists ?? false, column: column?.exists ?? false, index: index?.exists ?? false };
}

beforeAll(async () => {
  if (process.env.NODE_ENV !== 'test') throw new Error('ScanSci provider-state integration requires NODE_ENV=test');
  if (!baseUrl) throw new Error('DATABASE_URL is required for ScanSci provider-state integration');
  administrator = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  await administrator.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const isolatedUrl = schemaUrl(baseUrl);
  firstClient = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
  secondClient = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
  await execute(firstClient, [
    'CREATE TYPE "PlatformRole" AS ENUM (\'user\', \'moderator\', \'platform_admin\')',
    'CREATE TABLE "users" ("id" UUID PRIMARY KEY, "platform_role" "PlatformRole" NOT NULL)',
    'CREATE TABLE "audit_logs" ("id" UUID PRIMARY KEY, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "actor_id" UUID, "action" TEXT NOT NULL, "workspace_id" UUID, "target_type" TEXT, "target_id" TEXT, "metadata" JSONB, "request_id" TEXT, "ip" TEXT)',
    'CREATE TABLE "notifications" ("id" UUID PRIMARY KEY, "user_id" UUID NOT NULL, "type" TEXT NOT NULL, "payload" JSONB NOT NULL, "read" BOOLEAN NOT NULL DEFAULT FALSE, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE "_prisma_migrations" ("migration_name" TEXT PRIMARY KEY)',
  ]);
});

afterAll(async () => {
  await Promise.all([firstClient?.$disconnect(), secondClient?.$disconnect()]);
  if (administrator) {
    await administrator.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await administrator.$disconnect();
  }
});

describe('ScanSci provider state (real PostgreSQL)', () => {
  it('supports migration forward, rollback, redeploy, and a two-client concurrent transition', async () => {
    if (!firstClient || !secondClient) throw new Error('integration clients unavailable');
    await execute(firstClient, forwardStatements);
    await firstClient.$executeRawUnsafe(
      'INSERT INTO "_prisma_migrations" ("migration_name") VALUES ($1)',
      migrationName,
    );
    await expect(objectContract(firstClient)).resolves.toEqual({ table: true, column: true, index: true });

    await execute(firstClient, rollbackStatements);
    await expect(objectContract(firstClient)).resolves.toEqual({ table: false, column: false, index: false });
    const [rolledBack] = await firstClient.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*) AS "count" FROM "_prisma_migrations" WHERE "migration_name" = $1',
      migrationName,
    );
    expect(Number(rolledBack?.count ?? -1n)).toBe(0);

    await execute(firstClient, forwardStatements);
    await expect(objectContract(firstClient)).resolves.toEqual({ table: true, column: true, index: true });
    const adminA = '11111111-1111-4111-8111-111111111111';
    const adminB = '22222222-2222-4222-8222-222222222222';
    const actor = '33333333-3333-4333-8333-333333333333';
    await firstClient.$executeRawUnsafe(
      'INSERT INTO "users" ("id", "platform_role") VALUES ($1::uuid, \'platform_admin\'), ($2::uuid, \'platform_admin\'), ($3::uuid, \'user\')',
      adminA,
      adminB,
      actor,
    );
    const observation = {
      kind: 'auth_required' as const,
      actorId: actor,
      taskId: '44444444-4444-4444-8444-444444444444',
    };

    const results = await Promise.all([
      observeScanSciProviderState({ prisma: firstClient }, observation),
      observeScanSciProviderState({ prisma: secondClient }, observation),
    ]);
    expect(results.filter(({ transitioned }) => transitioned)).toHaveLength(1);
    const states = await firstClient.$queryRawUnsafe<Array<{ status: string; generation: number }>>(
      'SELECT "status", "auth_required_generation" AS "generation" FROM "external_provider_states"',
    );
    expect(states).toEqual([{ status: 'auth_required', generation: 1 }]);
    const audits = await firstClient.$queryRawUnsafe<Array<{ action: string }>>(
      'SELECT "action" FROM "audit_logs" ORDER BY "created_at", "id"',
    );
    expect(audits).toEqual([{ action: 'external_retrieval.auth_required' }]);
    const notifications = await firstClient.$queryRawUnsafe<Array<{ idempotencyKey: string }>>(
      'SELECT "idempotency_key" AS "idempotencyKey" FROM "notifications" ORDER BY "idempotency_key"',
    );
    expect(notifications).toEqual([
      { idempotencyKey: `external_retrieval.auth_required:scansci:1:${adminA}` },
      { idempotencyKey: `external_retrieval.auth_required:scansci:1:${adminB}` },
    ]);
  });
});
