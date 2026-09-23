import { describe, expect, it } from 'vitest';
import type { WorkspaceDeps } from '../src/workspace/types';
import {
  addJournalMember,
  changeJournalMemberRole,
  createJournalServiceRequest,
  getPublicJournal,
  grantJournalCredits,
  normalizeIssn,
  removeJournalMember,
  saveJournalApplication,
  setJournalOperationalState,
  submitJournalApplication,
  transferJournalOwnership,
  verifyJournalApplication,
} from '../src/journal/onboarding';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused in-memory transaction fake */

function createFake() {
  const db: Record<string, any[]> = {
    users: [], applications: [], identifiers: [], workspaces: [], memberships: [], journals: [], grants: [], ledger: [], services: [], events: [],
  };
  let sequence = 0;
  const id = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const uniqueError = () => Object.assign(new Error('unique'), { code: 'P2002' });
  const apply = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value) row[key] += (value as any).increment;
      else if (value && typeof value === 'object' && 'decrement' in value) row[key] -= (value as any).decrement;
      else row[key] = value;
    }
    row.updatedAt = new Date(); return row;
  };
  const client: any = {
    user: { findUnique: async ({ where }: any) => db.users.find((row) => row.id === where.id) ?? null },
    workspace: {
      findUnique: async ({ where }: any) => db.workspaces.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const row = { id: id(), status: 'active', createdAt: new Date(), updatedAt: new Date(), ...data }; delete row.members; db.workspaces.push(row);
        if (data.members?.create) db.memberships.push({ id: id(), workspaceId: row.id, createdAt: new Date(), ...data.members.create });
        return row;
      },
      update: async ({ where, data }: any) => apply(db.workspaces.find((row) => row.id === where.id), data),
    },
    membership: {
      findUnique: async ({ where }: any) => db.memberships.find((row) => row.workspaceId === where.workspaceId_userId.workspaceId && row.userId === where.workspaceId_userId.userId) ?? null,
      findMany: async ({ where }: any) => db.memberships.filter((row) => (where.userId === undefined || row.userId === where.userId) && (where.workspaceId === undefined || row.workspaceId === where.workspaceId)),
      count: async ({ where }: any) => db.memberships.filter((row) => row.workspaceId === where.workspaceId && (where.role === undefined || row.role === where.role)).length,
      create: async ({ data }: any) => { if (db.memberships.some((row) => row.workspaceId === data.workspaceId && row.userId === data.userId)) throw uniqueError(); const row = { id: id(), createdAt: new Date(), ...data }; db.memberships.push(row); return row; },
      update: async ({ where, data }: any) => apply(db.memberships.find((row) => row.id === where.id), data),
      delete: async ({ where }: any) => db.memberships.splice(db.memberships.findIndex((row) => row.id === where.id), 1)[0],
    },
    journalApplication: {
      findUnique: async ({ where }: any) => db.applications.find((row) => where.id ? row.id === where.id : row.submissionKey === where.submissionKey) ?? null,
      findMany: async ({ where }: any) => db.applications.filter((row) => where.applicantId === undefined || row.applicantId === where.applicantId),
      create: async ({ data }: any) => { const row = { id: id(), status: 'draft', revision: 1, submissionKey: null, submittedAt: null, journalId: null, reviewReason: null, subjects: [], requestedServices: [], createdAt: new Date(), updatedAt: new Date(), ...data }; db.applications.push(row); return row; },
      update: async ({ where, data }: any) => apply(db.applications.find((row) => row.id === where.id), data),
    },
    journalIdentifier: {
      findMany: async ({ where }: any) => db.identifiers.filter((row) => row.journalId === where.journalId),
      create: async ({ data }: any) => { if (db.identifiers.some((row) => row.value === data.value)) throw uniqueError(); const row = { id: id(), journalId: null, ...data }; db.identifiers.push(row); return row; },
      updateMany: async ({ where, data }: any) => { const rows = db.identifiers.filter((row) => row.applicationId === where.applicationId); rows.forEach((row) => apply(row, data)); return { count: rows.length }; },
      deleteMany: async ({ where }: any) => { const before = db.identifiers.length; db.identifiers = db.identifiers.filter((row) => row.applicationId !== where.applicationId || row.journalId !== null); return { count: before - db.identifiers.length }; },
    },
    journal: {
      findUnique: async ({ where }: any) => db.journals.find((row) => where.id ? row.id === where.id : row.workspaceId === where.workspaceId) ?? null,
      findFirst: async ({ where }: any) => db.journals.find((row) => row.homepagePublished === where.homepagePublished && where.OR.some((part: any) => (part.id && row.id === part.id) || (part.slug && row.slug === part.slug))) ?? null,
      create: async ({ data }: any) => { if (db.journals.some((row) => row.slug === data.slug)) throw uniqueError(); const row = { id: id(), operationalState: 'active', homepagePublished: false, revision: 1, ...data }; db.journals.push(row); return row; },
      update: async ({ where, data }: any) => apply(db.journals.find((row) => row.id === where.id), data),
    },
    journalGrant: {
      findUnique: async ({ where }: any) => db.grants.find((row) => row.grantKey === where.grantKey) ?? null,
      findMany: async ({ where }: any) => db.grants.filter((row) => row.journalId === where.journalId && row.expiresAt > where.expiresAt.gt),
      create: async ({ data }: any) => { if (db.grants.some((row) => row.grantKey === data.grantKey)) throw uniqueError(); const row = { id: id(), reserved: 0, consumed: 0, serviceRequestId: null, ...data }; db.grants.push(row); return row; },
      update: async ({ where, data }: any) => apply(db.grants.find((row) => row.id === where.id), data),
    },
    journalLedger: { create: async ({ data }: any) => { if (db.ledger.some((row) => row.eventKey === data.eventKey)) throw uniqueError(); const row = { id: id(), ...data }; db.ledger.push(row); return row; } },
    journalServiceRequest: {
      findUnique: async ({ where }: any) => db.services.find((row) => where.id ? row.id === where.id : row.requestKey === where.requestKey) ?? null,
      create: async ({ data }: any) => { const row = { id: id(), status: 'submitted', ...data }; db.services.push(row); return row; },
      update: async ({ where, data }: any) => apply(db.services.find((row) => row.id === where.id), data),
    },
    journalEvent: { create: async ({ data }: any) => { const row = { id: id(), ...data }; db.events.push(row); return row; } },
    $queryRaw: async () => [],
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const snapshot = structuredClone(db);
      try { return await fn(client); } catch (error) { for (const key of Object.keys(db)) db[key].splice(0, db[key].length, ...snapshot[key]); throw error; }
    },
  };
  const deps: WorkspaceDeps = { prisma: client, mailer: { send: async () => undefined }, now: () => new Date('2026-09-15T00:00:00.000Z') };
  const user = (userId: string, platformRole = 'user') => db.users.push({ id: userId, email: `${userId}@example.com`, displayName: userId, status: 'email_verified', platformRole });
  return { deps, db, user, client };
}

const completeDraft = {
  nameZh: '开放科学学报', nameEn: 'Open Science Journal', pIssn: '2049-3630', websiteUrl: 'https://journal.example.org/',
  publisherName: 'Open Science Press', subjects: ['Open Science'], description: 'A synthetic journal onboarding fixture.',
  applicantName: 'Editor One', applicantTitle: 'Editor in Chief', applicantEmail: 'owner@example.com',
  representationEvidence: 'Official editorial board listing and authorization letter.', rightsDeclaration: '允许目录展示；文件逐篇授权', rightsDeclarationVersion: '2026-09',
};

async function submittedFixture() {
  const fixture = createFake(); fixture.user('owner'); fixture.user('admin', 'platform_admin');
  let application = await saveJournalApplication(fixture.deps, 'owner', completeDraft);
  application = await submitJournalApplication(fixture.deps, 'owner', { applicationId: application.id, revision: application.revision, submissionKey: 'submit-1' });
  return { ...fixture, application };
}

describe('journal onboarding', () => {
  it('normalizes and verifies ISSN checksums', () => {
    expect(normalizeIssn('2049-3630')).toBe('20493630');
    expect(normalizeIssn('2434-561X')).toBe('2434561X');
    expect(() => normalizeIssn('2049-3631')).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('reserves a submitted ISSN globally and keeps submission idempotent', async () => {
    const { deps, user } = createFake(); user('u1'); user('u2');
    const first = await saveJournalApplication(deps, 'u1', { ...completeDraft, applicantEmail: 'u1@example.com' });
    expect(first).toMatchObject({ reviewReason: null, createdAt: expect.any(Date), updatedAt: expect.any(Date) });
    const submitted = await submitJournalApplication(deps, 'u1', { applicationId: first.id, revision: first.revision, submissionKey: 'same-submit' });
    await expect(submitJournalApplication(deps, 'u1', { applicationId: first.id, revision: first.revision, submissionKey: 'same-submit' })).resolves.toEqual(submitted);
    const impersonating = await saveJournalApplication(deps, 'u2', { ...completeDraft, applicantEmail: 'someone-else@example.com', nameZh: '冒认申请' });
    await expect(submitJournalApplication(deps, 'u2', { applicationId: impersonating.id, revision: impersonating.revision, submissionKey: 'bad-email' })).rejects.toThrow('当前登录账号的已验证邮箱');
    const second = await saveJournalApplication(deps, 'u2', { ...completeDraft, applicantEmail: 'u2@example.com', nameZh: '另一期刊' });
    await expect(submitJournalApplication(deps, 'u2', { applicationId: second.id, revision: second.revision, submissionKey: 'submit-2' })).rejects.toMatchObject({ code: 'ISSN_CONFLICT' });
  });

  it('allows only a platform admin to verify and atomically creates one workspace and trial grant', async () => {
    const fixture = await submittedFixture(); fixture.user('ordinary');
    await expect(verifyJournalApplication(fixture.deps, 'ordinary', { applicationId: fixture.application.id, decision: 'approved', slug: 'open-science-journal' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const approved = await verifyJournalApplication(fixture.deps, 'admin', { applicationId: fixture.application.id, decision: 'approved', slug: 'open-science-journal' });
    expect(approved.journal).toMatchObject({ homepagePublished: false, operationalState: 'active' });
    expect(fixture.db.workspaces).toHaveLength(1); expect(fixture.db.memberships).toContainEqual(expect.objectContaining({ userId: 'owner', role: 'owner' }));
    expect(fixture.db.grants).toContainEqual(expect.objectContaining({ amount: 5, remaining: 5, grantKey: `trial:${approved.journal?.id}` }));
    expect(fixture.db.ledger).toContainEqual(expect.objectContaining({ amount: 5, kind: 'grant', eventKey: `trial:${approved.journal?.id}` }));
    await verifyJournalApplication(fixture.deps, 'admin', { applicationId: fixture.application.id, decision: 'approved', slug: 'ignored-on-replay' });
    expect(fixture.db.workspaces).toHaveLength(1); expect(fixture.db.grants).toHaveLength(1); expect(fixture.db.ledger).toHaveLength(1);
    await expect(verifyJournalApplication(fixture.deps, 'admin', { applicationId: fixture.application.id, decision: 'rejected', reason: 'late reversal' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('rolls verification back if trial issuance fails', async () => {
    const fixture = await submittedFixture(); fixture.client.journalGrant.create = async () => { throw new Error('grant unavailable'); };
    await expect(verifyJournalApplication(fixture.deps, 'admin', { applicationId: fixture.application.id, decision: 'approved', slug: 'atomic-journal' })).rejects.toThrow('grant unavailable');
    expect(fixture.db.workspaces).toHaveLength(0); expect(fixture.db.journals).toHaveLength(0);
    expect(fixture.db.applications[0].status).toBe('submitted');
  });

  it('enforces member management boundaries and the final-owner safeguard', async () => {
    const fixture = await submittedFixture(); fixture.user('member'); fixture.user('editor');
    const { journal } = await verifyJournalApplication(fixture.deps, 'admin', { applicationId: fixture.application.id, decision: 'approved', slug: 'member-journal' });
    const journalId = journal!.id;
    await addJournalMember(fixture.deps, 'owner', journalId, { targetUserId: 'member', role: 'admin' });
    await addJournalMember(fixture.deps, 'member', journalId, { targetUserId: 'editor', role: 'editor' });
    await expect(changeJournalMemberRole(fixture.deps, 'member', journalId, { targetUserId: 'editor', role: 'admin' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(removeJournalMember(fixture.deps, 'owner', journalId, 'owner')).rejects.toMatchObject({ code: 'LAST_OWNER' });
    const transferred = await transferJournalOwnership(fixture.deps, 'owner', journalId, { newOwnerId: 'editor', reason: '编辑部负责人变更' });
    expect(transferred.operationalState).toBe('reverification');
    expect(fixture.db.workspaces[0].ownerId).toBe('editor');
  });

  it('applies paused state to the next protected operation and exposes no application secrets publicly', async () => {
    const fixture = await submittedFixture();
    const { journal } = await verifyJournalApplication(fixture.deps, 'admin', { applicationId: fixture.application.id, decision: 'approved', slug: 'public-journal' });
    fixture.db.journals[0].homepagePublished = true;
    await setJournalOperationalState(fixture.deps, 'admin', { journalId: journal!.id, action: 'pause', reason: '身份争议复核' });
    await expect(createJournalServiceRequest(fixture.deps, 'owner', journal!.id, { annualVolume: 20, language: 'zh', figureScale: 'medium', services: ['AI 标准解读包'], requestKey: 'service-1' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const publicDetail = await getPublicJournal(fixture.deps, 'public-journal');
    expect(publicDetail).toMatchObject({ pIssn: '20493630', operationalState: 'paused' });
    expect(publicDetail).not.toHaveProperty('applicantEmail'); expect(publicDetail).not.toHaveProperty('representationEvidence'); expect(publicDetail).not.toHaveProperty('internalNotes');
  });

  it('ledgers admin grants once and refuses deductions that touch reserved credits', async () => {
    const fixture = await submittedFixture();
    const { journal } = await verifyJournalApplication(fixture.deps, 'admin', { applicationId: fixture.application.id, decision: 'approved', slug: 'credit-journal' });
    const expiresAt = new Date('2027-01-01T00:00:00.000Z');
    const input = { journalId: journal!.id, amount: 3, expiresAt, reason: 'signed service order', requestKey: 'grant-1' };
    await grantJournalCredits(fixture.deps, 'admin', input); await grantJournalCredits(fixture.deps, 'admin', input);
    expect(fixture.db.ledger.filter((row) => row.eventKey === 'admin:grant-1')).toHaveLength(1);
    await expect(grantJournalCredits(fixture.deps, 'admin', { ...input, reason: 'changed intent' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    fixture.db.grants.find((row) => row.grantKey.startsWith('trial:')).reserved = 4;
    await expect(grantJournalCredits(fixture.deps, 'admin', { journalId: journal!.id, amount: -5, expiresAt, reason: 'scope reduced', requestKey: 'deduct-too-much' })).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
    await grantJournalCredits(fixture.deps, 'admin', { journalId: journal!.id, amount: -4, expiresAt, reason: 'scope reduced', requestKey: 'deduct-1' });
    expect(fixture.db.ledger).toContainEqual(expect.objectContaining({ eventKey: 'admin:deduct-1', amount: -4, kind: 'adjustment' }));
  });
});
