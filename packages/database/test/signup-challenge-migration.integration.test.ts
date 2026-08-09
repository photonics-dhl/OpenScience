import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src';

const prisma = createPrismaClient();

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
      await tx.$executeRawUnsafe(`
        WITH "ranked_active" AS (
          SELECT "id", ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "last_sent_at" DESC, "created_at" DESC, "id" DESC) AS "active_rank"
          FROM "signup_challenges" WHERE "consumed_at" IS NULL
        )
        UPDATE "signup_challenges" AS "challenge"
        SET "consumed_at" = CURRENT_TIMESTAMP, "expires_at" = LEAST("challenge"."expires_at", CURRENT_TIMESTAMP)
        FROM "ranked_active"
        WHERE "challenge"."id" = "ranked_active"."id" AND "ranked_active"."active_rank" > 1
      `);
      await tx.$executeRawUnsafe('CREATE UNIQUE INDEX "signup_challenges_one_active_email_idx" ON "signup_challenges"("email") WHERE "consumed_at" IS NULL');
      const active = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "signup_challenges" WHERE "email" = $1 AND "consumed_at" IS NULL', email);
      expect(active).toEqual([{ id: newer }]);
      throw new Error(rollback);
    })).rejects.toThrow(rollback);
  });
});
