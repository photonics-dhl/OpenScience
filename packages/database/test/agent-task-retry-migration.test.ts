import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationRoot = resolve(__dirname, '../../../infra/migrations/20260819010000_agent_task_retry_count');

describe('agent task retry count migration', () => {
  it('adds a backwards-compatible counter and provides an explicit rollback', () => {
    const up = readFileSync(resolve(migrationRoot, 'migration.sql'), 'utf8');
    const down = readFileSync(resolve(migrationRoot, 'rollback.sql'), 'utf8');
    expect(up).toMatch(/ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0/);
    expect(down).toMatch(/DROP COLUMN "retry_count"/);
  });
});
