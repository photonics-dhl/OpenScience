import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient, createRedisClient } from '../src';

// P1A-2 云上验收（task-master 2.2）：真实 PostgreSQL + Redis。
// 前置：dev 栈已起（stack:up）且迁移已 deploy（migrate-cli.js deploy）。
const prisma = createPrismaClient();
const redis = createRedisClient();

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe('P1A-2 data foundation (cloud, real PG+Redis)', () => {
  it('postgres: SELECT 1 可用且 3 个迁移已落库', async () => {
    const one = await prisma.$queryRawUnsafe<{ one: number }[]>('SELECT 1 AS one');
    expect(one[0].one).toBe(1);
    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL',
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('redis: ping 与 set/get/del 往返', async () => {
    expect(await redis.ping()).toBe('PONG');
    await redis.set('p1a2:integration', 'ok', 'EX', 60);
    expect(await redis.get('p1a2:integration')).toBe('ok');
    await redis.del('p1a2:integration');
  });
});
