import { describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { createFakeMailer, createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { buildApp } from '../src/app';

const USER = '10000000-0000-4000-8000-000000000001';
const WORKSPACE = '20000000-0000-4000-8000-000000000001';
const RO = '30000000-0000-4000-8000-000000000001';
const VERSION = '40000000-0000-4000-8000-000000000001';
const CLAIM = '50000000-0000-4000-8000-000000000001';
const ASSET = '60000000-0000-4000-8000-000000000001';

function makeRedis() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => void store.set(key, value),
    del: async (key: string) => void store.delete(key),
    expire: async () => 1,
    lpush: async () => 1,
    multi: () => {
      const chain = { incr: () => chain, expire: () => chain, exec: async () => [[null, 1]] };
      return chain;
    },
  };
}

async function fixture(platformRole = 'user') {
  const { prisma, db } = createFakePrisma();
  const redis = makeRedis();
  seedUser(db, { id: USER, platformRole });
  db.workspaces.push({ id: WORKSPACE, type: 'personal', ownerId: USER, name: 'Personal', status: 'active', createdAt: new Date(), updatedAt: new Date() });
  db.memberships.push({ id: 'membership', workspaceId: WORKSPACE, userId: USER, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  db.researchObjects.push({ id: RO, workspaceId: WORKSPACE, createdBy: USER, status: 'draft', visibility: 'private' });
  db.versions.push({ id: VERSION, researchObjectId: RO, status: 'draft', versionNo: 1 });
  db.claimNodes.push({
    id: CLAIM, researchObjectId: RO, versionId: VERSION, kind: 'core', statement: 'Transfer completes in 43 fs.',
    assessment: 'supported', conditions: [], limitations: [], provenance: {}, extractionStatus: 'succeeded',
  });
  db.usageLedger.push({ id: 'credit', userId: USER, resource: 'ai_credit', delta: 5, kind: 'grant', createdAt: new Date() });
  const token = await createSession(redis as never, { userId: USER, status: 'email_verified' });
  const app = await buildApp({
    prisma, redis: redis as never, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false,
    security: { csrf: true }, rateLimitEnabled: false,
  });
  const csrf = await app.inject({ method: 'GET', url: '/csrf-token' });
  return {
    app, db, token, csrfToken: csrf.json().csrfToken as string,
    csrfCookie: csrf.cookies.find((cookie) => cookie.name === '_csrf')!.value,
  };
}

function writeAuth(token: string, csrfCookie: string, csrfToken: string, idempotencyKey?: string) {
  return {
    cookies: { openscience_session: token, _csrf: csrfCookie },
    headers: { 'x-csrf-token': csrfToken, ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
  };
}

describe('Presentation asset routes', () => {
  it('submits one replay-safe deterministic generation task through a bounded contract', async () => {
    const { app, db, token, csrfCookie, csrfToken } = await fixture();
    const url = `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`;
    const payload = { kind: 'chart', sourceClaimIds: [CLAIM] };
    const auth = writeAuth(token, csrfCookie, csrfToken, 'presentation-route-1');

    const first = await app.inject({ method: 'POST', url, ...auth, payload });
    const replay = await app.inject({ method: 'POST', url, ...auth, payload });

    expect(first.statusCode).toBe(202);
    expect(replay.json()).toEqual(first.json());
    expect(first.json().task).toMatchObject({ kind: 'presentation.generate', status: 'pending' });
    expect(db.agentTasks).toHaveLength(1);
    expect((await app.inject({ method: 'POST', url, ...writeAuth(token, csrfCookie, csrfToken), payload })).statusCode).toBe(400);
    await app.close();
  });

  it('lists safe metadata and approves a draft with optimistic locking', async () => {
    const { app, db, token, csrfCookie, csrfToken } = await fixture();
    const updatedAt = new Date('2026-09-05T00:00:00.000Z');
    db.presentationAssets.push({
      id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'chart', status: 'draft',
      label: 'presentation_not_evidence', objectKey: 'private/asset.svg', promptHash: 'private', contentHash: 'a'.repeat(64),
      generator: 'hermes-chart', generatorVersion: '1', provenance: {}, createdAt: updatedAt, updatedAt,
    });
    db.presentationAssetClaims.push({ presentationAssetId: ASSET, claimId: CLAIM, researchObjectId: RO, versionId: VERSION });
    const base = `/research-objects/${RO}/versions/${VERSION}/presentation-assets`;

    const listed = await app.inject({ method: 'GET', url: base, cookies: { openscience_session: token } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().assets[0]).toMatchObject({ id: ASSET, sourceClaimIds: [CLAIM], label: 'presentation_not_evidence' });
    expect(listed.json().assets[0]).not.toHaveProperty('objectKey');
    expect(listed.json().assets[0]).not.toHaveProperty('promptHash');

    const conflict = await app.inject({
      method: 'PATCH', url: `${base}/${ASSET}`, ...writeAuth(token, csrfCookie, csrfToken),
      payload: { status: 'approved', expectedUpdatedAt: '2026-09-04T00:00:00.000Z' },
    });
    expect(conflict.statusCode).toBe(409);

    const patched = await app.inject({
      method: 'PATCH', url: `${base}/${ASSET}`, ...writeAuth(token, csrfCookie, csrfToken),
      payload: { status: 'approved', expectedUpdatedAt: updatedAt.toISOString() },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().asset.status).toBe('approved');
    const stale = await app.inject({
      method: 'PATCH', url: `${base}/${ASSET}`, ...writeAuth(token, csrfCookie, csrfToken),
      payload: { status: 'rejected', expectedUpdatedAt: updatedAt.toISOString() },
    });
    expect(stale.statusCode).toBe(409);
    db.memberships.length = 0;
    const denied = await app.inject({ method: 'GET', url: base, cookies: { openscience_session: token } });
    expect(denied.statusCode).toBe(404);
    await app.close();
  });

  it('keeps generated media behind platform-admin authorization', async () => {
    const { app, token, csrfCookie, csrfToken } = await fixture();
    const response = await app.inject({
      method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`,
      ...writeAuth(token, csrfCookie, csrfToken, 'presentation-image-1'), payload: { kind: 'image', sourceClaimIds: [CLAIM] },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ADMIN_REQUIRED');
    await app.close();
  });
});
