import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceRetrieveHandler } from '../../src/retrieval/handler';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused Prisma/storage replay fake */

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_ID = '44444444-4444-4444-8444-444444444444';
const RIGHTS_ID = '55555555-5555-4555-8555-555555555555';

afterEach(() => vi.useRealTimers());

describe('source.retrieve handler replay safety', () => {
  it('returns auth-required after durable observation exhausts its three transaction attempts', async () => {
    let transactionAttempts = 0;
    const prisma: any = {
      agentTask: { findUnique: async () => ({
        id: TASK_ID,
        kind: 'source.retrieve',
        status: 'running',
        session: {
          userId: USER_ID,
          researchObject: { workspaceId: WORKSPACE_ID, workspace: { status: 'active' } },
        },
      }) },
      membership: { findUnique: async () => ({ workspaceId: WORKSPACE_ID, userId: USER_ID }) },
      externalSource: { upsert: async ({ create }: any) => ({
        id: SOURCE_ID,
        provider: create.provider,
        title: create.title,
        sourceUrl: create.sourceUrl,
        doi: create.doi,
        arxivId: create.arxivId,
      }) },
      sourceRightsDecision: { upsert: async () => ({ id: RIGHTS_ID }) },
      $transaction: async () => {
        transactionAttempts += 1;
        throw Object.assign(new Error('serialization retry exhausted'), { code: 'P2034' });
      },
    };
    const handler = createSourceRetrieveHandler({
      queryHmacSecret: 'retrieval-query-test-secret-at-least-32-bytes',
      semanticScholar: { search: async () => ({
        status: 'succeeded',
        provider: 'semantic_scholar',
        sources: [{
          provider: 'semantic_scholar',
          providerRecordId: 'metadata-1',
          title: 'Metadata survives provider observation failure',
          sourceUrl: 'https://example.org/metadata-1',
          authors: [],
          identifiers: {},
          access: { kind: 'open_access', license: 'CC-BY-4.0' },
        }],
      }) },
      tavily: { search: vi.fn() },
      scansci: { acquire: async () => ({
        status: 'unavailable', provider: 'scansci', code: 'auth_required', retryable: false,
      }) },
    });

    const result = await handler({ prisma } as any, {
      id: TASK_ID,
      payload: {
        query: 'paper', providers: ['scansci'], limit: 1, includeFullText: true,
        identifier: '10.1000/test', retryContractVersion: 1,
      },
    });

    expect(result).toMatchObject({
      sources: [],
      providers: [{ provider: 'scansci', status: 'unavailable', code: 'auth_required' }],
    });
    expect(transactionAttempts).toBe(3);
  });

  it('reuses the task-scoped rights row and active temporary document', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-30T00:00:00.000Z'));
    const bytes = Buffer.from('%PDF-replay-safe');
    const hash = 'a'.repeat(64);
    let temporaryDocument: Record<string, any> | null = null;
    const putObject = vi.fn(async (key: string) => ({ key, size: bytes.length, etag: 'etag' }));
    const rightsUpsert = vi.fn(async () => ({ id: RIGHTS_ID }));
    const temporaryCreate = vi.fn(async ({ data }: any) => {
      temporaryDocument = { ...data };
      return temporaryDocument;
    });
    const prisma: any = {
      agentTask: { findUnique: async () => ({
        id: TASK_ID,
        kind: 'source.retrieve',
        status: 'running',
        session: {
          userId: USER_ID,
          researchObject: { workspaceId: WORKSPACE_ID, workspace: { status: 'active' } },
        },
      }) },
      membership: { findUnique: async () => ({ workspaceId: WORKSPACE_ID, userId: USER_ID }) },
      externalSource: { upsert: async ({ create }: any) => ({
        id: SOURCE_ID,
        provider: create.provider,
        title: create.title,
        sourceUrl: create.sourceUrl,
        doi: '10.5555/persisted-row',
        arxivId: '2401.01234',
      }) },
      sourceRightsDecision: { upsert: rightsUpsert },
      temporaryDocument: {
        findUnique: async () => temporaryDocument,
        create: temporaryCreate,
        updateMany: async ({ where, data }: any) => {
          if (!temporaryDocument || temporaryDocument.id !== where.id || temporaryDocument.state !== where.state) return { count: 0 };
          Object.assign(temporaryDocument, data);
          return { count: 1 };
        },
      },
    };
    prisma.$transaction = async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma);
    prisma.$executeRaw = async () => 1;
    prisma.$queryRaw = async () => [];
    const storage: any = {
      headObject: async () => null,
      putObject,
      getObject: vi.fn(),
      deleteObject: vi.fn(),
    };
    const handler = createSourceRetrieveHandler({
      queryHmacSecret: 'retrieval-query-test-secret-at-least-32-bytes',
      semanticScholar: { search: vi.fn() },
      tavily: { search: vi.fn() },
      scansci: { acquire: async () => ({
        status: 'succeeded',
        provider: 'scansci',
        route: 'open_access',
        sourceUrl: 'https://publisher.example/paper',
        bytes,
        contentHash: hash,
        mimeType: 'application/pdf',
        access: { kind: 'open_access', license: 'CC-BY-4.0' },
      }) },
    });
    const deps: any = { prisma, storage, malwareScanner: async () => undefined };
    const task = {
      id: TASK_ID,
      payload: {
        query: 'paper', providers: ['scansci'], limit: 1, includeFullText: true,
        identifier: '10.1000/test', retryContractVersion: 1,
      },
    };

    const first = await handler(deps, task);
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const second = await handler(deps, task);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      sources: [{
        id: SOURCE_ID,
        identifiers: { doi: '10.5555/persisted-row', arxiv: '2401.01234' },
        temporaryDocumentId: expect.any(String),
        expiresAt: '2026-09-02T00:00:00.000Z',
      }],
    });
    expect(rightsUpsert).toHaveBeenCalledTimes(2);
    expect(temporaryCreate).toHaveBeenCalledTimes(1);
    expect(putObject).toHaveBeenCalledTimes(1);
    expect(temporaryDocument).toMatchObject({ agentTaskId: TASK_ID, state: 'active' });
  });

  it('rejects an unmarked persisted task before reading authority or invoking providers', async () => {
    const findUnique = vi.fn();
    const acquire = vi.fn();
    const handler = createSourceRetrieveHandler({
      queryHmacSecret: 'retrieval-query-test-secret-at-least-32-bytes',
      semanticScholar: { search: vi.fn() },
      tavily: { search: vi.fn() },
      scansci: { acquire },
    });
    await expect(handler({ prisma: { agentTask: { findUnique } } } as any, {
      id: TASK_ID,
      payload: { query: 'paper', providers: ['scansci'], limit: 1, includeFullText: true, identifier: '10.1000/test' },
    })).rejects.toThrow(/durable.*incomplete/i);
    expect(findUnique).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
  });
});
