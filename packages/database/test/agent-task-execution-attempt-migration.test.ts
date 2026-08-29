import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationRoot = resolve(
  __dirname,
  '../../../infra/migrations/20260827020000_agent_task_execution_attempt',
);

describe('agent task execution attempt migration', () => {
  it('adds a backwards-compatible claim epoch with a mechanical rollback', () => {
    const up = readFileSync(resolve(migrationRoot, 'migration.sql'), 'utf8');
    const down = readFileSync(resolve(migrationRoot, 'rollback.sql'), 'utf8');
    expect(up).toMatch(/ADD COLUMN "execution_attempt" INTEGER NOT NULL DEFAULT 0/);
    expect(up).toMatch(/CHECK \("execution_attempt" >= 0\)/);
    expect(down).toMatch(/DROP COLUMN "execution_attempt"/);
  });
});
