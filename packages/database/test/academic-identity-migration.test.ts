import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const migrationRoot = resolve(root, 'infra/migrations/20260901010000_identity_credentials_scoped_roles');

describe('academic identity and scoped roles migration', () => {
  it('adds verified credentials, institution challenges, and multi-scope role assignments', () => {
    const up = readFileSync(resolve(migrationRoot, 'migration.sql'), 'utf8');

    expect(up).toContain('CREATE TABLE "identity_credentials"');
    expect(up).toContain('CREATE TABLE "institution_email_challenges"');
    expect(up).toContain('CREATE TABLE "scoped_role_assignments"');
    expect(up).toContain('CREATE UNIQUE INDEX "identity_credentials_type_external_id_key"');
    expect(up).toContain('CREATE UNIQUE INDEX "identity_credentials_user_id_type_key"');
    expect(up).toContain('CREATE UNIQUE INDEX "institution_email_challenges_one_active_per_user"');
    expect(up).toContain('WHERE "consumed_at" IS NULL');
    expect(up).toContain('CREATE UNIQUE INDEX "scoped_role_assignments_user_scope_role_key"');
    expect(up).toContain("'review_assignment'");
    expect(up).toContain("'organization'");
  });

  it('has an explicit rollback for the new tables, types, and migration ledger row', () => {
    const down = readFileSync(resolve(migrationRoot, 'rollback.sql'), 'utf8');

    expect(down).toContain('DROP TABLE IF EXISTS "scoped_role_assignments"');
    expect(down).toContain('DROP TABLE IF EXISTS "institution_email_challenges"');
    expect(down).toContain('DROP TABLE IF EXISTS "identity_credentials"');
    expect(down).toContain('DROP TYPE IF EXISTS "AuthorizationScopeType"');
    expect(down).toContain('DROP TYPE IF EXISTS "IdentityCredentialType"');
    expect(down).toContain(
      'DELETE FROM "_prisma_migrations" WHERE "migration_name" = \'20260901010000_identity_credentials_scoped_roles\'',
    );
  });
});
