import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import { DETERMINISTIC_PRESENTATION_GENERATOR, DETERMINISTIC_PRESENTATION_GENERATOR_VERSION } from '@openscience/domain';
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

async function fixture(platformRole = 'user', storage?: StorageAdapter) {
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
    security: { csrf: true }, rateLimitEnabled: false, storage,
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
  async function taskFixture() {
    const ctx = await fixture();
    const created = await ctx.app.inject({ method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`, ...writeAuth(ctx.token, ctx.csrfCookie, ctx.csrfToken, 'scoped-task-read'), payload: { kind: 'chart', sourceClaimIds: [CLAIM] } });
    expect(created.statusCode).toBe(202);
    const taskId = created.json().task.id as string;
    return { ...ctx, url: `/research-objects/${RO}/versions/${VERSION}/presentation-tasks/${taskId}`, taskId };
  }

  it.each(['pending', 'succeeded'])('reads the exact scoped %s presentation task without inventing DTO fields', async (status) => {
    const ctx = await taskFixture();
    ctx.db.agentTasks[0].status = status;
    ctx.db.workspaces[0].status = 'archived';
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
    expect(response.statusCode).toBe(200);
    expect(response.json().task).toMatchObject({ id: ctx.taskId, status, kind: 'presentation.generate' });
    expect(response.json().task).not.toHaveProperty('researchObjectId');
    expect(response.json().task).not.toHaveProperty('payload');
    await ctx.app.close();
  });

  it.each(['session-ro', 'payload-ro', 'payload-version', 'kind', 'creator', 'membership'])('rejects task recovery for mismatched %s', async (mismatch) => {
    const ctx = await taskFixture();
    if (mismatch === 'session-ro') ctx.db.agentSessions[0].researchObjectId = ASSET;
    if (mismatch === 'payload-ro') ctx.db.agentTasks[0].payload.researchObjectId = ASSET;
    if (mismatch === 'payload-version') ctx.db.agentTasks[0].payload.versionId = ASSET;
    if (mismatch === 'kind') ctx.db.agentTasks[0].kind = 'sdf.extract';
    if (mismatch === 'creator') ctx.db.agentSessions[0].userId = ASSET;
    if (mismatch === 'membership') ctx.db.memberships.length = 0;
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).not.toHaveProperty('task');
    await ctx.app.close();
  });

  it('requires authentication and validates the scoped task id', async () => {
    const ctx = await taskFixture();
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url.replace(ctx.taskId, 'invalid'), cookies: { openscience_session: ctx.token } })).statusCode).toBe(400);
    await ctx.app.close();
  });

  async function contentFixture(bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>Study</text></svg>')) {
    const headObject = vi.fn(async () => ({ size: bytes.length, contentType: 'image/svg+xml', etag: 'test' }));
    const getObject = vi.fn(async () => ({ size: bytes.length, contentType: 'image/svg+xml', body: Readable.from([bytes]) }));
    const ctx = await fixture('user', { headObject, getObject } as unknown as StorageAdapter);
    ctx.db.presentationAssets.push({
      id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'chart', status: 'draft',
      label: 'presentation_not_evidence', objectKey: 'private/secret-chart.svg', contentHash: createHash('sha256').update(bytes).digest('hex'),
      generator: DETERMINISTIC_PRESENTATION_GENERATOR, generatorVersion: DETERMINISTIC_PRESENTATION_GENERATOR_VERSION,
    });
    return { ...ctx, bytes, headObject, getObject, url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/${ASSET}/content` };
  }

  it.each(['draft', 'approved', 'rejected'])('privately serves trusted chart bytes for %s assets, including archived member reads', async (status) => {
    const ctx = await contentFixture();
    ctx.db.presentationAssets[0].status = status;
    ctx.db.workspaces[0].status = 'archived';
    ctx.db.memberships[0].role = 'viewer';
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(ctx.bytes);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("sandbox; default-src 'none'");
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(JSON.stringify(response.headers)).not.toContain('secret-chart');
    await ctx.app.close();
  });

  it('rejects anonymous, cross-workspace, wrong-version and wrong-RO reads before touching storage', async () => {
    const ctx = await contentFixture();
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url })).statusCode).toBe(401);
    const cookies = { openscience_session: ctx.token };
    const otherVersion = '40000000-0000-4000-8000-000000000099';
    ctx.db.versions.push({ id: otherVersion, researchObjectId: RO, status: 'draft' });
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url.replace(VERSION, otherVersion), cookies })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url.replace(RO, '30000000-0000-4000-8000-000000000099'), cookies })).statusCode).toBe(404);
    ctx.db.memberships.length = 0;
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url, cookies })).statusCode).toBe(404);
    expect(ctx.headObject).not.toHaveBeenCalled();
    await ctx.app.close();
  });

  it('rejects range requests and corrupted content without returning partial bytes or storage paths', async () => {
    const ctx = await contentFixture();
    const cookies = { openscience_session: ctx.token };
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url, cookies, headers: { range: 'bytes=0-4' } })).statusCode).toBe(416);
    ctx.db.presentationAssets[0].contentHash = '0'.repeat(64);
    const corrupt = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies });
    expect(corrupt.statusCode).toBe(404);
    expect(corrupt.body).not.toContain('secret-chart');
    await ctx.app.close();
  });

  async function videoFixture() {
    const ctx = await contentFixture(Buffer.from('0123456789'));
    ctx.db.presentationAssets[0].kind = 'video';
    ctx.headObject.mockResolvedValue({ size: ctx.bytes.length, contentType: 'video/mp4', etag: 'test' });
    ctx.getObject.mockImplementation(async () => ({ size: ctx.bytes.length, contentType: 'video/mp4', body: Readable.from([ctx.bytes]) }));
    return ctx;
  }

  it.each([
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=8-999', '89', 'bytes 8-9/10'],
    ['bytes=-999', '0123456789', 'bytes 0-9/10'],
  ])('serves authenticated video seeks for %s', async (range, body, contentRange) => {
    const ctx = await videoFixture();
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token }, headers: { range } });
    expect(response.statusCode).toBe(206);
    expect(response.body).toBe(body);
    expect(response.headers['content-range']).toBe(contentRange);
    expect(response.headers['content-length']).toBe(String(body.length));
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-type']).toContain('video/mp4');
    expect(response.headers['cache-control']).toBe('private, no-store');
    await ctx.app.close();
  });

  it.each(['bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'items=0-1', 'bytes=1.5-2', 'bytes=9007199254740992-'])('rejects invalid or unsatisfiable video range %s', async (range) => {
    const ctx = await videoFixture();
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token }, headers: { range } });
    expect(response.statusCode).toBe(416);
    expect(response.headers['content-range']).toBe('bytes */10');
    expect(response.body).not.toContain('0123456789');
    await ctx.app.close();
  });

  it('honors only the current strong If-Range validator', async () => {
    const ctx = await videoFixture();
    const cookies = { openscience_session: ctx.token };
    const full = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies });
    expect(full.headers.etag).toBe(`"${ctx.db.presentationAssets[0].contentHash}"`);
    for (const validator of [full.headers.etag as string, '"old"', `W/${full.headers.etag}`, 'Wed, 01 Jan 2025 00:00:00 GMT']) {
      const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies, headers: { range: 'bytes=2-3', 'if-range': validator } });
      const match = validator === full.headers.etag;
      expect(response.statusCode).toBe(match ? 206 : 200);
      expect(response.body).toBe(match ? '23' : '0123456789');
    }
    await ctx.app.close();
  });

  it('authorizes video ranges before storage and verifies the whole digest before slicing', async () => {
    const ctx = await videoFixture();
    const headers = { range: 'bytes=0-1' };
    const cookies = { openscience_session: ctx.token };
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url, headers })).statusCode).toBe(401);
    ctx.db.memberships.length = 0;
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url, cookies, headers })).statusCode).toBe(404);
    expect(ctx.headObject).not.toHaveBeenCalled();
    expect(ctx.getObject).not.toHaveBeenCalled();
    await ctx.app.close();
    const corrupt = await videoFixture();
    corrupt.getObject.mockImplementation(async () => ({ size: 10, contentType: 'video/mp4', body: Readable.from([Buffer.from('012345678X')]) }));
    const response = await corrupt.app.inject({ method: 'GET', url: corrupt.url, cookies: { openscience_session: corrupt.token }, headers });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-range']).toBeUndefined();
    expect(response.headers.etag).toBeUndefined();
    await corrupt.app.close();
  });

  it('keeps existing v1 charts viewable after the renderer upgrade', async () => {
    const ctx = await contentFixture();
    ctx.db.presentationAssets[0].generatorVersion = 'openscience-presentation-v1';
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.headers['content-disposition']).toContain('inline');
    await ctx.app.close();
  });

  it('downloads unsafe or untrusted SVG instead of embedding it', async () => {
    const ctx = await contentFixture(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    const cookies = { openscience_session: ctx.token };
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/octet-stream');
    expect(response.headers['content-disposition']).toContain('attachment');
    await ctx.app.close();
    const untrusted = await contentFixture();
    untrusted.db.presentationAssets[0].generatorVersion = 'unknown';
    const fallback = await untrusted.app.inject({ method: 'GET', url: untrusted.url, cookies: { openscience_session: untrusted.token } });
    expect(fallback.headers['content-disposition']).toContain('attachment');
    await untrusted.app.close();
  });

  it.each(['oversized', 'size-mismatch', 'truncated', 'overflow'])('rejects %s storage content before delivery', async (failure) => {
    const ctx = await contentFixture();
    if (failure === 'oversized') ctx.headObject.mockResolvedValue({ size: 16 * 1024 * 1024 + 1, contentType: 'image/svg+xml', etag: 'test' });
    if (failure === 'size-mismatch') ctx.getObject.mockImplementation(async () => ({ size: ctx.bytes.length + 1, contentType: 'image/svg+xml', body: Readable.from([ctx.bytes]) }));
    if (failure === 'truncated') ctx.getObject.mockImplementation(async () => ({ size: ctx.bytes.length, contentType: 'image/svg+xml', body: Readable.from([ctx.bytes.subarray(0, 5)]) }));
    if (failure === 'overflow') ctx.getObject.mockImplementation(async () => ({ size: ctx.bytes.length, contentType: 'image/svg+xml', body: Readable.from([ctx.bytes, Buffer.from('extra')]) }));
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('<svg');
    expect(response.headers['cache-control']).toBe('private, no-store');
    if (failure === 'oversized') expect(ctx.getObject).not.toHaveBeenCalled();
    await ctx.app.close();
  });

  it('reports unavailable storage without leaking internal object coordinates', async () => {
    const ctx = await contentFixture();
    ctx.headObject.mockRejectedValue(new Error('private/secret-chart.svg unavailable'));
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('secret-chart');
    expect(response.headers['cache-control']).toBe('private, no-store');
    await ctx.app.close();
  });

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

it('accepts charged storyboard settings and preserves the validated DTO on approval', async () => {
    const ctx = await fixture();
    const settings = { locale: 'en', style: 'ink', instruction: 'Explain findings' };
    const response = await ctx.app.inject({ method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`, ...writeAuth(ctx.token, ctx.csrfCookie, ctx.csrfToken, 'storyboard-api'), payload: { kind: 'interactive_html', sourceClaimIds: [CLAIM], storyboard: settings } });
    expect(response.statusCode).toBe(202);
    expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(1);
    const updatedAt = new Date();
    const document = { schemaVersion: 1, title: 'Plan', scenes: Array.from({ length: 3 }, () => ({ title: 'Scene', narration: 'Qualified finding', visualAction: 'Wave', durationSeconds: 8, sourceClaimIds: [CLAIM] })) };
    ctx.db.presentationAssets.push({ id: ASSET, researchObjectId: RO, versionId: VERSION, kind: 'interactive_html', status: 'draft', label: 'presentation_not_evidence', updatedAt, createdAt: updatedAt, provenance: { subtype: 'sourced_storyboard', storyboardDocument: document, storyboardSettings: settings, secret: 'never expose' } });
    ctx.db.presentationAssetClaims.push({ presentationAssetId: ASSET, claimId: CLAIM });
    const approved = await ctx.app.inject({ method: 'PATCH', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/${ASSET}`, ...writeAuth(ctx.token, ctx.csrfCookie, ctx.csrfToken), payload: { status: 'approved', expectedUpdatedAt: updatedAt.toISOString() } });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().asset.storyboard).toEqual({ document, locale: 'en', style: 'ink' });
    expect(approved.json().asset.sourceClaimIds).toEqual([CLAIM]);
    expect(approved.body).not.toContain('secret');
    expect(approved.body).not.toContain('instruction');
    await ctx.app.close();
});
