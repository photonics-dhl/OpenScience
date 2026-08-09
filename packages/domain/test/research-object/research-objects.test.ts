import { describe, expect, it } from 'vitest';
import type { AuditSink } from '@openscience/observability';
import { createFakePrisma, createFakeMailer, seedUser } from '../helpers/fakes';
import { createResearchObject, getResearchObject, listResearchObjects, updateResearchObject } from '../../src/research-object/research-objects';
import { SDF_NODE_TYPES } from '../../src/research-object/types';

function makeDeps(audit?: AuditSink) {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const ws = {
    id: 'ws-1', type: 'team', name: 'Lab', status: 'active',
    ownerId: user.id, createdAt: new Date(), updatedAt: new Date(),
  };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  return { prisma, db, user, ws, deps: { prisma, mailer: createFakeMailer(), ...(audit ? { audit } : {}) } };
}

describe('createResearchObject（验收步骤 2：个人空间建私有 RO）', () => {
  it('同事务建 RO + SDFDocument + 六 SDFNode（原子）', async () => {
    const { deps, db, user } = makeDeps();
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'My first RO' });
    expect(ro.status).toBe('draft');
    expect(ro.visibility).toBe('private');
    expect(ro.version).toBe(1);
    expect(db.researchObjects).toHaveLength(1);
    expect(db.sdfDocuments).toHaveLength(1);
    expect(db.sdfDocuments[0].coreJson).toMatchObject({ schemaVersion: '0.1.0', problem: '' });
    expect(db.sdfNodes).toHaveLength(6);
    expect(db.sdfNodes.map((n) => n.nodeType)).toEqual([...SDF_NODE_TYPES]);
  });

  it('带初始 SDF core 创建 → core_json + nodes 落值', async () => {
    const { deps, db, user } = makeDeps();
    const sdf = { core: { schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: '', results: '', limitations: '', reproducibility: '' } };
    await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'With SDF', sdf });
    expect(db.sdfDocuments[0].coreJson.problem).toBe('P');
    expect(db.sdfNodes.find((n) => n.nodeType === 'problem').content).toBe('P');
  });

  it('非成员创建 → 404（requireMembership 语义）', async () => {
    const { deps, db, user } = makeDeps();
    // 另建一个无 membership 的 workspace → 非成员
    db.workspaces.push({ id: 'ws-other', type: 'team', name: 'Other', status: 'active', ownerId: 'someone', createdAt: new Date(), updatedAt: new Date() });
    await expect(
      createResearchObject(deps, { workspaceId: 'ws-other', userId: user.id, title: 'X' }),
    ).rejects.toThrow(/空间不存在/);
  });

  it('空标题 → VALIDATION_ERROR', async () => {
    const { deps, user } = makeDeps();
    await expect(createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: '  ' })).rejects.toThrow(/标题/);
  });

  it('写审计行 research_object.create', async () => {
    const records: unknown[] = [];
    const audit: AuditSink = { record: async (e) => void records.push(e) };
    const { deps, user } = makeDeps(audit);
    await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'Audited' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ action: 'research_object.create', targetType: 'research_object' });
  });
});

describe('getResearchObject', () => {
  it('lists only research objects in the current user workspaces, newest first', async () => {
    const { deps, db, user } = makeDeps();
    const first = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'First' });
    const second = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'Second' });
    db.researchObjects.find((row) => row.id === first.id).updatedAt = new Date('2026-01-01');
    db.researchObjects.find((row) => row.id === second.id).updatedAt = new Date('2026-02-01');
    db.researchObjects.push({ id: 'other-ro', workspaceId: 'other-workspace', title: 'Private other', status: 'draft', visibility: 'private', version: 1, publicId: null, createdAt: new Date(), updatedAt: new Date() });

    const rows = await listResearchObjects(deps, { userId: user.id, limit: 10 });

    expect(rows.map((row) => row.title)).toEqual(['Second', 'First']);
  });

  it('成员查详情（RO + core + nodes）', async () => {
    const { deps, user } = makeDeps();
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'Detail' });
    const detail = await getResearchObject(deps, { userId: user.id, roId: ro.id });
    expect(detail.title).toBe('Detail');
    expect(detail.sdf.nodes).toHaveLength(6);
    expect(detail.sdf.core).toMatchObject({ schemaVersion: '0.1.0' });
  });

  it('非成员查询 → 404', async () => {
    const { deps, db, user } = makeDeps();
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'Secret' });
    const outsider = seedUser(db, { id: 'outsider' });
    await expect(getResearchObject(deps, { userId: outsider.id, roId: ro.id })).rejects.toThrow(/研究对象不存在/);
  });
});

describe('updateResearchObject（乐观锁，§16）', () => {
  it('正确 version 更新成功 → version 递增 + 审计', async () => {
    const records: unknown[] = [];
    const audit: AuditSink = { record: async (e) => void records.push(e) };
    const { deps, user } = makeDeps(audit);
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'v1' });
    const updated = await updateResearchObject(deps, { userId: user.id, roId: ro.id, version: 1, patch: { title: 'v2', visibility: 'invite_only' } });
    expect(updated.title).toBe('v2');
    expect(updated.visibility).toBe('invite_only');
    expect(updated.version).toBe(2);
    expect(records.some((r) => (r as { action: string }).action === 'research_object.update')).toBe(true);
  });

  it('version 过期 → CONCURRENT_UPDATE（乐观锁冲突）', async () => {
    const { deps, user } = makeDeps();
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'Locked' });
    await expect(
      updateResearchObject(deps, { userId: user.id, roId: ro.id, version: 99, patch: { title: 'X' } }),
    ).rejects.toThrow(/版本冲突/);
  });

  it('非法 title → VALIDATION_ERROR', async () => {
    const { deps, user } = makeDeps();
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'OK' });
    await expect(
      updateResearchObject(deps, { userId: user.id, roId: ro.id, version: 1, patch: { title: '' } }),
    ).rejects.toThrow(/标题/);
  });

  it('非成员更新 → 404', async () => {
    const { deps, db, user } = makeDeps();
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'Mine' });
    const outsider = seedUser(db, { id: 'outsider2' });
    await expect(
      updateResearchObject(deps, { userId: outsider.id, roId: ro.id, version: 1, patch: { title: 'X' } }),
    ).rejects.toThrow(/空间不存在/);
  });
});
