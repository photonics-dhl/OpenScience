import { describe, expect, it } from 'vitest';
import type { AuditSink } from '@openscience/observability';
import { createFakePrisma, createFakeMailer, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { getSdfDocument, updateSdfDocument } from '../../src/research-object/sdf';

function makeDeps(audit?: AuditSink) {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  db.workspaces.push({ id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() });
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  return { prisma, db, user, deps: { prisma, mailer: createFakeMailer(), ...(audit ? { audit } : {}) } };
}

function fullCore(overrides: Record<string, string> = {}) {
  return {
    schemaVersion: '0.1.0',
    problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP',
    ...overrides,
  };
}

describe('sdf 读写（P1B-1 合同 + 乐观锁）', () => {
  it('getSdfDocument 返回 core + 六 nodes', async () => {
    const { deps, user } = makeDeps();
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'S', sdf: { core: fullCore() } });
    const sdf = await getSdfDocument(deps, { userId: user.id, roId: ro.id });
    expect(sdf.core.problem).toBe('P');
    expect(sdf.nodes).toHaveLength(6);
  });

  it('updateSdfDocument 合法 core → 更新 core_json + nodes + 审计 sdf.update', async () => {
    const records: unknown[] = [];
    const audit: AuditSink = { record: async (e) => void records.push(e) };
    const { deps, user } = makeDeps(audit);
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'S', sdf: { core: fullCore() } });
    const updated = await updateSdfDocument(deps, {
      userId: user.id, roId: ro.id, version: 1,
      core: fullCore({ problem: 'New problem', insight: 'New insight' }),
    });
    expect(updated.core.problem).toBe('New problem');
    expect(updated.core.insight).toBe('New insight');
    expect(records.some((r) => (r as { action: string }).action === 'sdf.update')).toBe(true);
  });

  it('非法 core → VALIDATION_ERROR（P1B-1 合同）', async () => {
    const { deps, user } = makeDeps();
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'S' });
    // 缺 insight 字段 → 非法
    const bad = fullCore() as Record<string, string>;
    delete bad.insight;
    await expect(
      updateSdfDocument(deps, { userId: user.id, roId: ro.id, version: 1, core: bad }),
    ).rejects.toThrow(/SDF 文档不符合 core Schema/);
  });

  it('乐观锁冲突 → CONCURRENT_UPDATE', async () => {
    const { deps, user } = makeDeps();
    const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'S' });
    await expect(
      updateSdfDocument(deps, { userId: user.id, roId: ro.id, version: 99, core: fullCore() }),
    ).rejects.toThrow(/版本冲突/);
  });
});
