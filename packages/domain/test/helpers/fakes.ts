import type { PrismaClient } from '@prisma/client';
import type { Mailer, MailMessage } from '@openscience/auth';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离 Prisma 完整类型 */

interface FakeDb {
  users: any[];
  workspaces: any[];
  memberships: any[];
  workspaceInvitations: any[];
  mailOutbox: any[];
  quotaPolicies: any[];
  usageLedger: any[];
  researchObjects: any[];
  sdfDocuments: any[];
  sdfNodes: any[];
  blobs: any[];
  artifacts: any[];
  branches: any[];
  commits: any[];
  changesets: any[];
  versions: any[];
  versionManifests: any[];
  manifestEntries: any[];
}

/** 内存版 Prisma 子集：覆盖 workspace 领域用到的调用面。 */
export function createFakePrisma(): { prisma: PrismaClient; db: FakeDb } {
  const db: FakeDb = { users: [], workspaces: [], memberships: [], workspaceInvitations: [], mailOutbox: [], quotaPolicies: [], usageLedger: [], researchObjects: [], sdfDocuments: [], sdfNodes: [], blobs: [], artifacts: [], branches: [], commits: [], changesets: [], versions: [], versionManifests: [], manifestEntries: [] };
  let seq = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const p2002 = () => {
    const err = new Error('Unique constraint failed') as Error & { code: string };
    err.code = 'P2002';
    return err;
  };

  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        db.users.find((u) =>
          where.email ? u.email.toLowerCase() === where.email.toLowerCase() : u.id === where.id,
        ) ?? null,
      findMany: async ({ where }: any) =>
        db.users.filter((u) => {
          const s = where.status;
          if (s === undefined) return true;
          if (typeof s === 'string') return u.status === s;
          if (s.notIn) return !s.notIn.includes(u.status);
          return true;
        }),
    },
    workspace: {
      findUnique: async ({ where }: any) => db.workspaces.find((w) => w.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        db.workspaces.find(
          (w) =>
            (where.type === undefined || w.type === where.type) &&
            (where.ownerId === undefined || w.ownerId === where.ownerId),
        ) ?? null,
      create: async ({ data }: any) => {
        if (data.type === 'personal' && db.workspaces.some((w) => w.type === 'personal' && w.ownerId === data.ownerId)) {
          throw p2002(); // 部分唯一索引 workspaces_personal_owner_key
        }
        const row = {
          id: nextId(),
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        delete row.members;
        db.workspaces.push(row);
        if (data.members?.create) {
          db.memberships.push({
            id: nextId(),
            workspaceId: row.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data.members.create,
          });
        }
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.workspaces.find((w) => w.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    membership: {
      findUnique: async ({ where }: any) =>
        db.memberships.find(
          (m) => m.workspaceId === where.workspaceId_userId.workspaceId && m.userId === where.workspaceId_userId.userId,
        ) ?? null,
      findMany: async ({ where }: any) =>
        db.memberships.filter(
          (m) =>
            (where.userId === undefined || m.userId === where.userId) &&
            (where.workspaceId === undefined || m.workspaceId === where.workspaceId),
        ),
      count: async ({ where }: any) =>
        db.memberships.filter((m) => m.workspaceId === where.workspaceId && (where.role === undefined || m.role === where.role)).length,
      create: async ({ data }: any) => {
        if (db.memberships.some((m) => m.workspaceId === data.workspaceId && m.userId === data.userId)) throw p2002();
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
        db.memberships.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.memberships.find((m) => m.id === where.id);
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = db.memberships.findIndex((m) => m.id === where.id);
        return db.memberships.splice(idx, 1)[0];
      },
      upsert: async ({ where, create }: any) => {
        const existing = db.memberships.find(
          (m) => m.workspaceId === where.workspaceId_userId.workspaceId && m.userId === where.workspaceId_userId.userId,
        );
        if (existing) return existing;
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...create };
        db.memberships.push(row);
        return row;
      },
    },
    workspaceInvitation: {
      findUnique: async ({ where }: any) => db.workspaceInvitations.find((i) => i.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        db.workspaceInvitations.find(
          (i) =>
            i.workspaceId === where.workspaceId &&
            i.email.toLowerCase() === where.email.toLowerCase() &&
            i.status === where.status,
        ) ?? null,
      findMany: async ({ where }: any) =>
        db.workspaceInvitations.filter(
          (i) => i.email.toLowerCase() === where.email.toLowerCase() && i.status === where.status,
        ),
      create: async ({ data }: any) => {
        const row = { id: nextId(), status: 'pending', respondedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        db.workspaceInvitations.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const i of db.workspaceInvitations) {
          if (
            i.id === where.id &&
            (where.status === undefined || i.status === where.status) &&
            (where.workspaceId === undefined || i.workspaceId === where.workspaceId)
          ) {
            Object.assign(i, data);
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
    quotaPolicy: {
      findMany: async ({ where }: any) =>
        db.quotaPolicies.filter(
          (p) =>
            (where.resource === undefined || p.resource === where.resource) &&
            (where.scope === undefined || p.scope === where.scope),
        ),
      findFirst: async ({ where }: any) =>
        db.quotaPolicies.find(
          (p) =>
            (where.scope === undefined || p.scope === where.scope) &&
            (p.scopeKey ?? null) === (where.scopeKey ?? null) &&
            (where.resource === undefined || p.resource === where.resource),
        ) ?? null,
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
        db.quotaPolicies.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.quotaPolicies.find((p) => p.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    usageLedger: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), ...data };
        db.usageLedger.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        db.usageLedger.filter(
          (r) =>
            (where.userId === undefined || r.userId === where.userId) &&
            (where.workspaceId === undefined || r.workspaceId === where.workspaceId) &&
            (where.resource === undefined || r.resource === where.resource) &&
            (where.kind === undefined || r.kind === where.kind),
        ),
      findFirst: async ({ where }: any) =>
        db.usageLedger.find(
          (r) =>
            (where.userId === undefined || r.userId === where.userId) &&
            (where.resource === undefined || r.resource === where.resource) &&
            (where.kind === undefined || r.kind === where.kind) &&
            (where.period === undefined || r.period === where.period),
        ) ?? null,
      aggregate: async ({ _sum, where }: any) => {
        const rows = db.usageLedger.filter(
          (r) =>
            (where.userId === undefined || r.userId === where.userId) &&
            (where.workspaceId === undefined || r.workspaceId === where.workspaceId) &&
            (where.resource === undefined || r.resource === where.resource),
        );
        const sum = rows.reduce((acc, r) => acc + Number(r[_sum.delta ? 'delta' : '']), 0);
        return { _sum: { delta: sum } };
      },
    },
    researchObject: {
      findUnique: async ({ where, include }: any) => {
        const ro = db.researchObjects.find((r) => r.id === where.id) ?? null;
        if (!ro || !include?.sdfDocument) return ro;
        const doc = db.sdfDocuments.find((d) => d.researchObjectId === ro.id);
        return { ...ro, sdfDocument: doc ? { ...doc, nodes: db.sdfNodes.filter((n) => n.sdfDocumentId === doc.id) } : null };
      },
      create: async ({ data }: any) => {
        const row = {
          id: nextId(), status: 'draft', visibility: 'private', version: 1,
          createdAt: new Date(), updatedAt: new Date(),
          workspaceId: data.workspaceId, title: data.title, createdBy: data.createdBy,
        };
        db.researchObjects.push(row);
        if (data.sdfDocument?.create) {
          const doc = { id: nextId(), researchObjectId: row.id, coreJson: data.sdfDocument.create.coreJson, createdAt: new Date(), updatedAt: new Date() };
          db.sdfDocuments.push(doc);
          for (const n of data.sdfDocument.create.nodes?.create ?? []) {
            db.sdfNodes.push({ id: nextId(), sdfDocumentId: doc.id, createdAt: new Date(), updatedAt: new Date(), ...n });
          }
        }
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const r of db.researchObjects) {
          if (r.id === where.id && (where.version === undefined || r.version === where.version)) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      },
      update: async ({ where, data }: any) => {
        const r = db.researchObjects.find((row) => row.id === where.id);
        if (!r) return null;
        Object.assign(r, data);
        return r;
      },
    },
    sdfDocument: {
      findUnique: async ({ where }: any) =>
        db.sdfDocuments.find((d) =>
          where.researchObjectId ? d.researchObjectId === where.researchObjectId : d.id === where.id,
        ) ?? null,
      update: async ({ where, data }: any) => {
        const doc = db.sdfDocuments.find((d) =>
          where.researchObjectId ? d.researchObjectId === where.researchObjectId : d.id === where.id,
        );
        Object.assign(doc, data);
        return doc;
      },
    },
    sdfNode: {
      findMany: async ({ where }: any) =>
        db.sdfNodes.filter((n) =>
          (where.sdfDocumentId === undefined || n.sdfDocumentId === where.sdfDocumentId) &&
          (where.nodeType === undefined || n.nodeType === where.nodeType),
        ),
      update: async ({ where, data }: any) => {
        const node = db.sdfNodes.find((n) =>
          where.sdfDocumentId_nodeType
            ? n.sdfDocumentId === where.sdfDocumentId_nodeType.sdfDocumentId && n.nodeType === where.sdfDocumentId_nodeType.nodeType
            : n.id === where.id,
        );
        Object.assign(node, data);
        return node;
      },
    },
    blob: {
      upsert: async ({ where, create, update }: any) => {
        const existing = db.blobs.find((b) => b.sha256 === where.sha256);
        if (existing) return { ...existing, ...update };
        const row = { createdAt: new Date(), ...create };
        db.blobs.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => db.blobs.find((b) => b.sha256 === where.sha256) ?? null,
    },
    artifact: {
      findUnique: async ({ where, include }: any) => {
        const row = db.artifacts.find((a) => a.id === where.id) ?? null;
        if (!row || !include?.blob) return row;
        return { ...row, blob: db.blobs.find((b) => b.sha256 === row.blobSha256) ?? null };
      },
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), ...data };
        db.artifacts.push(row);
        return row;
      },
    },
    branch: {
      findFirst: async ({ where }: any) =>
        db.branches.find(
          (b) =>
            (where.researchObjectId === undefined || b.researchObjectId === where.researchObjectId) &&
            (where.name === undefined || b.name === where.name),
        ) ?? null,
      create: async ({ data }: any) => {
        const row = { id: nextId(), isDefault: false, createdAt: new Date(), ...data };
        db.branches.push(row);
        return row;
      },
    },
    commit: {
      findUnique: async ({ where }: any) =>
        db.commits.find((c) => (where.id ? c.id === where.id : c.idempotencyKey === where.idempotencyKey)) ?? null,
      findFirst: async ({ where, orderBy }: any) => {
        const rows = db.commits.filter(
          (c) =>
            (where.branchId === undefined || c.branchId === where.branchId) &&
            (where.researchObjectId === undefined || c.researchObjectId === where.researchObjectId),
        );
        if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
        return rows[0] ?? null;
      },
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), ...data };
        delete row.changesets;
        db.commits.push(row);
        if (data.changesets?.create) {
          for (const cs of data.changesets.create) {
            db.changesets.push({ id: nextId(), commitId: row.id, createdAt: new Date(), ...cs });
          }
        }
        return row;
      },
    },
    version: {
      findFirst: async ({ where, orderBy }: any) => {
        const rows = db.versions.filter(
          (v) =>
            (where.researchObjectId === undefined || v.researchObjectId === where.researchObjectId) &&
            (where.commitId === undefined || v.commitId === where.commitId),
        );
        if (orderBy?.versionNo === 'desc') rows.sort((a, b) => b.versionNo - a.versionNo);
        return rows[0] ?? null;
      },
      findUnique: async ({ where, include }: any) => {
        const row = db.versions.find((v) => v.id === where.id) ?? null;
        if (!row || !include?.researchObject) return row;
        return { ...row, researchObject: db.researchObjects.find((r) => r.id === row.researchObjectId) ?? null };
      },
      create: async ({ data }: any) => {
        const row = { id: nextId(), status: 'draft', createdAt: new Date(), ...data };
        db.versions.push(row);
        return row;
      },
    },
    versionManifest: {
      findUnique: async ({ where, include }: any) => {
        const row = db.versionManifests.find((m) => m.versionId === where.versionId) ?? null;
        if (!row || !include?.entries) return row;
        return { ...row, entries: db.manifestEntries.filter((e) => e.manifestId === row.id) };
      },
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), ...data };
        delete row.entries;
        db.versionManifests.push(row);
        if (data.entries?.create) {
          for (const e of data.entries.create) {
            db.manifestEntries.push({ id: nextId(), manifestId: row.id, createdAt: new Date(), ...e });
          }
        }
        return row;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma: prisma as PrismaClient, db };
}

/** 记录发送内容的 fake Mailer。 */
export function createFakeMailer(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return { sent, send: async (msg: MailMessage) => void sent.push(msg) };
}

/** 造一个 email_verified 用户行。 */
export function seedUser(db: { users: any[] }, overrides: Record<string, unknown> = {}): any {
  const n = db.users.length + 1;
  const user = {
    id: `user-${n}`,
    email: `user${n}@example.com`,
    displayName: `User ${n}`,
    status: 'email_verified',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  db.users.push(user);
  return user;
}
