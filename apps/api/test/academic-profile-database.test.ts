import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createSession } from '@openscience/auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const suite = databaseUrl ? describe.sequential : describe.skip;

suite('academic profile persistence against isolated PostgreSQL', () => {
  let prisma: PrismaClient | undefined;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  const redis = createFakeRedis();
  const userIds: string[] = [];

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/journal_test') {
      throw new Error('Academic profile integration requires the named loopback journal_test database');
    }
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    app = await buildApp({ prisma, redis, mailer: createFakeMailer(), secureCookies: false });
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      if (prisma) {
        try {
          await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        } finally {
          await prisma.$disconnect();
        }
      }
    }
  });

  it('persists private drafts, serializes concurrent edits and keeps publication snapshots separate', async () => {
    const db = prisma!;
    const http = app!;
    const suffix = randomUUID();
    for (const role of ['owner', 'other']) {
      const user = await db.user.create({ data: {
        email: `profile-${role}-${suffix}@example.invalid`, displayName: `Synthetic profile ${role}`,
        passwordHash: 'unusable-integration-only', status: 'email_verified',
      } });
      userIds.push(user.id);
    }
    const [ownerId, otherId] = userIds;
    const cookies = { openscience_session: await createSession(redis, { userId: ownerId, status: 'email_verified' }) };
    const otherCookies = { openscience_session: await createSession(redis, { userId: otherId, status: 'email_verified' }) };
    const initial = await http.inject({ method: 'GET', url: '/academic-profile/me', cookies });
    expect(initial.statusCode).toBe(200);
    const profile = { ...initial.json().profile, name: 'Synthetic private draft' };
    const save = (name: string, expectedVersion: number) => http.inject({
      method: 'PUT', url: '/academic-profile/me', cookies,
      payload: { ownerId, expectedVersion, profile: { ...profile, name } },
    });
    expect((await save(profile.name, 0)).statusCode).toBe(200);
    const stored = await db.academicProfile.findUniqueOrThrow({ where: { userId: ownerId } });
    expect(stored).toMatchObject({ version: 1, published: null, draft: { name: profile.name } });
    expect(stored.updatedAt).toBeInstanceOf(Date);
    expect(Number.isFinite(stored.updatedAt.getTime())).toBe(true);
    expect((await http.inject({ method: 'GET', url: `/academic-profile/${ownerId}` })).statusCode).toBe(404);
    expect((await save('Rejected stale creation', 0)).statusCode).toBe(409);
    expect(await db.academicProfile.findUnique({ where: { userId: ownerId } })).toEqual(stored);

    const competing = await Promise.all([save('Concurrent draft A', 1), save('Concurrent draft B', 1)]);
    expect(competing.map(response => response.statusCode).sort()).toEqual([200, 409]);
    const winner = competing.find(response => response.statusCode === 200)!.json().profile.name;
    expect(await db.academicProfile.findUnique({ where: { userId: ownerId } })).toMatchObject({
      version: 2, published: null, draft: { name: winner },
    });
    const publish = await http.inject({ method: 'POST', url: '/academic-profile/me/publish', cookies,
      payload: { ownerId, expectedVersion: 2 } });
    expect(publish.statusCode).toBe(200);
    expect(await db.academicProfile.findUnique({ where: { userId: ownerId } })).toMatchObject({
      version: 3, published: { name: winner },
    });
    expect((await save('New private draft after publication', 3)).statusCode).toBe(200);
    const publicRead = await http.inject({ method: 'GET', url: `/academic-profile/${ownerId}` });
    expect(publicRead.statusCode).toBe(200);
    expect(publicRead.json().profile.name).toBe(winner);
    expect(publicRead.headers['cache-control']).toContain('no-store');
    expect((await http.inject({ method: 'GET', url: '/academic-profile/me', cookies })).json().profile.name)
      .toBe('New private draft after publication');
    const beforeWrongOwner = await db.academicProfile.findUniqueOrThrow({ where: { userId: ownerId } });
    const wrongOwner = await http.inject({ method: 'PUT', url: '/academic-profile/me', cookies: otherCookies,
      payload: { ownerId, expectedVersion: 4, profile: { ...profile, name: 'Wrong account' } } });
    expect(wrongOwner.statusCode).toBe(409);
    expect(await db.academicProfile.findUnique({ where: { userId: ownerId } })).toEqual(beforeWrongOwner);
    expect(await db.academicProfile.findUnique({ where: { userId: otherId } })).toBeNull();

    const unpublish = await http.inject({ method: 'POST', url: '/academic-profile/me/unpublish', cookies,
      payload: { ownerId, expectedVersion: 4 } });
    expect(unpublish.statusCode).toBe(200);
    expect((await http.inject({ method: 'GET', url: `/academic-profile/${ownerId}` })).statusCode).toBe(404);
    expect(await db.academicProfile.findUnique({ where: { userId: ownerId } })).toMatchObject({
      version: 5, published: null, draft: { name: 'New private draft after publication' },
    });
    await db.user.delete({ where: { id: ownerId } });
    expect(await db.academicProfile.findUnique({ where: { userId: ownerId } })).toBeNull();
  });
});
