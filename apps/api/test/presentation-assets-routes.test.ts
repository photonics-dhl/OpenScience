import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import Fastify from 'fastify';
import type { StorageAdapter } from '@openscience/storage';
import { DETERMINISTIC_PRESENTATION_GENERATOR, DETERMINISTIC_PRESENTATION_GENERATOR_VERSION } from '@openscience/domain';
import { createSession } from '@openscience/auth';
import { createFakeMailer, createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { buildApp } from '../src/app';
import { sendPresentationAssetContent } from '../src/routes/presentation-asset-content';
import { httpStatusForError } from '../src/error-map';

// Domain tests cover the Native source, permission and complete frame proof.
// Override only its returned DTO to exercise the real HTTP readiness mask.
const projection = vi.hoisted(() => ({ assets: null as unknown }));
vi.mock('@openscience/domain', async importOriginal => {
  const actual = await importOriginal<typeof import('@openscience/domain')>();
  return { ...actual, listPresentationAssets: async (...args: Parameters<typeof actual.listPresentationAssets>) =>
    projection.assets === null ? actual.listPresentationAssets(...args) : projection.assets };
});

const USER = '10000000-0000-4000-8000-000000000001';
const WORKSPACE = '20000000-0000-4000-8000-000000000001';
const RO = '30000000-0000-4000-8000-000000000001';
const VERSION = '40000000-0000-4000-8000-000000000001';
const CLAIM = '50000000-0000-4000-8000-000000000001';
const ASSET = '60000000-0000-4000-8000-000000000001';
const BRANCH = '70000000-0000-4000-8000-000000000001';
const COMMIT = '80000000-0000-4000-8000-000000000001';

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

async function fixture(platformRole = 'user', storage?: StorageAdapter, sceneImageEnabled = false, videoEnabled = false) {
  const { prisma, db } = createFakePrisma();
  const redis = makeRedis();
  seedUser(db, { id: USER, platformRole });
  db.workspaces.push({ id: WORKSPACE, type: 'personal', ownerId: USER, name: 'Personal', status: 'active', createdAt: new Date(), updatedAt: new Date() });
  db.memberships.push({ id: 'membership', workspaceId: WORKSPACE, userId: USER, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  db.researchObjects.push({ id: RO, workspaceId: WORKSPACE, createdBy: USER, title: 'Research fixture', status: 'draft', visibility: 'private', createdAt: new Date() });
  db.branches.push({ id: BRANCH, researchObjectId: RO, name: 'main', isDefault: true });
  db.commits.push({ id: COMMIT, researchObjectId: RO, branchId: BRANCH, authorId: USER });
  db.versions.push({ id: VERSION, researchObjectId: RO, commitId: COMMIT, status: 'draft', versionNo: 1, publicVersionId: null, researchRecord: null, createdAt: new Date() });
  db.claimNodes.push({
    id: CLAIM, researchObjectId: RO, versionId: VERSION, kind: 'core', statement: 'Transfer completes in 43 fs.',
    assessment: 'supported', conditions: [], limitations: [], provenance: {}, extractionStatus: 'succeeded',
  });
  db.usageLedger.push({ id: 'credit', userId: USER, resource: 'ai_credit', delta: 5, kind: 'grant', createdAt: new Date() });
  const token = await createSession(redis as never, { userId: USER, status: 'email_verified' });
  const app = await buildApp({
    prisma, redis: redis as never, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false,
    security: { csrf: true }, rateLimitEnabled: false, storage, sceneImageEnabled, videoEnabled, readVideoReadiness: async () => videoEnabled,
  });
  const csrf = await app.inject({ method: 'GET', url: '/csrf-token' });
  return {
    app, db, prisma, redis, token, csrfToken: csrf.json().csrfToken as string,
    csrfCookie: csrf.cookies.find((cookie) => cookie.name === '_csrf')!.value,
  };
}

function writeAuth(token: string, csrfCookie: string, csrfToken: string, idempotencyKey?: string) {
  return {
    cookies: { openscience_session: token, _csrf: csrfCookie },
    headers: { 'x-csrf-token': csrfToken, ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
  };
}

describe('HTTP audio eligibility projection', () => {
  for (const videoEnabled of [false, true]) {
    it.each(['native', 'legacy', 'missing'] as const)('preserves %s audio eligibility with global video ' + videoEnabled, async source => {
      const ctx = await fixture('platform_admin', undefined, false, videoEnabled);
      const asset = { id: ASSET, kind: 'interactive_html', canGenerateSceneImage: false, canGenerateVideo: true,
        ...(source === 'missing' ? {} : { canGenerateAudioAudition: source === 'native' }) };
      const original = structuredClone(asset), ledgerBefore = structuredClone(ctx.db.usageLedger);
      projection.assets = [asset];
      try {
        const response = await ctx.app.inject({ method: 'GET', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets`,
          cookies: { openscience_session: ctx.token } });
        expect(response.statusCode, response.body).toBe(200);
        const view = response.json().assets[0];
        expect(view.canGenerateVideo).toBe(videoEnabled);
        if (source === 'missing') expect(view).not.toHaveProperty('canGenerateAudioAudition');
        else expect(view.canGenerateAudioAudition).toBe(source === 'native');
        expect(asset).toEqual(original);
        expect(ctx.db.agentTasks).toHaveLength(0); expect(ctx.db.agentSessions).toHaveLength(0);
        expect(ctx.db.usageLedger).toEqual(ledgerBefore);
      } finally {
        projection.assets = null;
        await ctx.app.close();
      }
    });
  }
});

describe('Presentation asset routes', () => {
  async function taskFixture() {
    const ctx = await fixture();
    const created = await ctx.app.inject({ method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`, ...writeAuth(ctx.token, ctx.csrfCookie, ctx.csrfToken, 'scoped-task-read'), payload: { kind: 'chart', sourceClaimIds: [CLAIM] } });
    expect(created.statusCode).toBe(202);
    const taskId = created.json().task.id as string;
    return { ...ctx, url: `/research-objects/${RO}/versions/${VERSION}/presentation-tasks/${taskId}`, taskId };
  }

  it.each(['pending', 'succeeded'])('reads the exact scoped %s presentation task without exposing its internal payload', async (status) => {
    const ctx = await taskFixture();
    ctx.db.agentTasks[0].status = status;
    ctx.db.workspaces[0].status = 'archived';
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
    expect(response.statusCode).toBe(200);
    expect(response.json().task).toMatchObject({ id: ctx.taskId, status, kind: 'presentation.generate', researchObjectId: RO });
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

  it('rejects unavailable legacy image generation before charge', async () => {
    const { app, token, csrfCookie, csrfToken } = await fixture();
    const response = await app.inject({
      method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`,
      ...writeAuth(token, csrfCookie, csrfToken, 'presentation-image-1'), payload: { kind: 'image', sourceClaimIds: [CLAIM] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });
});

it.each([1, 6])('preserves narrative scene limit %s through submission and exact replay', async (narrativeSceneLimit) => {
  const ctx = await fixture();
  try {
    const storyboard = { output: 'image', locale: 'zh', style: 'auto', instruction: 'Explain the core mechanism', narrative: true, narrativeSceneLimit };
    const request = { method: 'POST' as const, url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`,
      ...writeAuth(ctx.token, ctx.csrfCookie, ctx.csrfToken, `narrative-limit-${narrativeSceneLimit}`),
      payload: { kind: 'interactive_html', sourceClaimIds: [CLAIM], storyboard } };
    const created = await ctx.app.inject(request);
    expect(created.statusCode, created.body).toBe(202);
    const replay = await ctx.app.inject(request);
    expect(replay.statusCode).toBe(202);
    expect(replay.json().task.id).toBe(created.json().task.id);
    expect(ctx.db.agentTasks).toHaveLength(1);
    expect(ctx.db.agentTasks[0].payload).toMatchObject({ researchObjectId: RO, versionId: VERSION, sourceClaimIds: [CLAIM], storyboard });
    expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(1);
  } finally { await ctx.app.close(); }
});

it.each([
  { label: 'zero', narrativeSceneLimit: 0, narrative: true },
  { label: 'above maximum', narrativeSceneLimit: 7, narrative: true },
  { label: 'fractional', narrativeSceneLimit: 1.5, narrative: true },
  { label: 'string', narrativeSceneLimit: '1', narrative: true },
  { label: 'missing narrative', narrativeSceneLimit: 1 },
])('rejects narrative scene limit $label before creating or charging a task', async ({ narrativeSceneLimit, narrative }) => {
  const ctx = await fixture();
  try {
    const response = await ctx.app.inject({ method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`,
      ...writeAuth(ctx.token, ctx.csrfCookie, ctx.csrfToken, 'invalid-narrative-limit'),
      payload: { kind: 'interactive_html', sourceClaimIds: [CLAIM], storyboard: { output: 'image', locale: 'zh', style: 'auto',
        instruction: 'Explain the core mechanism', narrativeSceneLimit, ...(narrative ? { narrative } : {}) } } });
    expect(response.statusCode).toBe(400);
    expect(ctx.db.agentTasks).toHaveLength(0);
    expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(0);
  } finally { await ctx.app.close(); }
});

const auditionVideo = { profile: 'content-driven-v1', storyboardAssetId: ASSET,
  sceneImageAssetIds: ['60000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000004'],
  purpose: 'audio-audition', sceneIndex: 1, audio: { provider: 'synclip', voice: 'selected-voice', speed: 1.25 }, locale: 'en' };

describe('Private audio audition task content', () => {
  async function audioFixture() {
    const bytes = Buffer.from('0123456789');
    const headObject = vi.fn(async () => ({ size: bytes.length, contentType: 'audio/mpeg', etag: 'test' }));
    const getObject = vi.fn(async () => ({ size: bytes.length, contentType: 'audio/mpeg', body: Readable.from([bytes]) }));
    const ctx = await fixture('user', { headObject, getObject } as unknown as StorageAdapter);
    const created = await ctx.app.inject({ method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`,
      ...writeAuth(ctx.token, ctx.csrfCookie, ctx.csrfToken, 'audio-content-fixture'), payload: { kind: 'chart', sourceClaimIds: [CLAIM] } });
    expect(created.statusCode).toBe(202);
    const taskId = created.json().task.id as string; const task = ctx.db.agentTasks[0];
    const inputHash = 'a'.repeat(64);
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const objectKey = `presentation/${RO}/${VERSION}/audio-audition/${taskId}/${inputHash}.mp3`;
    task.payload = { ...task.payload, kind: 'video', video: structuredClone(auditionVideo) };
    task.status = 'succeeded'; task.executionAttempt = 2;
    task.result = { purpose: 'audio-audition', audioAudition: { taskId, executionAttempt: 1, inputHash,
      sceneIndex: 1, voice: 'selected-voice', speed: 1.25, locale: 'en', audioTaskId: 'provider-audio-1',
      objectKey, contentHash, size: bytes.length, contentType: 'audio/mpeg', durationSeconds: 2.5, timingStatus: 'decoded' } };
    return { ...ctx, bytes, headObject, getObject, task, objectKey,
      url: `/research-objects/${RO}/versions/${VERSION}/presentation-tasks/${taskId}/audio` };
  }

  it.each(['decoded', 'requires_revision'])('serves verified private MP3 for an owner with timingStatus=%s and original grant attempt', async timingStatus => {
    const ctx = await audioFixture(); ctx.task.result.audioAudition.timingStatus = timingStatus;
    ctx.task.result.audioAudition.quote = { coins: 0.25 };
    ctx.task.result.audioAudition.providerURL = 'https://example.com/private-provider.mp3';
    ctx.task.result.audioAudition.filePath = '/private/provider-audio.mp3';
    ctx.task.result.audioAuditionGrant = { maxEstimatedCoins: 0.5, inputHash: 'a'.repeat(64) };
    const polling = await ctx.app.inject({ method: 'GET', url: ctx.url.replace(/\/audio$/u, ''), cookies: { openscience_session: ctx.token } });
    expect(polling.statusCode).toBe(200);
    expect(polling.json().task.result).toEqual({ purpose: 'audio-audition', audioAudition: {
      taskId: ctx.task.id, sceneIndex: 1, contentType: 'audio/mpeg', durationSeconds: 2.5, timingStatus,
    } });
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
    expect(response.statusCode).toBe(200); expect(response.rawPayload).toEqual(ctx.bytes);
    expect(response.headers['content-type']).toContain('audio/mpeg'); expect(response.headers['content-disposition']).toContain('inline');
    expect(response.headers['content-disposition']).toMatch(/filename="[^"]+\.mp3"/u);
    expect(response.headers['cache-control']).toBe('private, no-store'); expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-content-type-options']).toBe('nosniff'); expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-security-policy']).toContain("sandbox; default-src 'none'");
    expect(JSON.stringify(response.headers)).not.toContain(ctx.objectKey);
    expect(ctx.headObject).toHaveBeenCalledWith(ctx.objectKey); expect(ctx.getObject).toHaveBeenCalledWith(ctx.objectKey);
    expect(ctx.db.presentationAssets).toHaveLength(0); await ctx.app.close();
  });

  it.each(['content-hash-filename', 'mutated-input-hash'])('rejects a key inconsistent with the original audition input: %s', async failure => {
    const ctx = await audioFixture(); const audio = ctx.task.result.audioAudition;
    if (failure === 'content-hash-filename') {
      audio.objectKey = `presentation/${RO}/${VERSION}/audio-audition/${ctx.task.id}/${audio.contentHash}.mp3`;
    } else {
      audio.inputHash = 'b'.repeat(64);
    }
    try {
      const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token }, headers: { range: 'bytes=0-1' } });
      expect(response.statusCode).toBe(404); expect(response.headers['content-range']).toBeUndefined();
      expect(ctx.headObject).not.toHaveBeenCalled(); expect(ctx.getObject).not.toHaveBeenCalled();
    } finally { await ctx.app.close(); }
  });

  it.each(['nonowner', 'cross-ro', 'cross-version', 'task-deleted', 'session-deleted', 'ro-deleted', 'membership', 'invalid-id'])(
    'denies %s before touching stored audio', async failure => {
      const ctx = await audioFixture(); let url = ctx.url;
      if (failure === 'nonowner') {
        const otherUser = '10000000-0000-4000-8000-000000000002'; seedUser(ctx.db, { id: otherUser });
        ctx.db.memberships.push({ id: 'other-member', workspaceId: WORKSPACE, userId: otherUser, role: 'owner' });
        const token = await createSession(ctx.redis as never, { userId: otherUser, status: 'email_verified' });
        const response = await ctx.app.inject({ method: 'GET', url, cookies: { openscience_session: token } });
        expect(response.statusCode).toBe(404);
      } else {
        if (failure === 'cross-ro') url = url.replace(RO, '30000000-0000-4000-8000-000000000099');
        if (failure === 'cross-version') {
          const otherVersion = '40000000-0000-4000-8000-000000000099';
          ctx.db.versions.push({ id: otherVersion, researchObjectId: RO, status: 'draft' }); url = url.replace(VERSION, otherVersion);
        }
        if (failure === 'task-deleted') ctx.task.deletedAt = new Date();
        if (failure === 'session-deleted') ctx.db.agentSessions[0].deletedAt = new Date();
        if (failure === 'ro-deleted') ctx.db.researchObjects[0].deletedAt = new Date();
        if (failure === 'membership') ctx.db.memberships.length = 0;
        if (failure === 'invalid-id') url = url.replace(ctx.task.id, 'invalid');
        const response = await ctx.app.inject({ method: 'GET', url, cookies: { openscience_session: ctx.token } });
        expect(response.statusCode).toBe(failure === 'invalid-id' ? 400 : 404);
        expect(response.body).not.toContain(ctx.objectKey);
      }
      expect(ctx.headObject).not.toHaveBeenCalled(); expect(ctx.getObject).not.toHaveBeenCalled(); await ctx.app.close();
    });

  it('requires a real active session and never accepts a caller-provided storage key or URL', async () => {
    const ctx = await audioFixture();
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: 'invalid-session' } })).statusCode).toBe(401);
    expect(ctx.headObject).not.toHaveBeenCalled();
    const response = await ctx.app.inject({ method: 'GET', url: `${ctx.url}?objectKey=other%2Fsecret.mp3&url=https%3A%2F%2Fexample.com%2Fsecret.mp3`,
      cookies: { openscience_session: ctx.token } });
    expect(response.statusCode).toBe(200); expect(response.rawPayload).toEqual(ctx.bytes);
    expect(ctx.headObject).toHaveBeenCalledTimes(1); expect(ctx.headObject).toHaveBeenCalledWith(ctx.objectKey);
    expect(ctx.getObject).toHaveBeenCalledTimes(1); expect(ctx.getObject).toHaveBeenCalledWith(ctx.objectKey);
    await ctx.app.close();
  });

  it.each(['pending', 'running', 'failed', 'unknown'])('never plays audio from a %s task even with retained decoded metadata', async status => {
    const ctx = await audioFixture(); ctx.task.status = status;
    try {
      const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
      expect(response.statusCode).toBe(404); expect(ctx.headObject).not.toHaveBeenCalled(); expect(ctx.getObject).not.toHaveBeenCalled();
    } finally { await ctx.app.close(); }
  });

  it.each(['owner', 'deleted', 'status'])('rechecks current task scope at the raw result read after a concurrent %s change', async change => {
    const ctx = await audioFixture(); const lookup = ctx.prisma.agentTask.findUnique.bind(ctx.prisma.agentTask);
    const reads = vi.spyOn(ctx.prisma.agentTask, 'findUnique').mockImplementation(async args => {
      if (args.include?.session && typeof args.include.session === 'object' && args.include.session.include?.researchObject === true) {
        if (change === 'owner') ctx.db.agentSessions[0].userId = '10000000-0000-4000-8000-000000000002';
        if (change === 'deleted') ctx.task.deletedAt = new Date();
        if (change === 'status') ctx.task.status = 'failed';
      }
      return lookup(args);
    });
    try {
      const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
      expect(response.statusCode).toBe(404); expect(ctx.headObject).not.toHaveBeenCalled(); expect(ctx.getObject).not.toHaveBeenCalled();
    } finally { reads.mockRestore(); await ctx.app.close(); }
  });

  it.each(['result-purpose', 'missing-audio', 'task-id', 'attempt', 'input-hash', 'scene-index', 'voice', 'speed', 'locale',
    'provider-task-id', 'key', 'hash', 'size-zero', 'size-over-limit', 'size-fractional', 'content-type', 'duration', 'timing-status',
    'payload-purpose', 'payload-scene', 'payload-voice', 'payload-speed', 'payload-locale', 'payload-kind', 'payload-ro', 'payload-version'])(
    'rejects invalid or mismatched server audio metadata: %s', async failure => {
      const ctx = await audioFixture(); const audio = ctx.task.result.audioAudition; const video = ctx.task.payload.video;
      if (failure === 'result-purpose') ctx.task.result.purpose = 'video';
      if (failure === 'missing-audio') delete ctx.task.result.audioAudition;
      if (failure === 'task-id') audio.taskId = ASSET;
      if (failure === 'attempt') audio.executionAttempt = -1;
      if (failure === 'input-hash') audio.inputHash = 'invalid';
      if (failure === 'scene-index') audio.sceneIndex = '1';
      if (failure === 'voice') audio.voice = 'bad voice';
      if (failure === 'speed') audio.speed = 0;
      if (failure === 'locale') audio.locale = 'fr';
      if (failure === 'provider-task-id') audio.audioTaskId = '../other';
      if (failure === 'key') audio.objectKey = 'other/secret.mp3';
      if (failure === 'hash') audio.contentHash = 'invalid';
      if (failure === 'size-zero') audio.size = 0;
      if (failure === 'size-over-limit') audio.size = 16 * 1024 * 1024 + 1;
      if (failure === 'size-fractional') audio.size = 1.5;
      if (failure === 'content-type') audio.contentType = 'audio/wav';
      if (failure === 'duration') audio.durationSeconds = Infinity;
      if (failure === 'timing-status') audio.timingStatus = 'estimated';
      if (failure === 'payload-purpose') delete video.purpose;
      if (failure === 'payload-scene') video.sceneIndex = 2;
      if (failure === 'payload-voice') video.audio.voice = 'other-voice';
      if (failure === 'payload-speed') video.audio.speed = 1;
      if (failure === 'payload-locale') video.locale = 'zh';
      if (failure === 'payload-kind') ctx.task.payload.kind = 'chart';
      if (failure === 'payload-ro') ctx.task.payload.researchObjectId = ASSET;
      if (failure === 'payload-version') ctx.task.payload.versionId = ASSET;
      const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token }, headers: { range: 'bytes=0-1' } });
      expect(response.statusCode).toBe(404); expect(response.body).not.toContain('secret.mp3');
      expect(ctx.headObject).not.toHaveBeenCalled(); expect(ctx.getObject).not.toHaveBeenCalled(); await ctx.app.close();
    });

  it.each(['head-mime', 'object-mime', 'head-size', 'object-size', 'truncated', 'overflow', 'digest'])(
    'verifies complete stored audio before serving a range: %s', async failure => {
      const ctx = await audioFixture();
      if (failure === 'head-mime') ctx.headObject.mockResolvedValue({ size: 10, contentType: 'video/mp4', etag: 'test' });
      if (failure === 'object-mime') ctx.getObject.mockImplementation(async () => ({ size: 10, contentType: 'text/html', body: Readable.from([ctx.bytes]) }));
      if (failure === 'head-size') ctx.headObject.mockResolvedValue({ size: 11, contentType: 'audio/mpeg', etag: 'test' });
      if (failure === 'object-size') ctx.getObject.mockImplementation(async () => ({ size: 11, contentType: 'audio/mpeg', body: Readable.from([ctx.bytes]) }));
      if (failure === 'truncated') ctx.getObject.mockImplementation(async () => ({ size: 10, contentType: 'audio/mpeg', body: Readable.from([ctx.bytes.subarray(0, 5)]) }));
      if (failure === 'overflow') ctx.getObject.mockImplementation(async () => ({ size: 10, contentType: 'audio/mpeg', body: Readable.from([ctx.bytes, Buffer.from('extra')]) }));
      if (failure === 'digest') ctx.getObject.mockImplementation(async () => ({ size: 10, contentType: 'audio/mpeg', body: Readable.from([Buffer.from('012345678X')]) }));
      const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token }, headers: { range: 'bytes=0-1' } });
      expect(response.statusCode).toBe(404); expect(response.headers['content-range']).toBeUndefined(); expect(response.headers.etag).toBeUndefined();
      expect(response.headers['cache-control']).toBe('private, no-store'); expect(response.body).not.toContain(ctx.objectKey); await ctx.app.close();
    });

  it.each([['bytes=2-5', '2345', 'bytes 2-5/10'], ['bytes=7-', '789', 'bytes 7-9/10'], ['bytes=-3', '789', 'bytes 7-9/10']])(
    'serves the authenticated audio range %s', async (range, body, contentRange) => {
      const ctx = await audioFixture();
      const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token }, headers: { range } });
      expect(response.statusCode).toBe(206); expect(response.body).toBe(body); expect(response.headers['content-range']).toBe(contentRange);
      expect(response.headers['content-length']).toBe(String(body.length)); expect(response.headers['content-type']).toContain('audio/mpeg'); await ctx.app.close();
    });

  it.each(['bytes=10-', 'bytes=5-2', 'bytes=0-1,4-5', 'items=0-1'])('rejects the audio range %s after integrity verification', async range => {
    const ctx = await audioFixture();
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token }, headers: { range } });
    expect(response.statusCode).toBe(416); expect(response.headers['content-range']).toBe('bytes */10'); expect(response.rawPayload.length).toBe(0); await ctx.app.close();
  });

  it('applies the current strong If-Range validator to private audio', async () => {
    const ctx = await audioFixture(); const cookies = { openscience_session: ctx.token };
    const full = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies });
    expect(full.headers.etag).toBe(`"${ctx.task.result.audioAudition.contentHash}"`);
    for (const validator of [full.headers.etag as string, '"old"', `W/${full.headers.etag}`]) {
      const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies, headers: { range: 'bytes=2-3', 'if-range': validator } });
      expect(response.statusCode).toBe(validator === full.headers.etag ? 206 : 200);
      expect(response.body).toBe(validator === full.headers.etag ? '23' : '0123456789');
    }
    await ctx.app.close();
  });

  it('reports unavailable storage privately without returning its key', async () => {
    const ctx = await audioFixture(); ctx.headObject.mockRejectedValue(new Error(`${ctx.objectKey} unavailable`));
    const response = await ctx.app.inject({ method: 'GET', url: ctx.url, cookies: { openscience_session: ctx.token } });
    expect(response.statusCode).toBe(503); expect(response.body).not.toContain(ctx.objectKey);
    expect(response.headers['cache-control']).toBe('private, no-store'); await ctx.app.close();
  });

  it('refuses public audio content in the shared helper before touching storage', async () => {
    const ctx = await audioFixture(); const app = Fastify();
    app.setErrorHandler((error, request, reply) => { const mapped = httpStatusForError(error, String(request.id)); return reply.status(mapped.status).send(mapped.body); });
    app.get('/public-audio', (_req, reply) => sendPresentationAssetContent({ headObject: ctx.headObject, getObject: ctx.getObject } as unknown as StorageAdapter,
      { id: ctx.task.id, kind: 'audio', generator: 'synclip', generatorVersion: 'audio-audition-v1', ...ctx.task.result.audioAudition }, reply, 'public'));
    const response = await app.inject({ method: 'GET', url: '/public-audio' });
    expect(response.statusCode).toBe(404); expect(ctx.headObject).not.toHaveBeenCalled(); expect(ctx.getObject).not.toHaveBeenCalled();
    await app.close(); await ctx.app.close();
  });
});

describe('Audio audition public generation input', () => {
  it('keeps the existing strict video request accepted by the Domain permission check', async () => {
    const ctx = await fixture();
    const response = await ctx.app.inject({ method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`,
      ...writeAuth(ctx.token, ctx.csrfCookie, ctx.csrfToken, 'legacy-video-input'), payload: { kind: 'video', sourceClaimIds: [CLAIM],
        video: { profile: 'content-driven-v1', storyboardAssetId: ASSET, sceneImageAssetIds: auditionVideo.sceneImageAssetIds } } });
    expect(response.statusCode).toBe(403); expect(response.json().error.code).toBe('ADMIN_REQUIRED');
    expect(ctx.db.agentTasks).toHaveLength(0); await ctx.app.close();
  });

  it.each(['zh', 'en'])('passes the strict %s audition request to the real Domain permission check', async locale => {
    const ctx = await fixture();
    const response = await ctx.app.inject({ method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`,
      ...writeAuth(ctx.token, ctx.csrfCookie, ctx.csrfToken, `audition-input-${locale}`),
      payload: { kind: 'video', sourceClaimIds: [CLAIM], video: { ...auditionVideo, locale } } });
    expect(response.statusCode).toBe(403); expect(response.json().error.code).toBe('ADMIN_REQUIRED');
    expect(ctx.db.agentTasks).toHaveLength(0); expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(0); await ctx.app.close();
  });

  it.each(['text', 'budget', 'grant', 'objectKey', 'audio-text', 'audio-budget', 'audio-grant', 'locale', 'scene-index', 'voice', 'speed', 'provider', 'missing-purpose', 'legacy-extra'])(
    'rejects client-controlled or malformed audition fields: %s', async failure => {
      const ctx = await fixture(); const video: Record<string, unknown> = structuredClone(auditionVideo);
      const audio = video.audio as Record<string, unknown>;
      if (failure === 'text') video.text = 'Caller narration';
      if (failure === 'budget') video.maxEstimatedCoins = 100;
      if (failure === 'grant') video.audioAuditionGrant = { maxEstimatedCoins: 100 };
      if (failure === 'objectKey') video.objectKey = 'other/private.mp3';
      if (failure === 'audio-text') audio.text = 'Caller narration';
      if (failure === 'audio-budget') audio.maxEstimatedCoins = 100;
      if (failure === 'audio-grant') audio.audioAuditionGrant = { maxEstimatedCoins: 100 };
      if (failure === 'locale') video.locale = 'fr';
      if (failure === 'scene-index') video.sceneIndex = 3;
      if (failure === 'voice') audio.voice = 'bad voice';
      if (failure === 'speed') audio.speed = '1';
      if (failure === 'provider') audio.provider = 'other';
      if (failure === 'missing-purpose') delete video.purpose;
      if (failure === 'legacy-extra') { delete video.purpose; delete video.sceneIndex; delete video.audio; delete video.locale; video.text = 'Caller narration'; }
      const response = await ctx.app.inject({ method: 'POST', url: `/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`,
        ...writeAuth(ctx.token, ctx.csrfCookie, ctx.csrfToken, `audition-invalid-${failure}`), payload: { kind: 'video', sourceClaimIds: [CLAIM], video } });
      expect(response.statusCode).toBe(400); expect(ctx.db.agentTasks).toHaveLength(0); expect(ctx.db.usageLedger.filter(row => row.delta < 0)).toHaveLength(0); await ctx.app.close();
    });
});

it('accepts charged storyboard settings and preserves the validated DTO on approval', async () => {
    const ctx = await fixture('user', undefined, false, true);
    Object.assign(ctx.prisma.hermesResearchRun, { findFirst: vi.fn(async () => {
      expect(ctx.db.hermesResearchRuns).toHaveLength(0);
      return null;
    }) });
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
    expect(approved.json().asset.storyboard).toEqual({ document, output: 'video', locale: 'en', style: 'ink' });
    expect(approved.json().asset.sourceClaimIds).toEqual([CLAIM]);
    expect(approved.body).not.toContain('secret');
    expect(approved.body).not.toContain('instruction');
    await ctx.app.close();
});


it.each([false,true])('gates scene capability and charges one exact replay only when enabled=%s', async enabled => {
  const ctx=await fixture('platform_admin',undefined,enabled,true);
  const settings={locale:'en',style:'ink',instruction:'Explain'};
  const document={schemaVersion:1,title:'Plan',scenes:Array.from({length:3},()=>({title:'Scene',narration:'Finding',visualAction:'Wave',durationSeconds:8,sourceClaimIds:[CLAIM]}))};
  ctx.db.presentationAssets.push({id:ASSET,researchObjectId:RO,versionId:VERSION,kind:'interactive_html',status:'approved',label:'presentation_not_evidence',provenance:{subtype:'sourced_storyboard',storyboardDocument:document,storyboardSettings:settings,sourceEvidenceIdentity:createHash('sha256').update('reviewed fixture source').digest('hex')}});
  ctx.db.presentationAssetClaims.push({presentationAssetId:ASSET,claimId:CLAIM});
  const response=await ctx.app.inject({method:'GET',url:`/research-objects/${RO}/versions/${VERSION}/presentation-assets`,cookies:{openscience_session:ctx.token}});
  expect(response.json().assets[0].canGenerateSceneImage).toBe(enabled);
  const request={method:'POST' as const,url:`/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`,...writeAuth(ctx.token,ctx.csrfCookie,ctx.csrfToken,'scene-api'),payload:{kind:'image',sourceClaimIds:[CLAIM],sceneImage:{storyboardAssetId:ASSET,sceneIndex:0}}};
  const first=await ctx.app.inject(request);
  expect(first.statusCode, first.body).toBe(enabled?202:400);
  if(enabled){const replay=await ctx.app.inject(request);expect(replay.json().task.id).toBe(first.json().task.id);expect(ctx.db.agentTasks[0].payload.sceneImage).toEqual(request.payload.sceneImage);}
  expect(ctx.db.usageLedger.filter(row=>row.delta<0)).toHaveLength(enabled?1:0);
  await ctx.app.close();
});

it.each([false,true])('does not charge unavailable legacy media with scene feature flag %s',async enabled=>{
  const ctx=await fixture('platform_admin',undefined,enabled);
  for(const kind of ['image','video']) {
    const response=await ctx.app.inject({method:'POST',url:`/research-objects/${RO}/versions/${VERSION}/presentation-assets/generations`,...writeAuth(ctx.token,ctx.csrfCookie,ctx.csrfToken,`unsupported-${kind}`),payload:{kind,sourceClaimIds:[CLAIM]}});
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  }
  expect(ctx.db.agentTasks).toHaveLength(0);
  expect(ctx.db.usageLedger.filter(row=>row.delta<0)).toHaveLength(0);
  await ctx.app.close();
});
