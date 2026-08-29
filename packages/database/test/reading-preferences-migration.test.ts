import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const migrationRoot = resolve(root, 'infra/migrations/20260829170000_reading_preferences');

describe('reading preferences migration', () => {
  it('creates one bounded core preference row per user without search or object-storage coupling', () => {
    const up = readFileSync(resolve(migrationRoot, 'migration.sql'), 'utf8');

    expect(up).toContain('CREATE TABLE "reading_preferences"');
    expect(up).toContain('"user_id" UUID PRIMARY KEY');
    expect(up).toContain('"evidence_default_collapsed" BOOLEAN NOT NULL DEFAULT FALSE');
    expect(up).toContain('"version" INTEGER NOT NULL DEFAULT 1');
    expect(up).toContain('REFERENCES "users"("id") ON DELETE CASCADE');
    expect(up).toContain('CHECK ("version" > 0)');
    expect(up).not.toMatch(/search_|object_key|blob|artifact/u);
  });

  it('provides a mechanical rollback for only the new table and migration ledger row', () => {
    const down = readFileSync(resolve(migrationRoot, 'rollback.sql'), 'utf8');

    expect(down).toContain('DROP TABLE IF EXISTS "reading_preferences"');
    expect(down).toContain("DELETE FROM \"_prisma_migrations\" WHERE \"migration_name\" = '20260829170000_reading_preferences'");
    expect(down).not.toMatch(/DROP TABLE IF EXISTS "users"|DROP TYPE/u);
  });
});
