import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src';

const prisma = createPrismaClient();
const migrationSql = readFileSync(
  resolve(process.cwd(), '../../infra/migrations/20260809025000_signup_challenge_active_unique/migration.sql'),
  'utf8',
);

afterAll(async () => prisma.$disconnect());

describe('signup active-challenge migration (real PostgreSQL)', () => {
  it('converges duplicate active rows before creating the partial unique index', async () => {
    const email = `migration-${Date.now()}@example.com`;
    const older = randomUUID();
    const newer = randomUUID();
    const rollback = 'migration duplicate-row rollback sentinel';

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP INDEX IF EXISTS "signup_challenges_one_active_email_idx"');
      await tx.$executeRawUnsafe(
        'INSERT INTO "signup_challenges" ("id","email","code_hash","expires_at","last_sent_at") VALUES ($1,$2,$3,CURRENT_TIMESTAMP + interval \'10 minutes\',CURRENT_TIMESTAMP - interval \'2 minutes\')',
        older, email, 'older-hash',
      );
      await tx.$executeRawUnsafe(
        'INSERT INTO "signup_challenges" ("id","email","code_hash","expires_at","last_sent_at") VALUES ($1,$2,$3,CURRENT_TIMESTAMP + interval \'10 minutes\',CURRENT_TIMESTAMP)',
        newer, email, 'newer-hash',
      );
      await tx.$executeRawUnsafe(migrationSql);
      const active = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "signup_challenges" WHERE "email" = $1 AND "consumed_at" IS NULL', email);
      expect(active).toEqual([{ id: newer }]);
      throw new Error(rollback);
    })).rejects.toThrow(rollback);
  });
});
