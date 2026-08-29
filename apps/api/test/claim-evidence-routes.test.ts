import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@openscience/auth';
import { buildApp } from '../src/app';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused route-boundary fake */

const USER = '10000000-0000-4000-8000-000000000001';
const WORKSPACE = '20000000-0000-4000-8000-000000000001';
const RO = '30000000-0000-4000-8000-000000000001';
const VERSION = '40000000-0000-4000-8000-000000000001';
const CLAIM = '50000000-0000-4000-8000-000000000001';
const openApps = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  await Promise.all([...openApps].map((app) => app.close()));
  openApps.clear();
});

async function fixture(role = 'author') {
  const claims: any[] = [];
  const audits: any[] = [];
  const user = { id: USER, email: 'claim@example.com', displayName: 'Claim author', status: 'email_verified', level: 'free' };
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => where.id === USER ? user : null },
    workspace: { findUnique: async () => ({ id: WORKSPACE, status: 'active' }) },
    membership: { findUnique: async () => ({ workspaceId: WORKSPACE, userId: USER, role }) },
    version: {
      findUnique: async () => ({
        id: VERSION, researchObjectId: RO, status: 'draft', commitId: 'commit-1',
        researchObject: { id: RO, workspaceId: WORKSPACE }, manifest: { entries: [] },
      }),
      updateMany: async ({ where }: any) => ({ count: where.id === VERSION && where.status === 'draft' ? 1 : 0 }),
    },
    aiReview: { updateMany: async () => ({ count: 0 }) },
    claimNode: {
      findUnique: async ({ where }: any) => claims.find((claim) => claim.id === where.id) ?? null,
      findMany: async () => claims,
      create: async ({ data }: any) => {
        const row = { ...data, createdAt: new Date('2026-08-29T10:00:00.000Z'), updatedAt: new Date('2026-08-29T10:00:00.000Z') };
        claims.push(row);
        return row;
      },
    },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma),
  };
  const sessions = new Map<string, string>();
  const redis: any = {
    set: async (key: string, value: string) => void sessions.set(key, value),
    get: async (key: string) => sessions.get(key) ?? null,
    expire: async () => 1,
    del: async (key: string) => void sessions.delete(key),
  };
  const token = await createSession(redis, { userId: USER, status: user.status });
  const app = await buildApp({
    prisma, redis, mailer: { send: async () => undefined },
    audit: { record: async (event: any) => void audits.push(event) },
    storage: {
      putObject: vi.fn(), getObject: vi.fn(), headObject: vi.fn(), deleteObject: vi.fn(),
    } as any,
    secureCookies: false, cookieSecret: 'claim-evidence-test-secret',
  });
  openApps.add(app);
  return { app, token, claims, audits };
}

describe('Claim/Evidence route boundary', () => {
  it('fails closed for code locators until an authoritative source revision is available', async () => {
    const { app, token } = await fixture();
    const response = await app.inject({
      method: 'POST',
      url: `/research-objects/${RO}/versions/${VERSION}/evidence`,
      cookies: { openscience_session: token },
      payload: {
        id: '60000000-0000-4000-8000-000000000001',
        claimId: CLAIM,
        artifactId: '70000000-0000-4000-8000-000000000001',
        kind: 'code',
        title: 'Code evidence',
        relation: 'supports',
        locator: {
          artifactId: '70000000-0000-4000-8000-000000000001',
          contentHash: 'a'.repeat(64),
          codeRange: { commit: 'abcdef0', path: 'src/model.py', startLine: 1, endLine: 2 },
        },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('creates and replays a version-scoped Claim without duplicating it', async () => {
    const { app, token, claims, audits } = await fixture();
    const request = {
      method: 'POST' as const,
      url: `/research-objects/${RO}/versions/${VERSION}/claims`,
      cookies: { openscience_session: token },
      payload: {
        id: CLAIM, kind: 'core', statement: 'A reproducible 43 fs transfer is observed.',
        assessment: 'supported', conditions: ['room temperature'], limitations: [],
      },
    };
    const first = await app.inject(request);
    const replay = await app.inject(request);

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(claims).toHaveLength(1);
    expect(audits).toEqual([expect.objectContaining({ action: 'claim.create', targetId: CLAIM })]);
  });

  it('requires authentication, enforces writer roles and rejects client-owned verification fields', async () => {
    const unauthenticated = await fixture();
    expect((await unauthenticated.app.inject({
      method: 'GET', url: `/research-objects/${RO}/versions/${VERSION}/claims`,
    })).statusCode).toBe(401);

    const viewer = await fixture('viewer');
    const forbidden = await viewer.app.inject({
      method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/claims`,
      cookies: { openscience_session: viewer.token },
      payload: { id: CLAIM, kind: 'core', statement: 'Claim', assessment: 'supported' },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe('FORBIDDEN');

    const author = await fixture();
    const rejected = await author.app.inject({
      method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/evidence`,
      cookies: { openscience_session: author.token },
      payload: { verifiedByUserId: USER },
    });
    expect(rejected.statusCode).toBe(400);
  });
});
