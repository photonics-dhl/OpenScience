import { describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { buildApp } from '../src/app';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused authenticated route fake */

async function fixture() {
  const user = { id: '11111111-1111-4111-8111-111111111111', status: 'email_verified' };
  const rows = new Map<string, { userId: string; evidenceDefaultCollapsed: boolean; version: number }>();
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => where.id === user.id ? user : null },
    readingPreference: {
      findUnique: async ({ where }: any) => rows.get(where.userId) ?? null,
      create: async ({ data }: any) => {
        const row = { ...data, version: 1 };
        rows.set(data.userId, row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const row = rows.get(where.userId);
        if (!row || row.version !== where.version) return { count: 0 };
        Object.assign(row, { evidenceDefaultCollapsed: data.evidenceDefaultCollapsed, version: row.version + 1 });
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
    prisma, redis, mailer: { send: async () => undefined },
    secureCookies: false, cookieSecret: 'preference-test-secret',
  });
  return { app, token };
}

describe('/reading-preferences routes', () => {
  it('reads the default and creates the authenticated user preference', async () => {
    const { app, token } = await fixture();
    const cookies = { openscience_session: token };
    const initial = await app.inject({ method: 'GET', url: '/reading-preferences', cookies });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({ evidenceDefaultCollapsed: false, version: 0 });

    const update = await app.inject({
      method: 'PATCH', url: '/reading-preferences', cookies,
      payload: { evidenceDefaultCollapsed: true, expectedVersion: 0 },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toEqual({ evidenceDefaultCollapsed: true, version: 1 });
    await app.close();
  });

  it('rejects stale versions, foreign identity fields and unauthenticated access', async () => {
    const { app, token } = await fixture();
    const cookies = { openscience_session: token };
    await app.inject({
      method: 'PATCH', url: '/reading-preferences', cookies,
      payload: { evidenceDefaultCollapsed: true, expectedVersion: 0 },
    });
    const stale = await app.inject({
      method: 'PATCH', url: '/reading-preferences', cookies,
      payload: { evidenceDefaultCollapsed: false, expectedVersion: 0 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('PREFERENCE_VERSION_CONFLICT');
    expect((await app.inject({
      method: 'PATCH', url: '/reading-preferences', cookies,
      payload: { evidenceDefaultCollapsed: false, expectedVersion: 1, userId: 'someone-else' },
    })).statusCode).toBe(400);
    expect((await app.inject({
      method: 'PATCH', url: '/reading-preferences', cookies,
      payload: { evidenceDefaultCollapsed: 'yes', expectedVersion: 1 },
    })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/reading-preferences' })).statusCode).toBe(401);
    await app.close();
  });
});
