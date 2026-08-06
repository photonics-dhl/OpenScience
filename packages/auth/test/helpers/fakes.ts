import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Mailer, MailMessage } from '../../src/mailer';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离 Prisma 完整类型 */

interface FakeDb {
  users: any[];
  invitations: any[];
  emailVerifications: any[];
  mailOutbox: any[];
}

/** 内存版 Prisma 子集：仅覆盖 auth-service 用到的调用面。 */
export function createFakePrisma(): { prisma: PrismaClient; db: FakeDb } {
  const db: FakeDb = { users: [], invitations: [], emailVerifications: [], mailOutbox: [] };
  let seq = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        db.users.find((u) => (where.email ? u.email.toLowerCase() === where.email.toLowerCase() : u.id === where.id)) ??
        null,
      create: async ({ data }: any) => {
        if (db.users.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
          const err = new Error('Unique constraint failed') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        const row = { id: nextId(), level: 'free', createdAt: new Date(), updatedAt: new Date(), ...data };
        db.users.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.users.find((u) => u.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    invitation: {
      findUnique: async ({ where }: any) => db.invitations.find((i) => i.code === where.code) ?? null,
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), usedBy: null, usedAt: null, revokedAt: null, ...data };
        db.invitations.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.invitations.find((i) => i.id === where.id);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const i of db.invitations) {
          if (i.id === where.id && (where.usedBy === undefined || i.usedBy === where.usedBy) && (where.revokedAt === undefined || i.revokedAt === where.revokedAt)) {
            Object.assign(i, data);
            count++;
          }
        }
        return { count };
      },
    },
    emailVerification: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), attempts: 0, lockedUntil: null, verifiedAt: null, createdAt: new Date(), ...data };
        db.emailVerifications.push(row);
        return row;
      },
      findFirst: async ({ where }: any) =>
        db.emailVerifications
          .filter((v) => v.userId === where.userId && v.verifiedAt === null)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      update: async ({ where, data }: any) => {
        const row = db.emailVerifications.find((v) => v.id === where.id);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const v of db.emailVerifications) {
          if (v.userId === where.userId && v.verifiedAt === null) {
            Object.assign(v, data);
            count++;
          }
        }
        return { count };
      },
    },
    mailOutbox: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), ...data };
        db.mailOutbox.push(row);
        return row;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma: prisma as PrismaClient, db };
}

/** 内存版 Redis 子集：set/get/del/expire。 */
export function createFakeRedis(): Redis & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    get: async (key: string) => store.get(key) ?? null,
    del: async (key: string) => (store.delete(key) ? 1 : 0),
    expire: async () => 1,
  } as unknown as Redis & { store: Map<string, string> };
}

/** 记录发送内容的 fake Mailer。 */
export function createFakeMailer(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return { sent, send: async (msg: MailMessage) => void sent.push(msg) };
}
