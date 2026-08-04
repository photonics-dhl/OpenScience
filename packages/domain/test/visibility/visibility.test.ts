import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { canAccessRo, requireRoAccess } from '../../src/visibility/access';
import { requestVisibilityChange, grantVisibility, isVisibilityExpansion } from '../../src/visibility/requests';
import { VisibilityError } from '../../src/visibility/errors';
import { updateResearchObject } from '../../src/research-object/research-objects';

async function makeRo() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'RO' });
  return { prisma, db, user, deps, ro };
}

async function seedOutsider(db: ReturnType<typeof createFakePrisma>['db'], id: string) {
  return seedUser(db, { id });
}

describe('canAccessRo（§4.2 三态矩阵 + §17 越权）', () => {
  it('private：成员可见，非成员 denied，匿名 denied', async () => {
    const { deps, db, user, ro } = await makeRo();
    expect(await canAccessRo(deps, { researchObjectId: ro.id, userId: user.id })).toBe('granted');
    const outsider = await seedOutsider(db, 'outsider-vis');
    expect(await canAccessRo(deps, { researchObjectId: ro.id, userId: outsider.id })).toBe('denied');
    expect(await canAccessRo(deps, { researchObjectId: ro.id })).toBe('denied');
  });

  it('public：任意可见（含匿名）', async () => {
    const { deps, user, ro } = await makeRo();
    await updateResearchObject(deps, { userId: user.id, roId: ro.id, version: 1, patch: { visibility: 'public' } });
    expect(await canAccessRo(deps, { researchObjectId: ro.id })).toBe('granted');
    expect(await canAccessRo(deps, { researchObjectId: ro.id, userId: 'anyone' })).toBe('granted');
  });

  it('invite_only：成员可见，grant 命中可见，未 grant denied，匿名 denied', async () => {
    const { deps, db, user, ro } = await makeRo();
    await updateResearchObject(deps, { userId: user.id, roId: ro.id, version: 1, patch: { visibility: 'invite_only' } });
    const guest = await seedOutsider(db, 'guest-vis');
    expect(await canAccessRo(deps, { researchObjectId: ro.id, userId: guest.id })).toBe('denied');
    // grant 后可见
    await grantVisibility(deps, { userId: user.id, researchObjectId: ro.id, granteeId: guest.id });
    expect(await canAccessRo(deps, { researchObjectId: ro.id, userId: guest.id })).toBe('granted');
    expect(await canAccessRo(deps, { researchObjectId: ro.id })).toBe('denied');
  });

  it('不存在的 RO → denied（404 不泄露）', async () => {
    const { deps } = await makeRo();
    expect(await canAccessRo(deps, { researchObjectId: 'nonexistent' })).toBe('denied');
  });

  it('requireRoAccess denied → 抛 RESEARCH_OBJECT_NOT_FOUND', async () => {
    const { deps, db, ro } = await makeRo();
    const outsider = await seedOutsider(db, 'outsider-req');
    await expect(requireRoAccess(deps, { researchObjectId: ro.id, userId: outsider.id })).rejects.toThrow(VisibilityError);
  });
});

describe('requestVisibilityChange（§4.2 扩大审批 + 缩小应用 + 幂等）', () => {
  it('缩小（private→ 无，同级）或缩小 public→private → 直接应用', async () => {
    const { deps, user, ro } = await makeRo();
    await updateResearchObject(deps, { userId: user.id, roId: ro.id, version: 1, patch: { visibility: 'public' } });
    const result = await requestVisibilityChange(deps, { userId: user.id, researchObjectId: ro.id, toVisibility: 'private' });
    expect(result.applied).toBe(true);
    expect((await deps.prisma.researchObject.findUnique({ where: { id: ro.id } }))!.visibility).toBe('private');
  });

  it('扩大（private→public）→ 阻断 + VisibilityRequest(pending)', async () => {
    const { deps, db, user, ro } = await makeRo();
    const result = await requestVisibilityChange(deps, { userId: user.id, researchObjectId: ro.id, toVisibility: 'public' });
    expect(result.applied).toBe(false);
    expect(result.requestId).toBeTruthy();
    expect(db.visibilityRequests).toHaveLength(1);
    expect(db.visibilityRequests[0]).toMatchObject({ status: 'pending', fromVisibility: 'private', toVisibility: 'public' });
    // RO 仍 private（未应用）
    expect((await deps.prisma.researchObject.findUnique({ where: { id: ro.id } }))!.visibility).toBe('private');
  });

  it('幂等：同 toVisibility → 直接成功，无请求记录', async () => {
    const { deps, db, user, ro } = await makeRo();
    const result = await requestVisibilityChange(deps, { userId: user.id, researchObjectId: ro.id, toVisibility: 'private' });
    expect(result.applied).toBe(true);
    expect(db.visibilityRequests).toHaveLength(0);
  });

  it('非成员 → 404', async () => {
    const { deps, db, ro } = await makeRo();
    const outsider = await seedOutsider(db, 'outsider-req2');
    await expect(
      requestVisibilityChange(deps, { userId: outsider.id, researchObjectId: ro.id, toVisibility: 'public' }),
    ).rejects.toThrow(/空间不存在/);
  });
});

describe('isVisibilityExpansion', () => {
  it('扩大判定', () => {
    expect(isVisibilityExpansion('private', 'invite_only')).toBe(true);
    expect(isVisibilityExpansion('private', 'public')).toBe(true);
    expect(isVisibilityExpansion('invite_only', 'public')).toBe(true);
    expect(isVisibilityExpansion('public', 'private')).toBe(false);
    expect(isVisibilityExpansion('private', 'private')).toBe(false);
  });
});
