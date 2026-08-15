import { describe, expect, it, vi } from 'vitest';
import { createSession } from '@openscience/auth';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

/* eslint-disable @typescript-eslint/no-explicit-any -- route contract fake intentionally covers only editorial calls */

const COLLECTION = {
  id: '00000000-0000-4000-8000-000000000011',
  slug: 'ultrafast-science',
  title: 'Ultrafast Science',
  description: 'Curated research objects.',
};

async function setup(role: 'user' | 'platform_admin' = 'user') {
  const { prisma, db } = createFakePrisma();
  const redis = createFakeRedis();
  const findMany = vi.fn().mockResolvedValue([]);
  (prisma as any).editorialCollection = { findUnique: vi.fn().mockResolvedValue(COLLECTION) };
  (prisma as any).editorialSelection = { findMany };
  const app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false });
  const userId = role === 'platform_admin' ? '33333333-3333-4333-8333-333333333333' : '11111111-1111-4111-8111-111111111111';
  db.users.push({ id: userId, email: `${role}@example.com`, displayName: role, passwordHash: 'x', status: 'email_verified', platformRole: role });
  const token = await createSession(redis, { userId, status: 'email_verified' });
  return { app, findMany, auth: { cookies: { openscience_session: token } } };
}

describe('Editorial collection routes', () => {
  it('exposes only published selections on the anonymous collection route', async () => {
    const { app, findMany } = await setup();
    const response = await app.inject({ method: 'GET', url: '/editorial/collections/ultrafast-science' });
    expect(response.statusCode).toBe(200);
    expect(response.json().collection).toMatchObject({ slug: 'ultrafast-science', selections: [] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      collectionId: COLLECTION.id,
      state: 'published',
      researchObject: { visibility: 'public' },
      version: { status: 'published' },
    } }));
  });

  it('rejects anonymous and ordinary-user access to the editorial work queue', async () => {
    const anonymous = await setup();
    expect((await anonymous.app.inject({ method: 'GET', url: '/admin/editorial/collections/ultrafast-science/selections' })).statusCode).toBe(401);

    const ordinary = await setup('user');
    const denied = await ordinary.app.inject({ method: 'GET', url: '/admin/editorial/collections/ultrafast-science/selections', ...ordinary.auth });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');
    expect((await ordinary.app.inject({ method: 'GET', url: '/admin/editorial/candidates', ...ordinary.auth })).statusCode).toBe(403);
  });

  it('allows a platform administrator to inspect draft and scheduled selections', async () => {
    const { app, findMany, auth } = await setup('platform_admin');
    const response = await app.inject({ method: 'GET', url: '/admin/editorial/collections/ultrafast-science/selections', ...auth });
    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collectionId: COLLECTION.id } }));
  });
});
