import { Prisma, type PrismaClient } from '@prisma/client';
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
  identifiers: any[];
  publications: any[];
  visibilityGrants: any[];
  visibilityRequests: any[];
  pullRequests: any[];
  issues: any[];
  comments: any[];
  reviews: any[];
  licenseAssignments: any[];
  forkRelations: any[];
  notifications: any[];
  authors: any[];
  contributions: any[];
  agentSessions: any[];
  agentTasks: any[];
  toolApprovals: any[];
  aiReviews: any[];
  appeals: any[];
  ingestionBatches: any[];
  ingestionTasks: any[];
  claimNodes: any[];
  evidenceRecords: any[];
  presentationAssets: any[];
  researchIdentityProfiles: any[];
  auditLogs: any[];
}

/** 内存版 Prisma 子集：覆盖 workspace 领域用到的调用面。 */
export function createFakePrisma(): { prisma: PrismaClient; db: FakeDb } {
  const db: FakeDb = { users: [], workspaces: [], memberships: [], workspaceInvitations: [], mailOutbox: [], quotaPolicies: [], usageLedger: [], researchObjects: [], sdfDocuments: [], sdfNodes: [], blobs: [], artifacts: [], branches: [], commits: [], changesets: [], versions: [], versionManifests: [], manifestEntries: [], identifiers: [], publications: [], visibilityGrants: [], visibilityRequests: [], pullRequests: [], issues: [], comments: [], reviews: [], licenseAssignments: [], forkRelations: [], notifications: [], authors: [], contributions: [], agentSessions: [], agentTasks: [], toolApprovals: [], aiReviews: [], appeals: [], ingestionBatches: [], ingestionTasks: [], claimNodes: [], evidenceRecords: [], presentationAssets: [], researchIdentityProfiles: [], auditLogs: [] };
  let seq = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const p2002 = (modelName?: string, target?: string | string[]) => {
    const err = new Error('Unique constraint failed') as Error & { code: string; meta?: { modelName: string; target: string | string[] } };
    err.code = 'P2002';
    if (modelName && target) err.meta = { modelName, target };
    return err;
  };
  let transactionQueue: Promise<void> = Promise.resolve();

  const agentTaskWithInclude = (row: any, include: any) => {
    if (!include?.session) return { ...row };
    const session = db.agentSessions.find((candidate) => candidate.id === row.sessionId) ?? null;
    if (!session || !include.session.include?.researchObject) return { ...row, session };
    const researchObject = db.researchObjects.find((candidate) => candidate.id === session.researchObjectId) ?? null;
    if (!researchObject || !include.session.include.researchObject.include?.workspace) {
      return { ...row, session: { ...session, researchObject } };
    }
    const workspace = db.workspaces.find((candidate) => candidate.id === researchObject.workspaceId) ?? null;
    if (!workspace) return { ...row, session: { ...session, researchObject: { ...researchObject, workspace } } };
    const membersWhere = include.session.include.researchObject.include.workspace.include?.members?.where;
    const members = db.memberships.filter((membership) => membership.workspaceId === workspace.id
      && (membersWhere?.userId === undefined || membership.userId === membersWhere.userId));
    return {
      ...row,
      session: { ...session, researchObject: { ...researchObject, workspace: { ...workspace, members } } },
    };
  };

  const agentTaskMatchesSession = (task: any, whereSession: any) => {
    if (!whereSession) return true;
    const session = db.agentSessions.find((candidate) => candidate.id === task.sessionId);
    if (!session || (whereSession.userId !== undefined && session.userId !== whereSession.userId)
      || (whereSession.status !== undefined && session.status !== whereSession.status)) return false;
    const researchWhere = whereSession.researchObject?.is;
    if (!researchWhere) return true;
    const researchObject = db.researchObjects.find((candidate) => candidate.id === session.researchObjectId);
    if (!researchObject) return false;
    const workspaceWhere = researchWhere.workspace;
    const workspace = db.workspaces.find((candidate) => candidate.id === researchObject.workspaceId);
    if (!workspace || (workspaceWhere?.status !== undefined && workspace.status !== workspaceWhere.status)) return false;
    const memberWhere = workspaceWhere?.members?.some;
    return !memberWhere || db.memberships.some((membership) => membership.workspaceId === workspace.id
      && (memberWhere.userId === undefined || membership.userId === memberWhere.userId));
  };

  const prisma: any = {
    auditLog: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), ...data };
        db.auditLogs.push(row);
        return row;
      },
    },
    researchIdentityProfile: {
      findUnique: async ({ where }: any) => db.researchIdentityProfiles.find((row) => row.userId === where.userId) ?? null,
    },
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
      findMany: async ({ where, take }: any) => db.workspaces.filter((w) =>
        (where.type === undefined || w.type === where.type) &&
        (where.ownerId === undefined || w.ownerId === where.ownerId) &&
        (where.status === undefined || w.status === where.status),
      ).slice(0, take ?? db.workspaces.length),
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
        if (data.idempotencyKey && db.usageLedger.some((row) => row.idempotencyKey === data.idempotencyKey)) throw p2002();
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
            (where.resource === undefined || r.resource === where.resource) &&
            (where.period === undefined || r.period === where.period),
        );
        const sum = rows.reduce((acc, r) => acc + Number(r[_sum.delta ? 'delta' : '']), 0);
        return { _sum: { delta: sum } };
      },
    },
    researchObject: {
      findMany: async ({ where, include, orderBy, take }: any) => {
        const userId = where?.workspace?.members?.some?.userId;
        let rows = db.researchObjects.filter((row) =>
          !userId || db.memberships.some((membership) => membership.workspaceId === row.workspaceId && membership.userId === userId),
        );
        const matchesText = (value: string, filter: any) => {
          if (!filter) return true;
          if (filter.contains !== undefined) return value.toLocaleLowerCase().includes(String(filter.contains).toLocaleLowerCase());
          if (filter.endsWith !== undefined) return value.toLocaleLowerCase().endsWith(String(filter.endsWith).toLocaleLowerCase());
          if (filter.not?.endsWith !== undefined) return !value.toLocaleLowerCase().endsWith(String(filter.not.endsWith).toLocaleLowerCase());
          return true;
        };
        const matchesEntry = (entry: any, condition: any): boolean =>
          (condition.OR === undefined || condition.OR.some((part: any) => matchesEntry(entry, part))) &&
          (condition.AND === undefined || condition.AND.every((part: any) => matchesEntry(entry, part))) &&
          matchesText(entry.logicalPath, condition.logicalPath);
        const versionsFor = (row: any) => db.versions.filter((version) => version.researchObjectId === row.id);
        const matchesVersionSome = (row: any, condition: any) => versionsFor(row).some((version) => {
          if (condition.status !== undefined && version.status !== condition.status) return false;
          const manifest = db.versionManifests.find((candidate) => candidate.versionId === version.id);
          const entrySome = condition.manifest?.is?.entries?.some;
          return !entrySome || (!!manifest && db.manifestEntries.some((entry) => entry.manifestId === manifest.id && matchesEntry(entry, entrySome)));
        });
        const matchesClause = (row: any, clause: any): boolean => {
          if (clause.OR) return clause.OR.some((part: any) => matchesClause(row, part));
          if (clause.title && !matchesText(row.title, clause.title)) return false;
          if (clause.versions?.some && !matchesVersionSome(row, clause.versions.some)) return false;
          const nodeSome = clause.sdfDocument?.nodes?.some;
          if (nodeSome) {
            const document = db.sdfDocuments.find((candidate) => candidate.researchObjectId === row.id);
            const nodes = document ? db.sdfNodes.filter((node) => node.sdfDocumentId === document.id) : [];
            if (!nodes.some((node) =>
              (nodeSome.nodeType === undefined || node.nodeType === nodeSome.nodeType) &&
              matchesText(node.content, nodeSome.content),
            )) return false;
          }
          return true;
        };
        rows = rows.filter((row) =>
          (where?.visibility === undefined || row.visibility === where.visibility) &&
          (where?.publicId?.not === undefined || row.publicId !== where.publicId.not) &&
          (where?.publicId?.gt === undefined || row.publicId > where.publicId.gt) &&
          (!where?.versions?.some || matchesVersionSome(row, where.versions.some)) &&
          (!where?.AND || where.AND.every((clause: any) => matchesClause(row, clause))),
        );
        if (orderBy?.updatedAt === 'desc') rows = rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        if (orderBy?.publicId === 'asc') rows = rows.sort((a, b) => a.publicId.localeCompare(b.publicId));
        rows = rows.slice(0, take ?? rows.length);
        if (!include) return rows;
        return rows.map((row) => {
          const sdfDocument = db.sdfDocuments.find((document) => document.researchObjectId === row.id);
          const nodes = sdfDocument
            ? db.sdfNodes.filter((node) => node.sdfDocumentId === sdfDocument.id).toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            : [];
          let versions = versionsFor(row).filter((version) => !include.versions?.where?.status || version.status === include.versions.where.status);
          if (include.versions?.orderBy?.versionNo === 'desc') versions = versions.toSorted((a, b) => b.versionNo - a.versionNo);
          versions = versions.slice(0, include.versions?.take ?? versions.length).map((version) => {
            const manifest = db.versionManifests.find((candidate) => candidate.versionId === version.id);
            return {
              ...version,
              manifest: manifest ? { ...manifest, entries: db.manifestEntries.filter((entry) => entry.manifestId === manifest.id) } : null,
              publications: db.publications.filter((publication) => publication.versionId === version.id),
            };
          });
          const authors = db.authors
            .filter((author) => author.researchObjectId === row.id)
            .toSorted((a, b) => a.sortOrder - b.sortOrder)
            .map((author) => ({ ...author, user: db.users.find((user) => user.id === author.userId) }));
          return { ...row, sdfDocument: sdfDocument ? { ...sdfDocument, nodes } : null, versions, authors };
        });
      },
      findUnique: async ({ where, include }: any) => {
        const ro = db.researchObjects.find((r) => where.id ? r.id === where.id : r.idempotencyKey === where.idempotencyKey) ?? null;
        if (!ro || !include?.sdfDocument) return ro;
        const doc = db.sdfDocuments.find((d) => d.researchObjectId === ro.id);
        return { ...ro, sdfDocument: doc ? { ...doc, nodes: db.sdfNodes.filter((n) => n.sdfDocumentId === doc.id) } : null };
      },
      create: async ({ data }: any) => {
        if (data.idempotencyKey && db.researchObjects.some((researchObject) => researchObject.idempotencyKey === data.idempotencyKey)) throw p2002('ResearchObject', ['idempotency_key']);
        const row = {
          id: nextId(), status: 'draft', visibility: 'private', version: 1,
          createdAt: new Date(), updatedAt: new Date(),
          workspaceId: data.workspaceId, title: data.title, createdBy: data.createdBy, idempotencyKey: data.idempotencyKey,
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
      delete: async ({ where }: any) => {
        const index = db.researchObjects.findIndex((researchObject) => researchObject.id === where.id);
        return db.researchObjects.splice(index, 1)[0];
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
        const row = db.artifacts.find((a) => where.id ? a.id === where.id : a.idempotencyKey === where.idempotencyKey) ?? null;
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
      findFirst: async ({ where, include }: any) => {
        const row = db.branches.find(
          (b) =>
            (where.researchObjectId === undefined || b.researchObjectId === where.researchObjectId) &&
            (where.id === undefined || b.id === where.id) &&
            (where.name === undefined || b.name === where.name),
        ) ?? null;
        if (!row || !include) return row;
        const commits = db.commits
          .filter((c) => c.branchId === row.id)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, include.commits?.take ?? 1);
        return { ...row, commits, _count: { commits: db.commits.filter((c) => c.branchId === row.id).length } };
      },
      findMany: async ({ where, include, orderBy }: any) => {
        const rows = db.branches.filter(
          (b) => (where.researchObjectId === undefined || b.researchObjectId === where.researchObjectId),
        );
        if (orderBy?.[0]?.isDefault === 'desc') rows.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
        return rows.map((b) => {
          const commits = db.commits
            .filter((c) => c.branchId === b.id)
            .sort((a, c2) => c2.createdAt - a.createdAt)
            .slice(0, include?.commits?.take ?? 1);
          return { ...b, commits, _count: { commits: db.commits.filter((c) => c.branchId === b.id).length } };
        });
      },
      create: async ({ data, include }: any) => {
        const row = { id: nextId(), isDefault: false, createdAt: new Date(), ...data };
        if (db.branches.some((b) => b.researchObjectId === row.researchObjectId && b.name === row.name)) throw p2002();
        db.branches.push(row);
        if (!include) return row;
        const commits = db.commits.filter((c) => c.branchId === row.id).slice(0, include.commits?.take ?? 1);
        return { ...row, commits, _count: { commits: db.commits.filter((c) => c.branchId === row.id).length } };
      },
      delete: async ({ where }: any) => {
        const idx = db.branches.findIndex((b) => b.id === where.id);
        return db.branches.splice(idx, 1)[0];
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
      count: async ({ where }: any) =>
        db.commits.filter((c) => (where.branchId === undefined || c.branchId === where.branchId)).length,
      findMany: async ({ where }: any) =>
        db.commits.filter((c) => (where.branchId === undefined || c.branchId === where.branchId)),
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
      update: async ({ where, data }: any) => {
        const row = db.commits.find((c) => c.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    version: {
      findFirst: async ({ where, orderBy, include }: any) => {
        const rows = db.versions.filter(
          (v) =>
            (where.researchObjectId === undefined || v.researchObjectId === where.researchObjectId) &&
            (where.commitId === undefined || v.commitId === where.commitId),
        );
        if (orderBy?.versionNo === 'desc') rows.sort((a, b) => b.versionNo - a.versionNo);
        const row = rows[0] ?? null;
        if (!row || !include?.manifest) return row;
        const manifest = db.versionManifests.find((m) => m.versionId === row.id) ?? null;
        return {
          ...row,
          manifest: manifest
            ? { ...manifest, entries: db.manifestEntries.filter((e) => e.manifestId === manifest.id) }
            : null,
        };
      },
      findUnique: async ({ where, include }: any) => {
        const row = db.versions.find((v) => v.id === where.id) ?? null;
        if (!row) return null;
        const out: any = { ...row };
        if (include?.researchObject) {
          const ro = db.researchObjects.find((r) => r.id === row.researchObjectId) ?? null;
          out.researchObject = ro
            ? { ...ro, sdfDocument: db.sdfDocuments.find((d) => d.researchObjectId === ro.id) ?? null }
            : null;
        }
        if (include?.manifest) {
          const manifest = db.versionManifests.find((m) => m.versionId === row.id) ?? null;
          out.manifest = manifest
            ? { ...manifest, entries: db.manifestEntries.filter((e) => e.manifestId === manifest.id) }
            : null;
        }
        return out;
      },
      create: async ({ data }: any) => {
        const row = { id: nextId(), status: 'draft', createdAt: new Date(), ...data };
        db.versions.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.versions.find((v) => v.id === where.id);
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = db.versions.filter((v) =>
          (where.id === undefined || v.id === where.id) &&
          (where.status === undefined || v.status === where.status));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      count: async ({ where }: any) =>
        db.versions.filter((v) => (where.researchObjectId === undefined || v.researchObjectId === where.researchObjectId)).length,
      findMany: async ({ where }: any) =>
        db.versions.filter((v) => (where.researchObjectId === undefined || v.researchObjectId === where.researchObjectId)),
    },
    claimNode: {
      findMany: async ({ where }: any) =>
        db.claimNodes.filter((claim) =>
          (where.researchObjectId === undefined || claim.researchObjectId === where.researchObjectId) &&
          (where.versionId === undefined || claim.versionId === where.versionId),
        ),
      findFirst: async ({ where, orderBy }: any) => {
        const rows = db.claimNodes.filter((claim) =>
          (where.researchObjectId === undefined || claim.researchObjectId === where.researchObjectId) &&
          (where.versionId === undefined || claim.versionId === where.versionId));
        if (orderBy?.updatedAt === 'desc') rows.sort((a, b) => (b.updatedAt?.getTime?.() ?? 0) - (a.updatedAt?.getTime?.() ?? 0));
        return rows[0] ?? null;
      },
    },
    evidenceRecord: {
      findMany: async ({ where }: any) => db.evidenceRecords.filter((evidence) =>
        (where.researchObjectId === undefined || evidence.researchObjectId === where.researchObjectId) &&
        (where.versionId === undefined || evidence.versionId === where.versionId)),
      findFirst: async ({ where, orderBy }: any) => {
        const rows = db.evidenceRecords.filter((evidence) =>
          (where.researchObjectId === undefined || evidence.researchObjectId === where.researchObjectId) &&
          (where.versionId === undefined || evidence.versionId === where.versionId));
        if (orderBy?.updatedAt === 'desc') rows.sort((a, b) => (b.updatedAt?.getTime?.() ?? 0) - (a.updatedAt?.getTime?.() ?? 0));
        return rows[0] ?? null;
      },
    },
    presentationAsset: {
      findMany: async ({ where }: any) => db.presentationAssets.filter((asset) =>
        (where.researchObjectId === undefined || asset.researchObjectId === where.researchObjectId) &&
        (where.versionId === undefined || asset.versionId === where.versionId)),
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
    identifier: {
      count: async () => db.identifiers.length,
      create: async ({ data }: any) => {
        const row = { id: nextId(), ...data };
        db.identifiers.push(row);
        return row;
      },
    },
    publication: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), ...data };
        db.publications.push(row);
        return row;
      },
      findFirst: async ({ where }: any) =>
        db.publications.find((p) => (where.versionId === undefined || p.versionId === where.versionId)) ?? null,
    },
    visibilityGrant: {
      findUnique: async ({ where }: any) =>
        db.visibilityGrants.find(
          (g) => g.researchObjectId === where.researchObjectId_granteeId.researchObjectId && g.granteeId === where.researchObjectId_granteeId.granteeId,
        ) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const existing = db.visibilityGrants.find(
          (g) => g.researchObjectId === where.researchObjectId_granteeId.researchObjectId && g.granteeId === where.researchObjectId_granteeId.granteeId,
        );
        if (existing) return { ...existing, ...update };
        const row = { id: nextId(), createdAt: new Date(), ...create };
        db.visibilityGrants.push(row);
        return row;
      },
    },
    visibilityRequest: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), status: 'pending', createdAt: new Date(), ...data };
        db.visibilityRequests.push(row);
        return row;
      },
    },
    forkRelation: {
      findUnique: async ({ where }: any) =>
        db.forkRelations.find((f) => f.forkedRoId === where.forkedRoId) ?? null,
      create: async ({ data }: any) => {
        if (db.forkRelations.some((f) => f.forkedRoId === data.forkedRoId)) throw p2002();
        const row = { id: nextId(), createdAt: new Date(), ...data };
        db.forkRelations.push(row);
        return row;
      },
    },
    author: {
      findMany: async ({ where, include, orderBy }: any) => {
        const rows = db.authors.filter(
          (a) => (where.researchObjectId === undefined || a.researchObjectId === where.researchObjectId),
        );
        if (orderBy?.sortOrder === 'asc') rows.sort((a, b) => a.sortOrder - b.sortOrder);
        return rows.map((a) => {
          const user = db.users.find((u) => u.id === a.userId);
          return include?.user ? { ...a, user: { id: a.userId, displayName: user?.displayName ?? a.userId } } : a;
        });
      },
      createMany: async ({ data }: any) => {
        for (const d of Array.isArray(data) ? data : [data]) {
          db.authors.push({ id: nextId(), isCorresponding: false, createdAt: new Date(), ...d });
        }
        return { count: Array.isArray(data) ? data.length : 1 };
      },
      deleteMany: async ({ where }: any) => {
        const before = db.authors.length;
        db.authors = db.authors.filter((a) => a.researchObjectId !== where.researchObjectId);
        return { count: before - db.authors.length };
      },
    },
    contribution: {
      findFirst: async ({ where }: any) =>
        db.contributions.find(
          (c) =>
            (where.researchObjectId === undefined || c.researchObjectId === where.researchObjectId) &&
            (where.userId === undefined || c.userId === where.userId) &&
            (where.creditRole === undefined || c.creditRole === where.creditRole),
        ) ?? null,
      findMany: async ({ where, orderBy, select }: any) => {
        const rows = db.contributions.filter(
          (c) => (where.researchObjectId === undefined || c.researchObjectId === where.researchObjectId),
        );
        if (orderBy?.createdAt === 'asc') rows.sort((a, b) => a.createdAt - b.createdAt);
        if (select?.userId) return rows.map((c) => ({ userId: c.userId }));
        return rows;
      },
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), ...data };
        db.contributions.push(row);
        return row;
      },
    },
    agentSession: {
      create: async ({ data }: any) => {
        if (data.idempotencyKey && db.agentSessions.some((session) => session.idempotencyKey === data.idempotencyKey)) throw p2002('AgentSession', ['idempotency_key']);
        const row = { id: nextId(), status: 'active', createdAt: new Date(), updatedAt: new Date(), ...data };
        db.agentSessions.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const row = db.agentSessions.find((s) => where.id ? s.id === where.id : s.idempotencyKey === where.idempotencyKey) ?? null;
        if (!row) return null;
        return { ...row };
      },
      findFirst: async ({ where }: any) => db.agentSessions.find((session) =>
        where.researchObjectId === undefined || session.researchObjectId === where.researchObjectId,
      ) ?? null,
      delete: async ({ where }: any) => {
        const index = db.agentSessions.findIndex((session) => session.id === where.id);
        return db.agentSessions.splice(index, 1)[0];
      },
      findMany: async ({ where, orderBy }: any) => {
        const rows = db.agentSessions.filter((s) => (where.userId === undefined || s.userId === where.userId));
        if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
        return rows;
      },
    },
    agentTask: {
      create: async ({ data }: any) => {
        if (data.idempotencyKey && db.agentTasks.some((t) => t.idempotencyKey === data.idempotencyKey)) throw p2002('AgentTask', ['idempotency_key']);
        const row = { id: nextId(), status: 'pending', progress: 0, retryCount: 0, executionAttempt: 0, dispatchedAt: null, result: null, error: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        db.agentTasks.push(row);
        return row;
      },
      findUnique: async ({ where, include }: any) => {
        const row = db.agentTasks.find((t) =>
          (where.id ? t.id === where.id : t.idempotencyKey === where.idempotencyKey),
        ) ?? null;
        if (!row) return null;
        return agentTaskWithInclude(row, include);
      },
      findFirst: async ({ where, include, orderBy }: any) => {
        let rows = db.agentTasks.filter((task) => {
          return (where.sessionId === undefined || task.sessionId === where.sessionId)
            && agentTaskMatchesSession(task, where.session)
            && (where.kind === undefined || task.kind === where.kind)
            && (typeof where.status !== 'string' || task.status === where.status)
            && (where.status?.in === undefined || where.status.in.includes(task.status))
            && (where.retryCount === undefined || task.retryCount === where.retryCount)
            && (where.error?.not?.startsWith === undefined || !task.error?.startsWith(where.error.not.startsWith))
            && (where.payload?.path?.[0] === undefined || task.payload?.[where.payload.path[0]] === where.payload.equals);
        });
        const order = Array.isArray(orderBy) ? orderBy : [orderBy];
        if (order[0]?.updatedAt === 'desc') rows = rows.sort((left, right) => {
          const byUpdated = right.updatedAt.getTime() - left.updatedAt.getTime();
          return byUpdated || (order[1]?.id === 'desc' ? right.id.localeCompare(left.id) : 0);
        });
        const row = rows[0] ?? null;
        return row ? agentTaskWithInclude(row, include) : null;
      },
      update: async ({ where, data }: any) => {
        const row = db.agentTasks.find((t) => t.id === where.id);
        Object.assign(row, { ...data, ...(data.result === Prisma.JsonNull ? { result: null } : {}) }, { updatedAt: new Date() });
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = db.agentTasks.filter((task) =>
          (where.id === undefined || task.id === where.id) &&
          (where.dispatchedAt === undefined || task.dispatchedAt === where.dispatchedAt) &&
          (where.kind === undefined || task.kind === where.kind) &&
          (where.retryCount === undefined || task.retryCount === where.retryCount) &&
          (where.executionAttempt === undefined || task.executionAttempt === where.executionAttempt) &&
          (where.error === undefined || task.error === where.error) &&
          (typeof where.status !== 'string' || task.status === where.status) &&
          (where.status?.in === undefined || where.status.in.includes(task.status)),
        );
        rows.forEach((row) => {
          const executionAttempt = data.executionAttempt?.increment
            ? row.executionAttempt + data.executionAttempt.increment
            : (data.executionAttempt ?? row.executionAttempt);
          Object.assign(row, { ...data, ...(data.result === Prisma.JsonNull ? { result: null } : {}), executionAttempt, updatedAt: new Date() });
        });
        return { count: rows.length };
      },
      findMany: async ({ where, include, orderBy, take }: any) => {
        let rows = db.agentTasks.filter((t) =>
          agentTaskMatchesSession(t, where.session) &&
          (where.kind === undefined || (typeof where.kind === 'string' ? t.kind === where.kind : where.kind.in.includes(t.kind))) &&
          (where.dispatchedAt === undefined || t.dispatchedAt === where.dispatchedAt) &&
          (typeof where.status !== 'string' || t.status === where.status),
        );
        if (where.status?.in) rows = rows.filter((task) => where.status.in.includes(task.status));
        if (orderBy?.createdAt === 'asc') rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        if (typeof take === 'number') rows = rows.slice(0, take);
        if (include?.session) rows = rows.map((task) => agentTaskWithInclude(task, include));
        if (include?.approvals) {
          rows = rows.filter((t) => db.toolApprovals.some((a) => a.taskId === t.id && a.status === (include.approvals.where?.status ?? a.status)));
          rows = rows.map((t) => ({
            ...t,
            approvals: db.toolApprovals.filter((a) => a.taskId === t.id && a.status === (include.approvals.where?.status ?? a.status)),
          }));
        }
        return rows;
      },
    },
    ingestionBatch: {
      create: async ({ data }: any) => {
        if (data.idempotencyKey && db.ingestionBatches.some((batch) => batch.idempotencyKey === data.idempotencyKey)) throw p2002();
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
        db.ingestionBatches.push(row);
        return row;
      },
      findUnique: async ({ where, include }: any) => {
        const row = db.ingestionBatches.find((batch) => where.id ? batch.id === where.id : batch.idempotencyKey === where.idempotencyKey) ?? null;
        if (!row || !include) return row;
        const researchObject = db.researchObjects.find((ro) => ro.id === row.researchObjectId) ?? null;
        let tasks = db.ingestionTasks.filter((task) => task.batchId === row.id);
        if (include.tasks?.orderBy?.createdAt === 'asc') tasks = tasks.sort((a, b) => a.createdAt - b.createdAt);
        if (include.tasks?.include?.artifact) tasks = tasks.map((task) => ({ ...task, artifact: db.artifacts.find((artifact) => artifact.id === task.artifactId) }));
        return { ...row, researchObject, tasks };
      },
      update: async ({ where, data }: any) => {
        const row = db.ingestionBatches.find((batch) => batch.id === where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    },
    ingestionTask: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), state: 'queued', retryCount: 0, error: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        db.ingestionTasks.push(row);
        return row;
      },
      findUnique: async ({ where, include }: any) => {
        const row = db.ingestionTasks.find((task) => where.id
          ? task.id === where.id
          : task.batchId === where.batchId_artifactId?.batchId && task.artifactId === where.batchId_artifactId?.artifactId) ?? null;
        if (!row || !include) return row;
        const batch = db.ingestionBatches.find((candidate) => candidate.id === row.batchId) ?? null;
        const researchObject = batch ? db.researchObjects.find((ro) => ro.id === batch.researchObjectId) : null;
        return {
          ...row,
          artifact: db.artifacts.find((artifact) => artifact.id === row.artifactId),
          agentTask: include.agentTask ? db.agentTasks.find((task) => task.id === row.agentTaskId) ?? null : undefined,
          batch: batch ? { ...batch, researchObject } : null,
        };
      },
      findMany: async ({ where, include, orderBy, take }: any) => {
        let rows = db.ingestionTasks.filter((task) => {
          const batch = db.ingestionBatches.find((candidate) => candidate.id === task.batchId);
          return (where?.batch?.userId === undefined || batch?.userId === where.batch.userId) &&
            (where?.state?.in === undefined || where.state.in.includes(task.state));
        });
        if (orderBy?.updatedAt === 'desc') {
          rows = rows.toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        }
        if (take !== undefined) rows = rows.slice(0, take);
        if (!include) return rows;
        return rows.map((row) => {
          const batch = db.ingestionBatches.find((candidate) => candidate.id === row.batchId) ?? null;
          const researchObject = batch ? db.researchObjects.find((ro) => ro.id === batch.researchObjectId) ?? null : null;
          return {
            ...row,
            artifact: db.artifacts.find((artifact) => artifact.id === row.artifactId),
            batch: batch ? { ...batch, researchObject } : null,
          };
        });
      },
      update: async ({ where, data, include }: any) => {
        const row = db.ingestionTasks.find((task) => task.id === where.id);
        const retryCount = data.retryCount?.increment ? row.retryCount + data.retryCount.increment : (data.retryCount ?? row.retryCount);
        Object.assign(row, { ...data, retryCount, updatedAt: new Date() });
        return include?.artifact ? { ...row, artifact: db.artifacts.find((artifact) => artifact.id === row.artifactId) } : { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = db.ingestionTasks.filter((task) =>
          (where.agentTaskId === undefined || task.agentTaskId === where.agentTaskId) &&
          (where.id === undefined || task.id === where.id) &&
          (where.state === undefined || task.state === where.state),
        );
        rows.forEach((row) => {
          const retryCount = data.retryCount?.increment ? row.retryCount + data.retryCount.increment : (data.retryCount ?? row.retryCount);
          Object.assign(row, { ...data, retryCount, updatedAt: new Date() });
        });
        return { count: rows.length };
      },
    },
    toolApproval: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), status: 'pending', prompt: {}, createdAt: new Date(), updatedAt: new Date(), ...data };
        db.toolApprovals.push(row);
        return row;
      },
      findUnique: async ({ where, include }: any) => {
        const row = db.toolApprovals.find((a) => a.id === where.id) ?? null;
        if (!row) return null;
        if (include?.task) {
          const task = db.agentTasks.find((t) => t.id === row.taskId) ?? null;
          return {
            ...row,
            task: task
              ? { ...task, session: db.agentSessions.find((s) => s.id === task.sessionId) ?? null }
              : null,
          };
        }
        return { ...row };
      },
      findFirst: async ({ where }: any) =>
        db.toolApprovals.find((a) =>
          (where.taskId === undefined || a.taskId === where.taskId) &&
          (where.scope === undefined || a.scope === where.scope) &&
          (where.status === undefined || a.status === where.status),
        ) ?? null,
      update: async ({ where, data }: any) => {
        const row = db.toolApprovals.find((a) => a.id === where.id);
        // Prisma 语义：undefined 字段忽略（fake 需对齐，否则 scope:undefined 覆盖）
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) row[k] = v;
        }
        row.updatedAt = new Date();
        return { ...row };
      },
    },
    aiReview: {
      upsert: async ({ where, create, update }: any) => {
        const existing = db.aiReviews.find((r) => r.versionId === where.versionId);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = { id: nextId(), hardBlocks: [], warnings: [], createdAt: new Date(), ...create };
        db.aiReviews.push(row);
        return { ...row };
      },
      findUnique: async ({ where }: any) => db.aiReviews.find((r) => r.versionId === where.versionId) ?? null,
      update: async ({ where, data }: any) => {
        const row = db.aiReviews.find((review) => review.versionId === where.versionId);
        if (!row) throw new Error('AIReview not found');
        Object.assign(row, data);
        return { ...row };
      },
      findFirst: async ({ where }: any) => db.agentTasks.find((task) =>
        where.sessionId === undefined || task.sessionId === where.sessionId,
      ) ?? null,
      updateMany: async ({ where, data }: any) => {
        const rows = db.aiReviews.filter((review) =>
          (where.versionId === undefined || review.versionId === where.versionId) &&
          (where.status === undefined || review.status === where.status));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    appeal: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), status: 'pending', resolvedAt: null, createdAt: new Date(), ...data };
        db.appeals.push(row);
        return row;
      },
      findFirst: async ({ where }: any) =>
        db.appeals.find((a) =>
          (where.versionId === undefined || a.versionId === where.versionId) &&
          (where.status === undefined || a.status === where.status),
        ) ?? null,
      findUnique: async ({ where }: any) => db.appeals.find((a) => a.id === where.id) ?? null,
      findMany: async ({ where, orderBy }: any) => {
        const rows = db.appeals.filter((a) =>
          (where.appellantId === undefined || a.appellantId === where.appellantId),
        );
        if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
        return rows;
      },
      update: async ({ where, data }: any) => {
        const row = db.appeals.find((a) => a.id === where.id);
        Object.assign(row, data);
        return { ...row };
      },
    },
    pullRequest: {
      count: async ({ where }: any) =>
        db.pullRequests.filter(
          (pr) =>
            (where.sourceBranchId === undefined || pr.sourceBranchId === where.sourceBranchId) &&
            (where.targetBranchId === undefined || pr.targetBranchId === where.targetBranchId) &&
            (where.OR === undefined ||
              where.OR.some((o: any) =>
                (o.sourceBranchId === undefined || pr.sourceBranchId === o.sourceBranchId) &&
                (o.targetBranchId === undefined || pr.targetBranchId === o.targetBranchId),
              )),
        ).length,
      findFirst: async ({ where, include }: any) => {
        const row = db.pullRequests.find((pr) =>
          (where.id === undefined || pr.id === where.id) &&
          (where.researchObjectId === undefined || pr.researchObjectId === where.researchObjectId) &&
          (where.status === undefined || pr.status === where.status),
        ) ?? null;
        if (!row || !include?._count) return row;
        return { ...row, _count: { comments: db.comments.filter((c) => c.prId === row.id).length } };
      },
      findUnique: async ({ where, include }: any) => {
        const row = db.pullRequests.find((pr) =>
          (where.id ? pr.id === where.id : pr.idempotencyKey === where.idempotencyKey),
        ) ?? null;
        if (!row) return null;
        const out: any = { ...row };
        if (include?._count) out._count = { comments: db.comments.filter((c) => c.prId === row.id).length };
        if (include?.researchObject) out.researchObject = db.researchObjects.find((r) => r.id === row.researchObjectId) ?? null;
        if (include?.targetBranch) out.targetBranch = db.branches.find((b) => b.id === row.targetBranchId) ?? null;
        return out;
      },
      update: async ({ where, data }: any) => {
        const row = db.pullRequests.find((pr) => pr.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ where, include, orderBy }: any) => {
        const rows = db.pullRequests.filter(
          (pr) =>
            (where.researchObjectId === undefined || pr.researchObjectId === where.researchObjectId) &&
            (where.status === undefined || pr.status === where.status),
        );
        if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
        return rows.map((pr) => ({
          ...pr,
          _count: include?._count ? { comments: db.comments.filter((c) => c.prId === pr.id).length } : undefined,
        }));
      },
      create: async ({ data }: any) => {
        if (data.idempotencyKey && db.pullRequests.some((pr) => pr.idempotencyKey === data.idempotencyKey)) throw p2002();
        const row = { id: nextId(), status: 'open', createdAt: new Date(), ...data };
        db.pullRequests.push(row);
        return row;
      },
    },
    notification: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), read: false, createdAt: new Date(), ...data };
        db.notifications.push(row);
        return row;
      },
      findMany: async ({ where, orderBy, skip, take }: any) => {
        let rows = db.notifications.filter(
          (n) =>
            (where.userId === undefined || n.userId === where.userId) &&
            (where.type === undefined || n.type === where.type) &&
            (where.read === undefined || n.read === where.read),
        );
        if (orderBy?.[0]?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
        if (orderBy?.[0]?.read === 'asc') rows.sort((a, b) => (a.read ? 1 : 0) - (b.read ? 1 : 0));
        if (skip) rows = rows.slice(skip);
        if (take !== undefined) rows = rows.slice(0, take);
        return rows;
      },
      findUnique: async ({ where }: any) => db.notifications.find((n) => n.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = db.notifications.find((n) => n.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    review: {
      findFirst: async ({ where, include }: any) => {
        const row = db.reviews.find((r) => r.id === where.id) ?? null;
        if (!row || !include?.pr) return row;
        const pr = db.pullRequests.find((p) => p.id === row.prId);
        return { ...row, pr: pr ? { researchObjectId: pr.researchObjectId } : null };
      },
      findMany: async ({ where, orderBy }: any) => {
        const rows = db.reviews.filter(
          (r) => (where.prId === undefined || r.prId === where.prId),
        );
        if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
        return rows;
      },
      create: async ({ data }: any) => {
        const row = { id: nextId(), items: [], body: '', createdAt: new Date(), ...data };
        db.reviews.push(row);
        return row;
      },
    },
    issue: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), status: 'open', createdAt: new Date(), updatedAt: new Date(), ...data };
        db.issues.push(row);
        return row;
      },
      findMany: async ({ where, include, orderBy }: any) => {
        const rows = db.issues.filter(
          (i) =>
            (where.researchObjectId === undefined || i.researchObjectId === where.researchObjectId) &&
            (where.kind === undefined || i.kind === where.kind) &&
            (where.status === undefined || i.status === where.status),
        );
        if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
        return rows.map((i) => ({
          ...i,
          _count: include?._count?.select?.comments ? { comments: db.comments.filter((c) => c.issueId === i.id).length } : undefined,
        }));
      },
      findFirst: async ({ where, include }: any) => {
        const row = db.issues.find(
          (i) =>
            (where.id === undefined || i.id === where.id) &&
            (where.researchObjectId === undefined || i.researchObjectId === where.researchObjectId),
        ) ?? null;
        if (!row || !include) return row;
        const comments = db.comments
          .filter((c) => c.issueId === row.id)
          .sort((a, b) => a.createdAt - b.createdAt);
        const commentRows = include.comments?.include?.author
          ? comments.map((c) => ({ ...c, author: { id: c.authorId } }))
          : comments;
        return {
          ...row,
          comments: commentRows,
          _count: { comments: comments.length },
        };
      },
      update: async ({ where, data }: any) => {
        const row = db.issues.find((i) => i.id === where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    comment: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), ...data };
        db.comments.push(row);
        return row;
      },
      count: async ({ where }: any) =>
        db.comments.filter((c) =>
          (where.issueId === undefined || c.issueId === where.issueId) &&
          (where.prId === undefined || c.prId === where.prId),
        ).length,
    },
    licenseAssignment: {
      findFirst: async ({ where }: any) =>
        db.licenseAssignments.find(
          (l) =>
            (where.researchObjectId === undefined || l.researchObjectId === where.researchObjectId) &&
            ((where.versionId ?? null) === (l.versionId ?? null)) &&
            (where.licenseType === undefined || l.licenseType === where.licenseType),
        ) ?? null,
      findMany: async ({ where }: any) =>
        db.licenseAssignments.filter(
          (l) =>
            (where.researchObjectId === undefined || l.researchObjectId === where.researchObjectId) &&
            ((where.versionId ?? null) === (l.versionId ?? null)),
        ),
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), ...data };
        db.licenseAssignments.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.licenseAssignments.find((l) => l.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      let release!: () => void;
      const previous = transactionQueue;
      transactionQueue = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const refs = Object.fromEntries(Object.entries(db)) as Record<string, any[]>;
      const snapshot = structuredClone(db) as Record<string, any[]>;
      const tx = { ...prisma };
      delete tx.$transaction;
      try {
        return await fn(tx);
      } catch (error) {
        for (const [key, rows] of Object.entries(snapshot)) {
          refs[key].splice(0, refs[key].length, ...rows);
          (db as unknown as Record<string, any[]>)[key] = refs[key];
        }
        throw error;
      } finally {
        release();
      }
    },
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
