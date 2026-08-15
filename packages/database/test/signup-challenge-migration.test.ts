import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('signup active-challenge forward migration', () => {
  it('repairs duplicate active rows before creating the partial unique index', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../infra/migrations/20260809025000_signup_challenge_active_unique/migration.sql'),
      'utf8',
    );
    const cleanup = sql.indexOf('ROW_NUMBER() OVER');
    const consume = sql.indexOf('UPDATE "signup_challenges"');
    const index = sql.indexOf('CREATE UNIQUE INDEX');

    expect(cleanup).toBeGreaterThanOrEqual(0);
    expect(consume).toBeGreaterThan(cleanup);
    expect(index).toBeGreaterThan(consume);
    expect(sql).toContain('WHERE "consumed_at" IS NULL');
  });
});
