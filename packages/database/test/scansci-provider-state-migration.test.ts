import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const name = '20260830020000_scansci_provider_state';
const folder = resolve(root, 'infra/migrations', name);

describe('ScanSci provider-state migration', () => {
  it('adds durable state and nullable notification idempotency', () => {
    const up = readFileSync(resolve(folder, 'migration.sql'), 'utf8');
    expect(up).toContain('CREATE TABLE "external_provider_states"');
    expect(up).toContain('"auth_required_generation" INTEGER NOT NULL DEFAULT 0');
    expect(up).toContain('"status" IN (\'healthy\', \'auth_required\')');
    expect(up).toContain('ADD COLUMN "idempotency_key" TEXT');
    expect(up).toContain('CREATE UNIQUE INDEX "notifications_idempotency_key_key"');
  });

  it('rolls back only its additive objects', () => {
    const down = readFileSync(resolve(folder, 'rollback.sql'), 'utf8');
    expect(down).toContain('DROP TABLE IF EXISTS "external_provider_states"');
    expect(down).toContain('DROP COLUMN IF EXISTS "idempotency_key"');
    expect(down).toContain(`'${name}'`);
  });
});
