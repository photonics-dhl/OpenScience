import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { Readable } from 'node:stream';
import { createSession, hashPassword } from '@openscience/auth';
import { createFakeMailer, createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { registerArtifactRoutes } from '../src/routes/artifacts';
import { registerResearchObjectRoutes } from '../src/routes/research-objects';
import { httpStatusForError } from '../src/error-map';
import { registerAuthRoutes } from '../src/routes/auth';
import { registerSecurity } from '../src/security/security';

const RO = '10000000-0000-4000-8000-000000000001';
const ARTIFACT = '20000000-0000-4000-8000-000000000001';

async function makeApp(loginSecurity = false) {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  db.workspaces.push({ id: 'ws-1', ownerId: user.id, status: 'active', type: 'team' });
  db.memberships.push({ workspaceId: 'ws-1', userId: user.id, role: 'owner' });
  db.researchObjects.push({ id: RO, workspaceId: 'ws-1', createdBy: user.id, title: 'Original', version: 1, status: 'draft', visibility: 'private' });
  const store = new Map<string, string>();
  const redis = {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => { store.set(key, value); return 'OK'; },
    expire: async () => 1,
  } as never;
  const token = await createSession(redis, { userId: user.id, status: 'email_verified' });
  const storage = {
    getObject: vi.fn(async () => ({ body: Readable.from(Buffer.from('pdf')), size: 3 })),
    putObject: vi.fn(), headObject: vi.fn(), deleteObject: vi.fn(),
  };
  const deps = { prisma, redis, mailer: createFakeMailer(), storage };
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(cookie);
  app.setErrorHandler((error, request, reply) => {
    const mapped = httpStatusForError(error, String(request.id));
    void reply.status(mapped.status).send(mapped.body);
  });
  if (loginSecurity) {
    await registerSecurity(app, { csrf: true, cors: false, helmet: false, secureCookies: false, allowedOrigins: [] });
    await app.register(async (scope) => registerAuthRoutes(scope, { ...deps, secureCookies: false }), { prefix: '/auth' });
  }
  registerArtifactRoutes(app, deps);
  registerResearchObjectRoutes(app, deps);
  return { app, db, user, storage, cookies: { openscience_session: token } };
}

describe('vendor security route contracts', () => {
  it('real login sets a session behind the trusted proxy and permits a headerless CLI', async () => {
    const { app, user } = await makeApp(true);
    user.passwordHash = await hashPassword('local-test-password-1');
    try {
      for (const headers of [
        { host: 'app.example.com', 'x-forwarded-proto': 'https', origin: 'https://app.example.com', referer: 'https://app.example.com/auth/login' },
        {},
      ]) {
        const response = await app.inject({ method: 'POST', url: '/auth/login', headers, payload: { email: user.email, password: 'local-test-password-1' } });
        expect(response.statusCode).toBe(200);
        expect(response.cookies.some((item) => item.name === 'openscience_session' && item.httpOnly)).toBe(true);
      }
      const denied = await app.inject({ method: 'POST', url: '/auth/login', headers: { origin: 'https://evil.example' }, payload: { email: user.email, password: 'local-test-password-1' } });
      expect(denied.statusCode).toBe(403);
      expect(denied.cookies).toHaveLength(0);
    } finally { await app.close(); }
  });

  it.each([{ status: 'published' }, { status: 'archived' }, { visibility: 'public' }])('PATCH rejects lifecycle fields %j', async (patch) => {
    const { app, db, cookies } = await makeApp();
    try {
      const response = await app.inject({ method: 'PATCH', url: `/research-objects/${RO}`, cookies, payload: { version: 1, title: 'Changed', ...patch } });
      expect(response.statusCode).toBe(400);
      expect(db.researchObjects[0]).toMatchObject({ title: 'Original', status: 'draft', visibility: 'private', version: 1 });
    } finally { await app.close(); }
  });

  it.each(['viewer', 'reviewer', 'contributor', 'author'])('%s receives 403 for visibility and grants through HTTP', async (role) => {
    const { app, db, cookies } = await makeApp();
    db.memberships[0].role = role;
    try {
      const visibility = await app.inject({ method: 'POST', url: `/research-objects/${RO}/visibility`, cookies, payload: { toVisibility: 'public' } });
      const grant = await app.inject({ method: 'POST', url: `/research-objects/${RO}/visibility-grants`, cookies, payload: { granteeId: RO } });
      expect(visibility.statusCode).toBe(403);
      expect(grant.statusCode).toBe(403);
      expect(db.visibilityRequests).toHaveLength(0);
      expect(db.visibilityGrants).toHaveLength(0);
    } finally { await app.close(); }
  });

  it.each([
    { logicalPath: '资料/实验结果.pdf', filename: '实验结果.pdf' },
    { logicalPath: 'docs/evil";x=y\r\nX-Injected: yes.pdf', filename: 'evil";x=yX-Injected: yes.pdf' },
    { logicalPath: 'docs/emoji-🔬.pdf', filename: 'emoji-🔬.pdf' },
  ])('streams private filenames safely: %j', async ({ logicalPath, filename }) => {
    const { app, db, cookies } = await makeApp();
    db.artifacts.push({ id: ARTIFACT, workspaceId: 'ws-1', logicalPath, mimeType: 'application/pdf', blobSha256: 'a'.repeat(64), size: 3 });
    try {
      const response = await app.inject({ method: 'GET', url: `/artifacts/${ARTIFACT}/download`, cookies });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('pdf');
      const disposition = String(response.headers['content-disposition']);
      expect(disposition).toMatch(/^attachment; filename="[\x20-\x21\x23-\x5b\x5d-\x7e]+"; filename\*=UTF-8''/);
      expect(disposition).not.toMatch(/\p{Cc}/u);
      const encodedName = disposition.split("filename*=UTF-8''")[1];
      expect(decodeURIComponent(encodedName)).toBe(filename);
      expect(response.headers['x-injected']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('private, no-store');
    } finally { await app.close(); }
  });

  it('keeps private downloads behind authentication and membership', async () => {
    const { app, db, cookies, storage } = await makeApp();
    db.artifacts.push({ id: ARTIFACT, workspaceId: 'ws-1', logicalPath: 'private.pdf', blobSha256: 'a'.repeat(64), size: 3 });
    try {
      expect((await app.inject({ method: 'GET', url: `/artifacts/${ARTIFACT}/download` })).statusCode).toBe(401);
      db.memberships.length = 0;
      expect((await app.inject({ method: 'GET', url: `/artifacts/${ARTIFACT}/download`, cookies })).statusCode).toBe(404);
      expect(storage.getObject).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
