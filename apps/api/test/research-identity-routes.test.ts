import { describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { buildApp } from '../src/app';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused transaction fake */

async function fixture() {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'identity@example.com', displayName: 'Identity', status: 'email_verified', level: 'free' };
  const profile: any = {
    id: '22222222-2222-4222-8222-222222222222',
    userId: user.id,
    identities: ['reader', 'reviewer'],
    primaryIdentity: 'reviewer',
    disciplines: ['physics'],
    methods: ['spectroscopy'],
    topics: ['ultrafast optics'],
    languages: ['zh'],
    acceptedSignals: ['open data'],
    rejectedSignals: ['clinical medicine'],
    profileVersion: 3,
  };
  const audits: any[] = [];
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => where.id === user.id ? user : null },
    researchIdentityProfile: {
      findUnique: async ({ where }: any) => where.userId === user.id ? { ...profile } : null,
      updateMany: async ({ where, data }: any) => {
        if (where.userId !== user.id || where.profileVersion !== profile.profileVersion) return { count: 0 };
        Object.assign(profile, data);
        return { count: 1 };
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  const store = new Map<string, string>();
  const redis: any = {
    set: async (key: string, value: string) => void store.set(key, value),
    get: async (key: string) => store.get(key) ?? null,
    expire: async () => 1,
    del: async (key: string) => void store.delete(key),
  };
  const token = await createSession(redis, { userId: user.id, status: user.status });
  const app = await buildApp({
    prisma,
    redis,
    mailer: { send: async () => undefined },
    audit: { record: async (event: any) => void audits.push(event) },
    secureCookies: false,
    cookieSecret: 'identity-test-secret',
  });
  return { app, token, profile, audits };
}

describe('/research-identity routes', () => {
  it('returns the authenticated profile and applies a versioned partial update', async () => {
    const { app, token, audits } = await fixture();
    const cookies = { openscience_session: token };

    const read = await app.inject({ method: 'GET', url: '/research-identity', cookies });
    expect(read.statusCode).toBe(200);
    expect(read.json().profile).toMatchObject({ primaryIdentity: 'reviewer', profileVersion: 3 });

    const update = await app.inject({
      method: 'PATCH',
      url: '/research-identity',
      cookies,
      payload: { expectedProfileVersion: 3, topics: ['attosecond science'] },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().profile).toMatchObject({
      methods: ['spectroscopy'],
      topics: ['attosecond science'],
      profileVersion: 4,
    });
    expect(audits).toEqual([expect.objectContaining({ action: 'research_identity.update', actorId: expect.any(String) })]);
  });

  it('corrects a signal and rejects stale profile versions', async () => {
    const { app, token } = await fixture();
    const cookies = { openscience_session: token };
    const correction = await app.inject({
      method: 'POST',
      url: '/research-identity/signals',
      cookies,
      payload: { expectedProfileVersion: 3, signal: 'open data', decision: 'reject' },
    });
    expect(correction.statusCode).toBe(200);
    expect(correction.json().profile).toMatchObject({
      acceptedSignals: [],
      rejectedSignals: ['clinical medicine', 'open data'],
      profileVersion: 4,
    });

    const stale = await app.inject({
      method: 'PATCH',
      url: '/research-identity',
      cookies,
      payload: { expectedProfileVersion: 3, topics: ['stale'] },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('PROFILE_VERSION_CONFLICT');
  });

  it('requires a session and rejects sensitive/off-site fields', async () => {
    const { app, token } = await fixture();
    expect((await app.inject({ method: 'GET', url: '/research-identity' })).statusCode).toBe(401);
    const rejected = await app.inject({
      method: 'PATCH',
      url: '/research-identity',
      cookies: { openscience_session: token },
      payload: { expectedProfileVersion: 3, offsiteHistory: ['example.org'] },
    });
    expect(rejected.statusCode).toBe(400);
  });
});
