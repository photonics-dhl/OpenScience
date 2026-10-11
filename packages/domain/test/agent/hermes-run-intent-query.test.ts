import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { getExistingHermesResearchRun, type HermesResearchRunDeps } from '../../src/agent/research-run';
import { VISUAL_NARRATIVE_PROFILE } from '../../src/assets/video';

const uuid = (value: number) => `${value.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001`;
const scope = { actorId: uuid(1), researchObjectId: uuid(2), ingestionTaskId: uuid(3) };
const settings = { locale: 'en', style: 'scientific', instruction: 'Explain the reviewed paper.' };
type Query = {
  where?: { actorId?: string; researchObjectId?: string; profile?: string;
    steps?: { some: { stage: string; ingestionTaskId: string } } };
  orderBy?: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
  take?: number; skip?: number; cursor?: { id: string };
};

function fixture() {
  const { prisma, db } = createFakePrisma();
  seedUser(db, { id: scope.actorId });
  db.workspaces.push({ id: 'workspace', status: 'active' });
  db.memberships.push({ workspaceId: 'workspace', userId: scope.actorId, role: 'author' });
  db.researchObjects.push({ id: scope.researchObjectId, workspaceId: 'workspace', status: 'draft' });
  db.versions.push({ id: uuid(4), researchObjectId: scope.researchObjectId, status: 'draft' });
  let nextId = 100;
  const addRun = (generationSettings: unknown = settings, changes: { actorId?: string; researchObjectId?: string;
    ingestionTaskId?: string; profile?: string; status?: string; createdAt?: Date } = {}) => {
    const id = uuid(nextId++);
    const row = { id, actorId: changes.actorId ?? scope.actorId, researchObjectId: changes.researchObjectId ?? scope.researchObjectId,
      versionId: uuid(4), profile: changes.profile ?? VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9, generationSettings,
      status: changes.status ?? 'succeeded', version: 7, error: null as string | null, sourceClaimIds: [], sourceReviewDigest: null,
      idempotencyKey: `original-once-key:${id}`, requestDigest: `original-digest:${id}`,
      createdAt: changes.createdAt ?? new Date('2026-10-08T00:00:00Z'), updatedAt: new Date('2026-10-08T01:00:00Z') };
    db.hermesResearchRuns.push(row);
    db.hermesResearchSteps.push({ id: `source:${id}`, runId: id, stage: 'source_ingestion', ordinal: 0, status: 'succeeded',
      ingestionTaskId: changes.ingestionTaskId ?? scope.ingestionTaskId, agentTaskId: null, presentationAssetId: null, artifactId: null, error: null });
    return row;
  };
  // Extend only the missing ORM reader behavior. Candidates come from persisted
  // shared-fake rows; no output intent or expected result is selected here.
  const candidates = (args: Query) => {
    const where = args.where ?? {};
    let rows = db.hermesResearchRuns.filter(row => (!where.actorId || row.actorId === where.actorId)
      && (!where.researchObjectId || row.researchObjectId === where.researchObjectId) && (!where.profile || row.profile === where.profile)
      && (!where.steps || db.hermesResearchSteps.some(step => step.runId === row.id
        && step.stage === where.steps!.some.stage && step.ingestionTaskId === where.steps!.some.ingestionTaskId)));
    rows.sort((left, right) => {
      for (const order of args.orderBy ?? []) {
        for (const [field, direction] of Object.entries(order)) {
          const a = field === 'createdAt' ? +left.createdAt : left.id, b = field === 'createdAt' ? +right.createdAt : right.id;
          if (a !== b) return (a < b ? -1 : 1) * (direction === 'asc' ? 1 : -1);
        }
      }
      return 0;
    });
    const offset = args.cursor ? rows.findIndex(row => row.id === args.cursor!.id) : 0;
    if (offset < 0) return [];
    rows = rows.slice(offset + (args.skip ?? 0));
    return rows.slice(0, args.take ?? rows.length);
  };
  const pages: number[] = [];
  const findMany = vi.fn(async (args: Query) => {
    const rows = candidates(args); pages.push(rows.length);
    return rows.map(row => ({ id: row.id, generationSettings: row.generationSettings }));
  });
  Object.assign(prisma.hermesResearchRun, {
    findFirst: async (args: Query) => candidates({ ...args, take: 1 })[0] ?? null,
    findMany,
  });
  const deps = { prisma, redis: {} as HermesResearchRunDeps['redis'] };
  return { prisma, db, deps, addRun, pages, findMany };
}

describe('existing Hermes run output intent query', () => {
  it('retrieves separate image and video runs in actor/RO/source/profile scope without changing grants or keys', async () => {
    const f = fixture();
    const image = f.addRun(), video = f.addRun({ ...settings, output: 'video' });
    for (const changes of [{ actorId: uuid(10) }, { researchObjectId: uuid(11) }, { ingestionTaskId: uuid(12) }, { profile: 'content-driven-v1' }]) {
      f.addRun(settings, changes); f.addRun({ ...settings, output: 'video' }, changes);
    }
    // A greater ID is not newer when createdAt differs.
    f.addRun(settings, { createdAt: new Date('2026-10-07T00:00:00Z') });
    const before = structuredClone(f.db);
    expect(await getExistingHermesResearchRun(f.deps, scope)).toMatchObject({ id: image.id, versionId: uuid(4), maxAgentTasks: 9 });
    expect(await getExistingHermesResearchRun(f.deps, { ...scope, output: 'image' })).toMatchObject({ id: image.id });
    expect(await getExistingHermesResearchRun(f.deps, { ...scope, output: 'video' })).toMatchObject({ id: video.id });
    expect(f.db).toEqual(before);
  });

  it.each([['missing output', settings], ['null settings', null], ['explicit image', { ...settings, output: 'image' }]])(
    'reads legacy image intent: %s', async (_label, generationSettings) => {
    const f = fixture(), image = f.addRun(generationSettings);
    const before = structuredClone(f.db.hermesResearchRuns);
    const read = await getExistingHermesResearchRun(f.deps, { ...scope, output: 'image' });
    expect(read).toMatchObject({ id: image.id, generationSettings: generationSettings === null ? null : settings });
    expect(f.db.hermesResearchRuns).toEqual(before);
  });

  it.each(['image', 'video'] as const)('does not treat uncertain explicit outputs or malformed settings as %s', async output => {
    const f = fixture();
    for (const value of [{ ...settings, output: 'audio' }, { ...settings, output: null }, { ...settings, output: 'Video' }, [], 'video']) f.addRun(value);
    expect(await getExistingHermesResearchRun(f.deps, { ...scope, output })).toBeNull();
  });

  it.each(['image', 'video'] as const)('searches beyond two pages of the other intent for the latest %s run', async output => {
    const f = fixture();
    const target = f.addRun(output === 'video' ? { ...settings, output } : settings);
    for (let index = 0; index < 61; index++) f.addRun(output === 'video' ? settings : { ...settings, output: 'video' });
    expect(await getExistingHermesResearchRun(f.deps, { ...scope, output })).toMatchObject({ id: target.id });
    expect(f.pages.length).toBeGreaterThanOrEqual(3);
    expect(f.pages.every(size => size <= 25)).toBe(true);
  });

  it.each(['image', 'video'] as const)('returns null only after exhausting scoped pages without a matching %s', async output => {
    const f = fixture();
    for (let index = 0; index < 61; index++) f.addRun(output === 'video' ? settings : { ...settings, output: 'video' });
    expect(await getExistingHermesResearchRun(f.deps, { ...scope, output })).toBeNull();
    expect(f.pages.length).toBeGreaterThanOrEqual(3);
  });

  it.each([1, 2])('stops an unmatched ordinary source with %s rows after one page', async count => {
    const f = fixture();
    for (let index = 0; index < count; index++) f.addRun({ ...settings, output: 'video' });
    expect(await getExistingHermesResearchRun(f.deps, scope)).toBeNull();
    expect(f.pages).toEqual([count]);
  });

  it.each([['image', 'failed'], ['image', 'unknown'], ['video', 'failed'], ['video', 'unknown']] as const)(
    'returns the latest %s run with status %s instead of an older success', async (output, status) => {
    const f = fixture(), generationSettings = output === 'video' ? { ...settings, output } : settings;
    f.addRun(generationSettings);
    const target = f.addRun(generationSettings, { status });
    target.error = 'Provider outcome remains uncertain';
    expect(await getExistingHermesResearchRun(f.deps, { ...scope, output })).toMatchObject({ id: target.id, status, error: target.error, version: 7 });
    expect(f.db.agentTasks).toHaveLength(0);
    expect(f.db.usageLedger).toHaveLength(0);
  });

  it.each(['audio', 'Video', '', null, 1, {}, ['video']].map(output => [output]))('rejects invalid runtime output %j with the existing Domain error', async output => {
    const f = fixture();
    f.addRun();
    await expect(getExistingHermesResearchRun(f.deps, { ...scope, output: output as 'image' | 'video' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it.each([true, false])('hides membership loss whether matching rows exist (%s)', async hasRun => {
    const f = fixture(); if (hasRun) f.addRun();
    f.db.memberships.length = 0;
    await expect(getExistingHermesResearchRun(f.deps, scope)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('hides a missing research object and does not expose another actor run', async () => {
    const f = fixture(); f.addRun(settings, { actorId: uuid(10) });
    expect(await getExistingHermesResearchRun(f.deps, scope)).toBeNull();
    f.db.researchObjects.length = 0;
    await expect(getExistingHermesResearchRun(f.deps, scope)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
