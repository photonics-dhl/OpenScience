import { describe, expect, it } from 'vitest';
import {
  beginOrcidConnection,
  completeOrcidConnection,
  getAcademicIdentityStatus,
  requestInstitutionEmailCode,
  verifyInstitutionEmail,
  type AcademicIdentityDeps,
} from '../src/academic-identity';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused Prisma/Redis fakes intentionally cover only this service boundary */

const NOW = new Date('2026-09-01T08:00:00.000Z');

function makeDeps() {
  const redisStore = new Map<string, string>();
  const sent: Array<{ to: string; text: string }> = [];
  const credentials: Array<Record<string, any>> = [];
  const challenges: Array<Record<string, any>> = [];
  const roles: Array<Record<string, any>> = [];
  const prisma: any = {
    user: { findUnique: async () => ({ status: 'email_verified' }) },
    identityCredential: {
      findMany: async ({ where }: any) => credentials.filter((row) => row.userId === where.userId && row.status === where.status),
      findUnique: async ({ where }: any) => {
        if (where.type_externalId) return credentials.find((row) => row.type === where.type_externalId.type && row.externalId === where.type_externalId.externalId) ?? null;
        return null;
      },
      upsert: async ({ where, create, update }: any) => {
        const current = credentials.find((row) => row.userId === where.userId_type.userId && row.type === where.userId_type.type);
        if (current) { Object.assign(current, update, { updatedAt: NOW }); return current; }
        const row = { id: `credential-${credentials.length + 1}`, status: 'verified', verifiedAt: NOW, createdAt: NOW, updatedAt: NOW, ...create };
        credentials.push(row); return row;
      },
    },
    scopedRoleAssignment: {
      findMany: async ({ where }: any) => roles.filter((row) => row.userId === where.userId && row.status === 'active'),
    },
    institutionEmailChallenge: {
      findFirst: async ({ where }: any) => challenges.filter((row) => row.userId === where.userId && row.consumedAt === null && (!where.email || row.email === where.email)).at(-1) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `challenge-${challenges.length + 1}`, attempts: 0, lockedUntil: null, consumedAt: null, createdAt: NOW, ...data };
        challenges.push(row); return row;
      },
      update: async ({ where, data }: any) => Object.assign(challenges.find((row) => row.id === where.id), data),
      updateMany: async ({ where, data }: any) => {
        const matches = challenges.filter((row) => (!where.id || row.id === where.id) && (!where.userId || row.userId === where.userId) && (where.consumedAt === undefined || row.consumedAt === where.consumedAt));
        matches.forEach((row) => Object.assign(row, data)); return { count: matches.length };
      },
    },
  };
  prisma.$transaction = async (callback: (tx: any) => unknown) => callback(prisma);
  const deps = {
    prisma,
    redis: {
      set: async (key: string, value: string) => { if (redisStore.has(key)) return null; redisStore.set(key, value); return 'OK'; },
      get: async (key: string) => redisStore.get(key) ?? null,
      del: async (key: string) => Number(redisStore.delete(key)),
    },
    mailer: { send: async (message: { to: string; text: string }) => { sent.push(message); } },
    orcid: {
      clientId: 'APP-TEST', clientSecret: 'secret', redirectUri: 'http://127.0.0.1:3000/api/auth/orcid/callback', baseUrl: 'https://sandbox.orcid.org',
    },
    institutionEmailDomains: ['zju.edu.cn'],
    now: () => NOW,
  } as unknown as AcademicIdentityDeps;
  return { deps, redisStore, sent, credentials, challenges, roles };
}

describe('academic identity credentials', () => {
  it('creates a user-bound one-time ORCID state and stores the authenticated iD', async () => {
    const { deps, credentials, redisStore } = makeDeps();
    const { authorizationUrl } = await beginOrcidConnection(deps, 'user-1');
    const url = new URL(authorizationUrl);
    expect(url.origin).toBe('https://sandbox.orcid.org');
    expect(url.searchParams.get('scope')).toBe('/authenticate');
    const state = url.searchParams.get('state')!;
    expect(redisStore.has(`orcid:state:${state}`)).toBe(true);
    deps.fetch = async () => new Response(JSON.stringify({ orcid: '0000-0002-1825-0097', name: 'Researcher', scope: '/authenticate' }), { status: 200 });
    await expect(completeOrcidConnection(deps, 'user-1', { code: 'oauth-code', state })).resolves.toMatchObject({ orcid: '0000-0002-1825-0097' });
    expect(credentials).toContainEqual(expect.objectContaining({ userId: 'user-1', type: 'orcid', externalId: '0000-0002-1825-0097', source: 'orcid_oauth' }));
    expect(redisStore.has(`orcid:state:${state}`)).toBe(false);
  });

  it('rejects a domain that is not in the trusted institution registry', async () => {
    const { deps } = makeDeps();
    await expect(requestInstitutionEmailCode(deps, 'user-1', { email: 'person@gmail.com' })).rejects.toMatchObject({ code: 'INSTITUTION_DOMAIN_NOT_ALLOWED' });
  });

  it('verifies an institution email without replacing the login email', async () => {
    const { deps, sent, credentials } = makeDeps();
    await requestInstitutionEmailCode(deps, 'user-1', { email: 'researcher@zju.edu.cn' });
    const code = sent[0].text.match(/(\d{6})/)![1];
    await verifyInstitutionEmail(deps, 'user-1', { email: 'researcher@zju.edu.cn', code });
    expect(credentials).toContainEqual(expect.objectContaining({ userId: 'user-1', type: 'institution_email', externalId: 'researcher@zju.edu.cn' }));
  });

  it('returns multiple independent scope assignments for one user', async () => {
    const { deps, roles } = makeDeps();
    roles.push(
      { userId: 'user-1', status: 'active', scopeType: 'research_object', scopeId: 'ro-1', role: 'author', startsAt: NOW, expiresAt: null },
      { userId: 'user-1', status: 'active', scopeType: 'review_assignment', scopeId: 'review-9', role: 'reviewer', startsAt: NOW, expiresAt: new Date('2026-09-08T08:00:00Z') },
    );
    const status = await getAcademicIdentityStatus(deps, 'user-1');
    expect(status.scopedRoles).toEqual([
      expect.objectContaining({ scopeId: 'ro-1', role: 'author' }),
      expect.objectContaining({ scopeId: 'review-9', role: 'reviewer' }),
    ]);
  });
});
