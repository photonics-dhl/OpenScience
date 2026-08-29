import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from './helpers/fakes';
import { authorizeIngestionWrite, createIngestionBatch, getIngestionBatch, getIngestionTask, listActionableIngestionTasks, retryIngestionTask } from '../src/ingestion/ingestion-service';
import { markTaskProgress } from '../src/agent/agent';

const TEST_RO_ID = '00000000-0000-4000-8000-000000000101';

function makeDeps() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  db.workspaces.push({ id: 'ws-1', type: 'personal', name: 'Personal', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() });
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  db.researchObjects.push({ id: TEST_RO_ID, workspaceId: 'ws-1', createdBy: user.id, title: 'Study', status: 'draft', visibility: 'private', version: 1, createdAt: new Date(), updatedAt: new Date() });
  db.usageLedger.push({ id: 'credit-1', userId: user.id, workspaceId: null, resource: 'ai_credit', delta: 100, reason: 'test', createdAt: new Date() });
  const objects = new Map<string, Buffer>();
  const storage: StorageAdapter = {
    putObject: vi.fn(async (key, body) => {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(await (body as NodeJS.ReadableStream).toArray());
      objects.set(key, buffer);
      return { key, size: buffer.length, etag: 'test' };
    }),
    getObject: vi.fn(async (key) => ({ body: Readable.from([objects.get(key) ?? Buffer.alloc(0)]), size: objects.get(key)?.length ?? 0 })),
    headObject: vi.fn(async (key) => objects.has(key) ? { size: objects.get(key)!.length, etag: 'test' } : null),
    deleteObject: vi.fn(async (key) => void objects.delete(key)),
  };
  const redis = { lpush: vi.fn().mockResolvedValue(1) };
  return { db, user, deps: { prisma, storage, redis } as never, redis };
}

const file = (filename: string) => {
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  const content = extension === '.pdf' ? Buffer.from('%PDF-1.7\nresearch evidence')
    : extension === '.png' ? Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('image')])
      : extension === '.jpg' || extension === '.jpeg' ? Buffer.concat([Buffer.from([255, 216, 255]), Buffer.from('image')])
        : extension === '.webp' ? Buffer.concat([Buffer.from('RIFF0000WEBP'), Buffer.from('image')])
          : extension === '.doc' ? Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.from('word')])
            : extension === '.docx' || extension === '.zip' ? Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('zip')])
              : Buffer.from(`content:${filename}`);
  return { filename, content };
};

describe('multi-format ingestion service', () => {
  it.each([
    'paper.pdf', 'paper.docx', 'source.tex', 'notes.md', 'figure.png',
    'measurements.csv', 'metadata.json', 'workflow.yaml', 'analysis.ipynb', 'fit.py', 'statistics.r',
  ])('accepts %s and queues extraction without raw content in payload', async (filename) => {
    const { deps, db, user } = makeDeps();
    const result = await createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file(filename)], idempotencyKey: `batch:${filename}` });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({ logicalPath: filename, state: 'queued' });
    expect(db.agentTasks[0].payload).toEqual({ artifactId: result.tasks[0].artifactId, researchObjectId: TEST_RO_ID });
    expect(db.agentTasks[0].interestContext).toMatchObject({ activeResearchObjectId: TEST_RO_ID, primaryIdentity: 'reader' });
    expect(JSON.stringify(db.agentTasks[0].payload)).not.toContain(`content:${filename}`);
  });

  it('requires explicit processing consent before persisting anything', async () => {
    const { deps, db, user } = makeDeps();
    await expect(createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: false, files: [file('paper.pdf')] })).rejects.toMatchObject({ code: 'PROCESSING_CONSENT_REQUIRED' });
    expect(db.artifacts).toHaveLength(0);
  });

  it('rejects unsupported formats with a typed error', async () => {
    const { deps, user } = makeDeps();
    await expect(createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('malware.exe')] })).rejects.toMatchObject({ code: 'UNSUPPORTED_INGESTION_FORMAT' });
  });

  it('rejects a supported extension with an executable MIME mismatch', async () => {
    const { deps, user } = makeDeps();
    await expect(createIngestionBatch(deps, {
      userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true,
      files: [{ ...file('paper.pdf'), mimeType: 'application/x-msdownload' }],
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_INGESTION_FORMAT' });
  });

  it.each([
    ['paper.pdf', Buffer.from('not a pdf')],
    ['figure.png', Buffer.from('not an image')],
    ['notes.md', Buffer.from('unsafe\u0000text')],
    ['measurements.csv', Buffer.from('unsafe\u0000text')],
    ['analysis.ipynb', Buffer.from('MZ\u0000executable')],
    ['figure.svg', Buffer.from('<svg><script>alert(1)</script></svg>')],
    ['paper.docx', Buffer.from('MZ\u0000executable')],
  ])('rejects content masquerading as %s', async (filename, content) => {
    const { deps, user } = makeDeps();
    await expect(createIngestionBatch(deps, {
      userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [{ filename, content }],
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_INGESTION_FORMAT' });
  });

  it('blocks the EICAR test signature before creating an Artifact', async () => {
    const { deps, db, user } = makeDeps();
    await expect(createIngestionBatch(deps, {
      userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true,
      files: [{ filename: 'notes.md', content: Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*') }],
    })).rejects.toMatchObject({ code: 'MALICIOUS_FILE' });
    expect(db.artifacts).toHaveLength(0);
  });

  it('does not persist an untrusted browser MIME as detected metadata', async () => {
    const { deps, db, user } = makeDeps();
    await createIngestionBatch(deps, {
      userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true,
      files: [{ ...file('notes.md'), mimeType: 'text/markdown' }],
    });
    expect(db.artifacts[0].mimeType).toBeNull();
  });

  it('disambiguates duplicate filenames and rejects path-like names before creating a batch', async () => {
    const { deps, db, user } = makeDeps();
    const result = await createIngestionBatch(deps, {
      userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true,
      files: [file('paper.pdf'), file('paper.pdf')],
    });
    expect(result.tasks.map((task) => task.logicalPath)).toEqual(['paper.pdf', 'paper (2).pdf']);
    await expect(createIngestionBatch(deps, {
      userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('../paper.pdf')],
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(db.ingestionBatches).toHaveLength(1);
  });

  it('enforces workspace membership on create and read', async () => {
    const { deps, db, user } = makeDeps();
    const result = await createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('paper.pdf')] });
    const outsider = seedUser(db, { id: 'outsider' });
    await expect(getIngestionBatch(deps, { userId: outsider.id, batchId: result.batchId })).rejects.toThrow(/空间不存在/);
  });

  it('keeps the internal SourceMap object key out of ingestion API results', async () => {
    const { deps, db, user } = makeDeps();
    const batch = await createIngestionBatch(deps, {
      userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('paper.pdf')],
    });
    const ingestionTask = db.ingestionTasks.find((row) => row.id === batch.tasks[0].id)!;
    const agentTask = db.agentTasks.find((row) => row.id === ingestionTask.agentTaskId)!;
    agentTask.result = {
      core: { title: 'Parsed title' },
      sourceMapRef: { objectKey: 'derived/source-maps/internal.json', serializedSha256: 'secret-internal-digest' },
    };

    const response = await getIngestionTask(deps, { userId: user.id, taskId: ingestionTask.id });

    expect(response.task.result).toEqual({ core: { title: 'Parsed title' }, sourceMapAvailable: true });
    expect(JSON.stringify(response)).not.toContain('derived/source-maps');
    expect(JSON.stringify(response)).not.toContain('secret-internal-digest');
  });

  it('lists the caller-owned ingestion task id and RO context for dashboard review links', async () => {
    const { deps, db, user } = makeDeps();
    const result = await createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('paper.pdf')] });
    db.ingestionTasks[0].state = 'needs_review';

    await expect(listActionableIngestionTasks(deps, { userId: user.id })).resolves.toEqual([
      expect.objectContaining({
        id: result.tasks[0].id,
        researchObjectId: TEST_RO_ID,
        researchTitle: 'Study',
        logicalPath: 'paper.pdf',
        state: 'needs_review',
      }),
    ]);
    await expect(listActionableIngestionTasks(deps, { userId: 'another-user' })).resolves.toEqual([]);
  });

  it.each(['viewer', 'reviewer'])('rejects %s ingestion writes', async (role) => {
    const { deps, db, user } = makeDeps();
    db.memberships[0].role = role;
    await expect(authorizeIngestionWrite(deps, { userId: user.id, researchObjectId: TEST_RO_ID }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createIngestionBatch(deps, {
      userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('notes.md')],
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.ingestionBatches).toHaveLength(0);
  });

  it('rejects writes to an archived workspace', async () => {
    const { deps, db, user } = makeDeps();
    db.workspaces[0].status = 'archived';
    await expect(authorizeIngestionWrite(deps, { userId: user.id, researchObjectId: TEST_RO_ID }))
      .rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
    expect(db.ingestionBatches).toHaveLength(0);
  });

  it('retries only failed_retryable tasks and requeues the existing agent task', async () => {
    const { deps, db, user, redis } = makeDeps();
    const result = await createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('paper.pdf')] });
    const task = db.ingestionTasks.find((row) => row.id === result.tasks[0].id);
    task.state = 'failed_retryable';
    task.error = 'provider timeout';
    const retried = await retryIngestionTask(deps, { userId: user.id, taskId: task.id });
    expect(retried).toMatchObject({ state: 'queued', retryCount: 1, error: null });
    expect(redis.lpush).toHaveBeenLastCalledWith('agent:queue', task.agentTaskId);
    await expect(retryIngestionTask(deps, { userId: user.id, taskId: task.id })).rejects.toMatchObject({ code: 'INGESTION_NOT_RETRYABLE' });
  });

  it('retry dispatch 失败会恢复 failed_retryable 状态', async () => {
    const { deps, db, user, redis } = makeDeps();
    const result = await createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('paper.pdf')] });
    const task = db.ingestionTasks.find((row) => row.id === result.tasks[0].id)!;
    task.state = 'failed_retryable';
    redis.lpush.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(retryIngestionTask(deps, { userId: user.id, taskId: task.id })).rejects.toThrow(/redis unavailable/);
    expect(task.state).toBe('failed_retryable');
  });

  it('resumes the same batch idempotently without duplicating artifacts, sessions, or tasks', async () => {
    const { deps, db, user } = makeDeps();
    const input = { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('paper.pdf')], idempotencyKey: 'stable-batch' };
    const first = await createIngestionBatch(deps, input);
    const replay = await createIngestionBatch(deps, input);
    expect(replay.batchId).toBe(first.batchId);
    expect(db.ingestionBatches).toHaveLength(1);
    expect(db.agentSessions).toHaveLength(1);
    expect(db.agentTasks).toHaveLength(1);
    expect(db.artifacts).toHaveLength(1);
    expect(db.ingestionTasks).toHaveLength(1);
  });

  it('creates the ingestion association before dispatching its AgentTask', async () => {
    const { deps, db, user, redis } = makeDeps();
    redis.lpush.mockImplementation(async (_queue, agentTaskId) => {
      expect(db.ingestionTasks.some((task) => task.agentTaskId === agentTaskId)).toBe(true);
      return 1;
    });
    await createIngestionBatch(deps, {
      userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('notes.md')],
    });
  });

  it('rejects reuse of a batch key for a different material set', async () => {
    const { deps, user } = makeDeps();
    const base = { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, idempotencyKey: 'stable-batch' };
    await createIngestionBatch(deps, { ...base, files: [file('paper.pdf')] });
    await expect(createIngestionBatch(deps, { ...base, files: [file('changed.md')] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('mirrors worker progress into stable ingestion states', async () => {
    const { deps, db, user } = makeDeps();
    const result = await createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('paper.pdf')] });
    const agentTaskId = result.tasks[0].agentTaskId!;
    await markTaskProgress(deps, { taskId: agentTaskId, status: 'running', progress: 10 });
    expect(db.ingestionTasks[0].state).toBe('parsing');
    await markTaskProgress(deps, { taskId: agentTaskId, status: 'succeeded', progress: 100, result: { proposals: [] } });
    expect(db.ingestionTasks[0].state).toBe('needs_review');
  });
});
