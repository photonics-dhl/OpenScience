import { describe, expect, it } from 'vitest';
import { createFakePrisma } from './helpers/fakes';
import { resolvePolicy } from '../src/usage/policies';

const R = 'ai_credit';
const WS = 'ws-1';
const LEVEL = 'level_1';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试夹具放宽类型 */
function seedPolicy(db: { quotaPolicies: any[] }, scope: string, scopeKey: string | null, resource: string, limitValue: number): void {
  db.quotaPolicies.push({
    id: `pol-${db.quotaPolicies.length + 1}`,
    scope,
    scopeKey,
    resource,
    limitValue,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('resolvePolicy 三层回退', () => {
  it('workspace 行命中优先于 user_level / global', async () => {
    const { prisma, db } = createFakePrisma();
    seedPolicy(db, 'global', null, R, 100);
    seedPolicy(db, 'user_level', LEVEL, R, 200);
    seedPolicy(db, 'workspace', WS, R, 300);
    const got = await resolvePolicy({ prisma }, { workspaceId: WS, userLevel: LEVEL, resource: R });
    expect(got).toMatchObject({ scope: 'workspace', scopeKey: WS, limitValue: 300 });
  });

  it('无 workspace 行时回退 user_level', async () => {
    const { prisma, db } = createFakePrisma();
    seedPolicy(db, 'global', null, R, 100);
    seedPolicy(db, 'user_level', LEVEL, R, 200);
    const got = await resolvePolicy({ prisma }, { workspaceId: WS, userLevel: LEVEL, resource: R });
    expect(got).toMatchObject({ scope: 'user_level', scopeKey: LEVEL, limitValue: 200 });
  });

  it('无 workspace / user_level 行时回退 global', async () => {
    const { prisma, db } = createFakePrisma();
    seedPolicy(db, 'global', null, R, 100);
    const got = await resolvePolicy({ prisma }, { workspaceId: WS, userLevel: LEVEL, resource: R });
    expect(got).toMatchObject({ scope: 'global', scopeKey: null, limitValue: 100 });
  });

  it('全未命中返回 null（无限制，不做 0 误判）', async () => {
    const { prisma } = createFakePrisma();
    const got = await resolvePolicy({ prisma }, { workspaceId: WS, userLevel: LEVEL, resource: R });
    expect(got).toBeNull();
  });

  it('资源不匹配的行不参与回退', async () => {
    const { prisma, db } = createFakePrisma();
    seedPolicy(db, 'global', null, 'storage_bytes', 1024);
    const got = await resolvePolicy({ prisma }, { workspaceId: WS, userLevel: LEVEL, resource: R });
    expect(got).toBeNull();
  });

  it('有 workspaceId 但无 userLevel 时仅回退 workspace → global', async () => {
    const { prisma, db } = createFakePrisma();
    seedPolicy(db, 'user_level', LEVEL, R, 200);
    seedPolicy(db, 'global', null, R, 100);
    const got = await resolvePolicy({ prisma }, { workspaceId: WS, resource: R });
    expect(got).toMatchObject({ scope: 'global', limitValue: 100 });
  });

  it('仅 userLevel 无 workspaceId 时 user_level → global', async () => {
    const { prisma, db } = createFakePrisma();
    seedPolicy(db, 'user_level', LEVEL, R, 200);
    seedPolicy(db, 'global', null, R, 100);
    const got = await resolvePolicy({ prisma }, { userLevel: LEVEL, resource: R });
    expect(got).toMatchObject({ scope: 'user_level', limitValue: 200 });
  });
});
