import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationRoot = resolve(__dirname, '../../../infra/migrations/20260902010000_ror_institution_directory');

describe('ROR institution directory migration', () => {
  it('adds a ROR-keyed directory with indexed domains and credential links', () => {
    const up = readFileSync(resolve(migrationRoot, 'migration.sql'), 'utf8');
    expect(up).toContain('CREATE TABLE "research_organizations"');
    expect(up).toContain('CREATE UNIQUE INDEX "research_organizations_ror_id_key"');
    expect(up).toContain('USING GIN ("domains")');
    expect(up).toContain('ADD COLUMN "research_organization_id" UUID');
    expect(up).toContain('REFERENCES "research_organizations"("id") ON DELETE SET NULL');
  });

  it('rolls back only the new links, directory, and ledger row', () => {
    const down = readFileSync(resolve(migrationRoot, 'rollback.sql'), 'utf8');
    expect(down).toContain('DROP COLUMN IF EXISTS "research_organization_id"');
    expect(down).toContain('DROP TABLE IF EXISTS "research_organizations"');
    expect(down).toContain("'20260902010000_ror_institution_directory'");
  });
});
