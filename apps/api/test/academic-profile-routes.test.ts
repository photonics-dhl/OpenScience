import { describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { Prisma } from '@prisma/client';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { academicProfileSchema, registerAcademicProfileRoutes } from '../src/routes/academic-profile';
import { ZodError } from 'zod';

/* eslint-disable @typescript-eslint/no-explicit-any -- narrow in-memory API producer */
const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const roId = '44444444-4444-4444-8444-444444444444';
const draft = (name = 'Author') => ({ avatar: '', name, englishName: '', title: '', institution: '', lab: '', bio: '', contactEmail: '', orcid: '', scholar: '', works: [], interests: [], materials: [], cv: '', labUrl: '', education: [] });

async function fixture() {
  const rows = new Map<string, any>();
  const user = { id: userId, email: 'private@login.test', displayName: 'Account', status: 'email_verified', level: 'free' };
  const credentials = new Map<string, any>();
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => where.id === userId ? user : where.id === otherId ? { ...user, id: otherId, displayName: 'Other account' } : null },
    academicProfile: {
      findUnique: async ({ where }: any) => { const row = rows.get(where.userId); if (!row) return null; return where.select ? { published: row.published } : { ...row }; },
      create: async ({ data }: any) => { if (rows.has(data.userId)) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' }); const row = { ...data, published: null, version: 1 }; rows.set(data.userId,row); return row; },
      updateMany: async ({ where, data }: any) => { const row = rows.get(where.userId); if (!row || row.version !== where.version) return { count: 0 }; if ('draft' in data) row.draft = data.draft; if ('published' in data) row.published = data.published === Prisma.DbNull ? null : data.published; row.version++; return { count: 1 }; },
    },
    publication: { findMany: async () => [{ publicVersionId: 'OSR-2026-000001-v1', publishedAt: new Date('2026-10-01'), versionId, version: { researchObjectId: roId, researchRecord: { publicationMetadata: { schemaVersion: 1, title: 'Frozen public title' } }, researchObject: { publicId: 'OSR-2026-000001' } } }] },
    journalArticle: { findUnique: async () => null },
    identityCredential: { findFirst: async ({ where }: any) => { const row = credentials.get(where.userId); return row && row.type === where.type && row.status === where.status && row.source === where.source && row.revokedAt === where.revokedAt ? { externalId: row.externalId } : null; } },
  };
  const store = new Map<string,string>();
  const redis: any = { set: async (k:string,v:string) => { store.set(k,v); }, get: async (k:string) => store.get(k) ?? null, expire: async () => 1, del: async (k:string) => { store.delete(k); } };
  const token = await createSession(redis, { userId, status: user.status });
  const otherToken = await createSession(redis, { userId: otherId, status: user.status });
  const app = Fastify();
  await app.register(cookie);
  app.setErrorHandler((error, _req, reply) => { if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'INVALID_INPUT' } }); return reply.code(500).send(error); });
  await app.register(async instance => registerAcademicProfileRoutes(instance, { prisma, redis } as any));
  const cookies = { openscience_session: token };
  const otherCookies = { openscience_session: otherToken };
  return { app, cookies, otherCookies, rows, prisma, credentials };
}

describe('academic profile', () => {
  it('rejects unsafe URLs, unknown fields and SVG portraits', () => {
    expect(academicProfileSchema.safeParse({ ...draft(), orcid: 'javascript:alert(1)' }).success).toBe(false);
    expect(academicProfileSchema.safeParse({ ...draft(), avatar: 'data:image/svg+xml;base64,PHN2Zz4=' }).success).toBe(false);
    expect(academicProfileSchema.safeParse({ ...draft(), accountEmail: 'secret@example.test' }).success).toBe(false);
  });
  it('keeps draft private until explicit publish; prevents stale and cross-account writes', async () => {
    const { app, cookies, otherCookies } = await fixture();
    expect((await app.inject({ method: 'GET', url: '/academic-profile/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/academic-profile/${userId}` })).statusCode).toBe(404);
    const saved = await app.inject({ method: 'PUT', url: '/academic-profile/me', cookies, payload: { ownerId: userId, expectedVersion: 0, profile: draft() } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().version).toBe(1);
    expect((await app.inject({ method: 'GET', url: `/academic-profile/${userId}` })).statusCode).toBe(404);
    const stale = await app.inject({ method: 'PUT', url: '/academic-profile/me', cookies, payload: { ownerId: userId, expectedVersion: 0, profile: draft('Stale') } });
    expect(stale.statusCode).toBe(409);
    const publish = await app.inject({ method: 'POST', url: '/academic-profile/me/publish', cookies, payload: { ownerId: userId, expectedVersion: 1 } });
    expect(publish.statusCode).toBe(200);
    const publicRead = await app.inject({ method: 'GET', url: `/academic-profile/${userId}` });
    expect(publicRead.json().profile.name).toBe('Author');
    expect(publicRead.json().profile).not.toHaveProperty('email');
    expect(publicRead.json().publications[0].title).toBe('Frozen public title');
    expect(publicRead.headers['cache-control']).toContain('no-store');
    const newDraft = await app.inject({ method: 'PUT', url: '/academic-profile/me', cookies, payload: { ownerId: userId, expectedVersion: 2, profile: draft('Revised draft') } });
    expect(newDraft.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/academic-profile/${userId}` })).json().profile.name).toBe('Author');
    expect((await app.inject({ method: 'GET', url: `/academic-profile/${otherId}` })).statusCode).toBe(404);
    const otherOwner = await app.inject({ method: 'GET', url: '/academic-profile/me', cookies: otherCookies });
    expect(otherOwner.json().profile.name).toBe('Other account');
    expect(otherOwner.json().profile.name).not.toBe('Revised draft');
    const switchedCookieWrite = await app.inject({ method: 'PUT', url: '/academic-profile/me', cookies: otherCookies, payload: { ownerId: userId, expectedVersion: 0, profile: draft('Wrong account') } });
    expect(switchedCookieWrite.statusCode).toBe(409);
    const otherSave = await app.inject({ method: 'PUT', url: '/academic-profile/me', cookies: otherCookies, payload: { ownerId: otherId, expectedVersion: 0, profile: draft('Other published name') } });
    expect(otherSave.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/academic-profile/me', cookies })).json().profile.name).toBe('Revised draft');
    const unpublish = await app.inject({ method: 'POST', url: '/academic-profile/me/unpublish', cookies, payload: { ownerId: userId, expectedVersion: 3 } });
    expect(unpublish.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/academic-profile/${userId}` })).statusCode).toBe(404);
  });
  it('filters an inaccessible journal release from public outputs', async () => {
    const { app, cookies, prisma } = await fixture();
    await app.inject({ method: 'PUT', url: '/academic-profile/me', cookies, payload: { ownerId: userId, expectedVersion: 0, profile: draft() } });
    await app.inject({ method: 'POST', url: '/academic-profile/me/publish', cookies, payload: { ownerId: userId, expectedVersion: 1 } });
    prisma.journalArticle.findUnique = async () => ({ id: 'article', contentState: 'revoked', source: {}, releases: [] });
    const read = await app.inject({ method: 'GET', url: `/academic-profile/${userId}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().publications).toEqual([]);
  });
  it('upgrades old JSON snapshots without publishing new draft fields or closed intents', async () => {
    const { app, cookies, rows } = await fixture();
    rows.set(userId, { userId, version: 1, draft: { ...draft(), labUrl: 'https://lab.example.org', education: [{ title: 'Doctorate', details: 'Training', url: 'https://mentor.example.org' }] }, published: draft('Old public name') });
    const owner = (await app.inject({ method: 'GET', url: '/academic-profile/me', cookies })).json();
    expect(owner.profile.teamLinks).toEqual([{ label: '课题组主页', url: 'https://lab.example.org' }]);
    expect(owner.profile.education[0].links[0].url).toBe('https://mentor.example.org');
    expect(owner.profile.labUrl).toBe('');
    expect(owner.profile.education[0].url).toBe('');
    const updated = { ...owner.profile, name: 'New private name', teamLinks: [{ label: 'New team', url: 'https://team.example.org' }], interests: [{ title: 'Open collaboration', body: 'Talk to me', kind: 'collaboration', contact: 'Use profile email', active: true }, { title: 'Closed hiring', body: 'No longer hiring', kind: 'hiring', contact: '', active: false }], works: [{ category: '', period: '', shortTitle: 'Concrete work', summary: 'My part', fullTitle: '', problem: '', contribution: '', process: '', outcome: 'Team outcome', capabilities: ['Field methods', 'Analysis', 'Writing'], links: [] }] };
    expect((await app.inject({ method: 'PUT', url: '/academic-profile/me', cookies, payload: { ownerId: userId, expectedVersion: 1, profile: updated } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/academic-profile/${userId}` })).json().profile.name).toBe('Old public name');
    expect((await app.inject({ method: 'POST', url: '/academic-profile/me/publish', cookies, payload: { ownerId: userId, expectedVersion: 2 } })).statusCode).toBe(200);
    const published = (await app.inject({ method: 'GET', url: `/academic-profile/${userId}` })).json().profile;
    expect(published.teamLinks).toEqual([{ label: 'New team', url: 'https://team.example.org' }]);
    expect(published.works[0].capabilities).toHaveLength(3);
    expect(published.interests.map((item: any) => item.title)).toEqual(['Open collaboration']);
    expect((await app.inject({ method: 'GET', url: '/academic-profile/me', cookies })).json().profile.interests).toHaveLength(2);
    const removed = { ...updated, teamLinks: [], education: [{ ...updated.education[0], links: [] }] };
    expect((await app.inject({ method: 'PUT', url: '/academic-profile/me', cookies, payload: { ownerId: userId, expectedVersion: 3, profile: removed } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/academic-profile/me/publish', cookies, payload: { ownerId: userId, expectedVersion: 4 } })).statusCode).toBe(200);
    const publicJson = (await app.inject({ method: 'GET', url: `/academic-profile/${userId}` })).json().profile;
    expect(publicJson.teamLinks).toEqual([]);
    expect(publicJson.education[0].links).toEqual([]);
    expect(JSON.stringify(publicJson)).not.toContain('https://lab.example.org');
    expect(JSON.stringify(publicJson)).not.toContain('https://mentor.example.org');
  });
  it('derives ORCID proof from the current owner credential and never exposes credential details publicly', async () => {
    const { app, cookies, otherCookies, credentials } = await fixture();
    const id = '0000-0002-1825-0097';
    credentials.set(userId, { type: 'orcid', status: 'verified', source: 'orcid_oauth', revokedAt: null, externalId: id });
    const profile = { ...draft(), orcid: `https://orcid.org/${id}` };
    const saved = await app.inject({ method: 'PUT', url: '/academic-profile/me', cookies, payload: { ownerId: userId, expectedVersion: 0, profile } });
    expect(saved.json()).toMatchObject({ userId, connectedOrcid: id, orcidVerified: true });
    await app.inject({ method: 'POST', url: '/academic-profile/me/publish', cookies, payload: { ownerId: userId, expectedVersion: 1 } });
    const read = await app.inject({ method: 'GET', url: `/academic-profile/${userId}` });
    expect(read.json().orcidVerified).toBe(true);
    expect(read.json()).not.toHaveProperty('connectedOrcid');
    expect(read.json()).not.toHaveProperty('credentials');
    expect((await app.inject({ method: 'GET', url: '/academic-profile/me', cookies: otherCookies })).json().connectedOrcid).toBeNull();
    credentials.get(userId).revokedAt = new Date();
    expect((await app.inject({ method: 'GET', url: `/academic-profile/${userId}` })).json().orcidVerified).toBe(false);
    credentials.get(userId).revokedAt = null;
    credentials.get(userId).externalId = '0000-0002-1694-233X';
    expect((await app.inject({ method: 'GET', url: `/academic-profile/${userId}` })).json().orcidVerified).toBe(false);
  });
});
