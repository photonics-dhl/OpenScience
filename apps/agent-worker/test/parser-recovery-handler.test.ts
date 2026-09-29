import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { AiGateway } from '@openscience/ai-gateway';
import { createHandlers } from '../src/index';

function fixture() {
  const bytes = Buffer.from('%PDF-1.7 recovery fixture');
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const parser = { name: 'openscience-parser-cascade', version: '1.0.0' };
  const map = { artifactId: 'artifact', contentHash, parser, pages: [{ page: 18, width: 500, height: 700,
    blocks: [{ id: 'original', kind: 'paragraph', text: 'This source document preserves the original scientific observations and measurements.',
      boundingBox: { x: 0, y: 0, width: 500, height: 60 }, parser, transformations: [] }] }] };
  const serialized = Buffer.from(JSON.stringify(map));
  const digest = createHash('sha256').update(serialized).digest('hex');
  const reference = { schemaVersion: 1, parserStatus: 'needs_review', artifactId: 'artifact', contentHash,
    serializedSha256: digest, objectKey: `derived/source-maps/${digest}.json`, size: serialized.length };
  const payload = { artifactId: 'artifact', researchObjectId: 'ro' };
  const owner = { id: 'task', kind: 'sdf.extract', status: 'running', executionAttempt: 2, retryCount: 1,
    payload, result: { sourceMapRef: reference }, sessionId: 'session',
    session: { userId: 'actor', status: 'active', researchObject: { id: 'ro', workspaceId: 'workspace', workspace: { status: 'active' } } } };
  const metadata = { recovery: 'unresolved_parser_pages', agentTaskId: 'task', retryAttempt: 1,
    previousExecutionAttempt: 1, previousRetryCount: 0, previousAgentRetryCount: 0,
    previousParserResult: { status: 'needs_review', reason: 'unresolved pages remain', sourceMapRef: reference } };
  const stored = new Map([[reference.objectKey, serialized]]);
  const storage = {
    getObject: vi.fn(async (key: string) => { const body = stored.get(key) ?? bytes; return { body: Readable.from([body]), size: body.length }; }),
    headObject: vi.fn().mockResolvedValue(null),
    putObject: vi.fn(async (key: string, body: Buffer) => { stored.set(key, body); return { key, size: body.length, etag: 'test' }; }),
  };
  const tx = { $executeRaw: vi.fn(), artifact: { findFirst: vi.fn().mockResolvedValue({ id: 'artifact' }) },
    agentTask: { updateMany: vi.fn(async ({ data }: { data: { result: typeof owner.result } }) => { owner.result = data.result; return { count: 1 }; }) } };
  const prisma = {
    agentTask: { findUnique: vi.fn(async () => structuredClone(owner)) },
    artifact: { findUnique: vi.fn().mockResolvedValue({ id: 'artifact', workspaceId: 'workspace', size: bytes.length,
      blobSha256: contentHash, logicalPath: 'paper.pdf', mimeType: 'application/pdf' }) },
    membership: { findUnique: vi.fn().mockResolvedValue({ userId: 'actor', workspaceId: 'workspace', role: 'author' }) },
    ingestionTask: { findFirst: vi.fn().mockResolvedValue({ id: 'ingestion', agentTaskId: 'task', artifactId: 'artifact', state: 'parsing',
      retryCount: 1, batch: { userId: 'actor', researchObjectId: 'ro' } }) },
    auditLog: { findMany: vi.fn().mockResolvedValue([{ metadata }]) },
    hermesResearchStep: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const parserCascade = vi.fn().mockResolvedValue({ status: 'needs_review', sourceMap: map, reasons: ['unresolved pages remain'] });
  const science = vi.fn().mockRejectedValue(new Error('scientific fixture stop'));
  const gateway = { completeStructured: science, completeStructuredWithMetadata: science } as unknown as AiGateway;
  const handlers = createHandlers(gateway, { parserCascade, externalProcessingPolicy: async () => true });
  return { owner, metadata, map, reference, parserCascade, prisma, tx, gateway,
    execute: () => handlers['sdf.extract']!({ prisma, storage, malwareScanner: vi.fn() } as never,
      { id: 'task', payload, executionAttempt: 2, retryCount: 1 }) };
}

describe('partial parser handler', () => {
  it('loads the exact saved map into recovery rather than skipping parsing or rerunning native extraction', async () => {
    const f = fixture();
    const result = await f.execute();
    expect(result.status).toBe('needs_review');
    expect(f.parserCascade).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ resumeSourceMap: f.map }));
    expect(f.tx.agentTask.updateMany).not.toHaveBeenCalled();
  });
  it('persists the successful checkpoint before science and skips OCR after a later science failure', async () => {
    const f = fixture();
    f.parserCascade.mockResolvedValue({ status: 'succeeded', sourceMap: f.map, warnings: [] } as never);
    f.prisma.$transaction.mockImplementationOnce(async work => {
      await work(f.tx);
      throw new Error('simulated interruption after committed parser checkpoint');
    });
    await expect(f.execute()).rejects.toThrow('simulated interruption');
    expect(f.owner.result.sourceMapRef.parserStatus).toBe('succeeded');
    expect(f.tx.agentTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      OR: expect.arrayContaining([{ result: { equals: { sourceMapRef: f.reference } } }]),
    }) }));
    expect(f.gateway.completeStructured).not.toHaveBeenCalled();
    f.parserCascade.mockClear();
    await f.execute();
    expect(f.parserCascade).not.toHaveBeenCalled();
    expect(f.gateway.completeStructured).toHaveBeenCalled();
  });
  it('rejects an unreceipted partial checkpoint before parsing', async () => {
    const f = fixture(); f.prisma.auditLog.findMany.mockResolvedValue([]);
    await expect(f.execute()).rejects.toThrow(/receipt/);
    expect(f.parserCascade).not.toHaveBeenCalled();
  });
});
