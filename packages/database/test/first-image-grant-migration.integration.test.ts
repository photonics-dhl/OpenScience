import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src';

// Require the caller's explicit integration database instead of falling back to dev.
// All DDL below targets a session-local table; no persistent run or migration ledger changes.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the grant migration integration test');
const prisma = createPrismaClient();
const directory = resolve(process.cwd(), '../../infra/migrations');
const previous = readFileSync(resolve(directory, '20260922030000_visual_narrative_dynamic_render_repair/migration.sql'), 'utf8');
const forward = readFileSync(resolve(directory, '20261014010000_first_image_generation_grant/migration.sql'), 'utf8');
const rollback = readFileSync(resolve(directory, '20261014010000_first_image_generation_grant/rollback.sql'), 'utf8');

// Preserve the rollback's DO block as one PostgreSQL statement. The existing SQL
// owns BEGIN/COMMIT in deployment; the test supplies the encompassing transaction.
function statements(sql: string): string[] {
  const clean = sql.replace(/^\s*--.*$/gm, '');
  const result: string[] = [];
  let start = 0, dollarQuoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    if (clean.slice(index, index + 2) === '$$') { dollarQuoted = !dollarQuoted; index += 1; }
    else if (clean[index] === ';' && !dollarQuoted) { result.push(clean.slice(start, index).trim()); start = index + 1; }
  }
  expect(clean.slice(start).trim()).toBe('');
  expect(result[0]).toBe('BEGIN');
  expect(result.at(-1)).toBe('COMMIT');
  return result.slice(1, -1).filter(Boolean);
}

async function apply(tx: Prisma.TransactionClient, sql: string) {
  for (const statement of statements(sql)) await tx.$executeRawUnsafe(statement);
}

async function withPreviousConstraint(check: (tx: Prisma.TransactionClient) => Promise<void>) {
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "hermes_research_runs" (id serial PRIMARY KEY, profile text, max_agent_tasks integer) ON COMMIT DROP');
    await tx.$executeRawUnsafe('SET LOCAL search_path = pg_temp');
    const relation = await tx.$queryRawUnsafe<Array<{ relpersistence: string }>>(
      "SELECT relpersistence FROM pg_class WHERE oid = 'hermes_research_runs'::regclass",
    );
    expect(relation).toEqual([{ relpersistence: 't' }]);
    // The old migration expects an existing constraint before its atomic swap.
    await tx.$executeRawUnsafe('ALTER TABLE "hermes_research_runs" ADD CONSTRAINT "hermes_research_runs_generation_grant_check" CHECK (true)');
    await apply(tx, previous);
    await check(tx);
  }, { timeout: 30_000 });
}

async function insert(tx: Prisma.TransactionClient, profile: string | null, maximum: number | null) {
  await tx.$executeRawUnsafe('INSERT INTO "hermes_research_runs" (profile,max_agent_tasks) VALUES ($1,$2)', profile, maximum);
}

async function expectRejected(tx: Prisma.TransactionClient, action: () => Promise<unknown>, code: string) {
  await tx.$executeRawUnsafe('SAVEPOINT expected_rejection');
  let failure: unknown;
  try { await action(); } catch (error) { failure = error; }
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT expected_rejection');
  await tx.$executeRawUnsafe('RELEASE SAVEPOINT expected_rejection');
  expect(failure).toMatchObject({ meta: { code } });
}

const historical: Array<[string | null, number | null]> = [
  [null, null], ['onchip-field-sampling-v1', 7], ['content-driven-v1', 8],
  ['content-driven-image-v1', 7], ...[9, 10, 11, 13, 15].map(n => ['visual-narrative-v1', n] as [string, number]),
];

afterAll(async () => prisma.$disconnect());

describe('two-task image grant migration (real PostgreSQL)', () => {
  it('reproduces the old first-image rejection and permits exactly two tasks without changing historical grants', async () => {
    await withPreviousConstraint(async tx => {
      for (const [profile, maximum] of historical) await insert(tx, profile, maximum);
      await expectRejected(tx, () => insert(tx, 'visual-narrative-v1', 2), '23514');
      await apply(tx, forward);
      try {
        await insert(tx, 'visual-narrative-v1', 2);
      } catch (error) {
        // The CI baseline replay must prove an actual PostgreSQL rejection,
        // never an expected-code string in a Vitest assertion or a setup failure.
        if ((error as { meta?: { code?: string } }).meta?.code === '23514') {
          console.error('FIRST_IMAGE_GRANT_OLD_CHECK_REJECTED_TWO_TASK_RUN');
        }
        throw error;
      }
      for (const [profile, maximum] of historical) await insert(tx, profile, maximum);
      const rows = await tx.$queryRawUnsafe<Array<{ profile: string | null; max_agent_tasks: number | null }>>(
        'SELECT profile,max_agent_tasks FROM "hermes_research_runs" ORDER BY id',
      );
      expect(rows).toEqual([...historical, ['visual-narrative-v1', 2], ...historical].map(([profile, max_agent_tasks]) => ({ profile, max_agent_tasks })));
      const constraint = await tx.$queryRawUnsafe<Array<{ convalidated: boolean }>>(
        "SELECT convalidated FROM pg_constraint WHERE conrelid='hermes_research_runs'::regclass AND conname='hermes_research_runs_generation_grant_check'",
      );
      expect(constraint).toEqual([{ convalidated: true }]);
    });
  });

  it('keeps lower and intermediate budgets, wrong profiles and partial null grants invalid', async () => {
    await withPreviousConstraint(async tx => {
      await apply(tx, forward);
      const invalid: Array<[string | null, number | null]> = [
        ...[-1, 0, 1, 3, 4, 5, 6, 7, 8].map(n => ['visual-narrative-v1', n] as [string, number]),
        ['visual-narrative-v1', null], ...[2, 7, 8, 9, 10, 11, 13, 15].map(n => [null, n] as [null, number]),
        ['unknown', null], ['unknown', 2], ['unknown', 9],
        ['onchip-field-sampling-v1', null], ['onchip-field-sampling-v1', 2], ['onchip-field-sampling-v1', 6], ['onchip-field-sampling-v1', 8],
        ['content-driven-v1', null], ['content-driven-v1', 2], ['content-driven-v1', 7], ['content-driven-v1', 9],
        ['content-driven-image-v1', null], ['content-driven-image-v1', 2], ['content-driven-image-v1', 6], ['content-driven-image-v1', 8],
      ];
      for (const [profile, maximum] of invalid) await expectRejected(tx, () => insert(tx, profile, maximum), '23514');
    });
  });

  it('restores the old constraint when no two-task run exists and retains historical records', async () => {
    await withPreviousConstraint(async tx => {
      for (const [profile, maximum] of historical) await insert(tx, profile, maximum);
      await apply(tx, forward);
      await apply(tx, rollback);
      await expectRejected(tx, () => insert(tx, 'visual-narrative-v1', 2), '23514');
      for (const [profile, maximum] of historical) await insert(tx, profile, maximum);
      const count = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*) FROM "hermes_research_runs"');
      expect(count[0]?.count).toBe(BigInt(historical.length * 2));
    });
  });

  it('refuses rollback with an existing two-task run, preserving its budget and the expanded constraint', async () => {
    await withPreviousConstraint(async tx => {
      await apply(tx, forward);
      for (const [profile, maximum] of historical) await insert(tx, profile, maximum);
      await insert(tx, 'visual-narrative-v1', 2);
      await expectRejected(tx, () => apply(tx, rollback), 'P0001');
      const rows = await tx.$queryRawUnsafe<Array<{ max_agent_tasks: number }>>(
        'SELECT max_agent_tasks FROM "hermes_research_runs" WHERE profile=$1 ORDER BY id', 'visual-narrative-v1',
      );
      expect(rows.map(row => row.max_agent_tasks)).toEqual([9, 10, 11, 13, 15, 2]);
      await insert(tx, 'visual-narrative-v1', 2);
      await expectRejected(tx, () => insert(tx, 'visual-narrative-v1', 3), '23514');
    });
  });
});
