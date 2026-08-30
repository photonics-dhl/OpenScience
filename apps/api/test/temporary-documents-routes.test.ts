import { Readable } from 'node:stream';
import { createSession } from '@openscience/auth';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused authenticated route fake */

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const HASH = 'a'.repeat(64);
const BYTES = Buffer.from('%PDF-download');

async function fixture(options: { institutional?: boolean } = {}) {
  const accesses = new Map<string, any>();
  const auditEvents: any[] = [];
  const document = {
    id: DOCUMENT_ID,
    workspaceId: WORKSPACE_ID,
    state: 'active',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    objectKey: `hermes-cache/${WORKSPACE_ID}/${DOCUMENT_ID}/${HASH}`,
    contentHash: HASH,
    mimeType: 'application/pdf',
    sizeBytes: BigInt(BYTES.byteLength),
    externalSourceId: '55555555-5555-4555-8555-555555555555',
    rightsDecision: {
      id: '66666666-6666-4666-8666-666666666666',
      cacheAllowed: true,
      basis: options.institutional ? 'institutional_access' : 'open_access',
      downloadPolicy: options.institutional ? 'authorized_user_only' : 'downloadable',
      subjectUserId: options.institutional ? USER_ID : null,
      validUntil: options.institutional ? new Date('2099-01-01T00:00:00.000Z') : null,
      contentHash: HASH,
    },
  };
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => where.id === USER_ID ? { id: USER_ID, status: 'email_verified' } : null },
    membership: { findUnique: async () => ({ workspaceId: WORKSPACE_ID, userId: USER_ID }) },
    sourceRightsDecision: { findFirst: async () => document.rightsDecision },
    temporaryDocument: { findUnique: async ({ where }: any) => where.id === DOCUMENT_ID ? document : null },
    temporaryDocumentAccess: {
      create: async ({ data }: any) => { accesses.set(data.id, { ...data, consumedAt: null, revokedAt: null }); return data; },
      findUnique: async ({ where }: any) => accesses.get(where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        const row = accesses.get(where.id);
        if (!row || row.consumedAt || row.revokedAt) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  const sessions = new Map<string, string>();
  const redis: any = {
    set: async (key: string, value: string) => void sessions.set(key, value),
    get: async (key: string) => sessions.get(key) ?? null,
    expire: async () => 1,
    del: async (key: string) => void sessions.delete(key),
  };
  const session = await createSession(redis, { userId: USER_ID, status: 'email_verified' });
  const storage: any = {
    headObject: async () => ({ size: BYTES.byteLength, sha256: HASH, etag: 'etag', contentType: 'application/pdf' }),
    getObject: async () => ({ body: Readable.from(BYTES), size: BYTES.byteLength, contentType: 'application/pdf' }),
    putObject: async () => ({ key: '', size: 0, etag: '' }),
    deleteObject: async () => undefined,
  };
  const app = await buildApp({
    prisma,
    redis,
    storage,
    mailer: { send: async () => undefined },
    secureCookies: false,
    cookieSecret: 'temporary-document-route-test-secret',
    downloadSigningSecret: 'temporary-document-download-signing-test-secret',
    downloadSigningKeyId: 'download-v1',
    audit: { record: async (event: any) => { auditEvents.push(event); } },
  });
  return { app, session, document, auditEvents };
}

describe('temporary document download routes', () => {
  it('returns a clean user-bound link and consumes it once', async () => {
    const { app, session, auditEvents } = await fixture();
    const issued = await app.inject({
      method: 'POST', url: `/temporary-documents/${DOCUMENT_ID}/download-link`,
      cookies: { openscience_session: session },
    });
    expect(issued.statusCode).toBe(200);
    const body = issued.json();
    expect(body.downloadUrl).toMatch(/^\/api\/temporary-documents\//);
    expect(body.downloadUrl).not.toContain('token');
    const capabilityCookie = issued.cookies.find((cookie) => cookie.name.startsWith('openscience_temp_download_'));
    expect(capabilityCookie?.httpOnly).toBe(true);
    const cookies = {
      openscience_session: session,
      [capabilityCookie!.name]: capabilityCookie!.value,
    };
    const internalUrl = body.downloadUrl.replace(/^\/api/, '');
    const download = await app.inject({ method: 'GET', url: internalUrl, cookies });
    expect(download.statusCode).toBe(200);
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(download.headers['referrer-policy']).toBe('no-referrer');
    expect(download.rawPayload.equals(BYTES)).toBe(true);
    const replay = await app.inject({ method: 'GET', url: internalUrl, cookies });
    expect(replay.statusCode).toBe(404);
    expect(auditEvents.map((event) => event.action)).toEqual([
      'temporary_document.download_link.issue',
      'temporary_document.download.consume',
    ]);
    await app.close();
  });

  it('rejects an inconsistent institutional decision even if it says downloadable', async () => {
    const { app, session, document } = await fixture({ institutional: true });
    document.rightsDecision.downloadPolicy = 'downloadable';
    const response = await app.inject({
      method: 'POST', url: `/temporary-documents/${DOCUMENT_ID}/download-link`,
      cookies: { openscience_session: session },
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('rejects Range requests before object access', async () => {
    const { app, session } = await fixture();
    const response = await app.inject({
      method: 'GET', url: `/temporary-documents/${DOCUMENT_ID}/download/44444444-4444-4444-8444-444444444444`,
      headers: { range: 'bytes=0-10' }, cookies: { openscience_session: session },
    });
    expect(response.statusCode).toBe(416);
    await app.close();
  });
});
