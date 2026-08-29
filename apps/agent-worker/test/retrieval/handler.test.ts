import { describe, expect, it, vi } from 'vitest';
import { createSourceRetrieveHandler } from '../../src/retrieval/handler';

/* eslint-disable @typescript-eslint/no-explicit-any -- focused Prisma/storage replay fake */

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_ID = '44444444-4444-4444-8444-444444444444';
const RIGHTS_ID = '55555555-5555-4555-8555-555555555555';

describe('source.retrieve handler replay safety', () => {
  it('reuses the task-scoped rights row and active temporary document', async () => {
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
        query: 'paper', providers: ['scansci'], limit: 1, includeFullText: true, identifier: '10.1000/test',
      },
    };

    const first = await handler(deps, task);
    const second = await handler(deps, task);

    expect(first).toEqual(second);
    expect(rightsUpsert).toHaveBeenCalledTimes(2);
    expect(temporaryCreate).toHaveBeenCalledTimes(1);
    expect(putObject).toHaveBeenCalledTimes(1);
    expect(temporaryDocument).toMatchObject({ agentTaskId: TASK_ID, state: 'active' });
  });
});
