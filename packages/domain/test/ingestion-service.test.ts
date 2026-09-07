import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '@openscience/storage';
import { createFakePrisma, seedUser } from './helpers/fakes';
import { authorizeIngestionWrite, confirmIngestionTask, createIngestionBatch, getIngestionBatch, getIngestionTask, getResearchObjectIngestion, listActionableIngestionTasks, retryIngestionTask } from '../src/ingestion/ingestion-service';
import { persistDocumentSourceMapReference } from '../src/research-intelligence/source-map-ref';
import { createCommit } from '../src/commit/commits';
import { updateClaim } from '../src/research-intelligence/claim-evidence-service';
import { markTaskProgress } from '../src/agent/agent';

const TEST_RO_ID = '00000000-0000-4000-8000-000000000101';
const CORE = { schemaVersion: '0.1.0', problem: 'Question', insight: '', method: '', results: '', limitations: '', reproducibility: '' };

async function confirmationFixture() {
  const fixture = makeDeps();
  const { deps, db, user } = fixture;
  Object.assign(deps.prisma.ingestionTask, { findUniqueOrThrow: async (args: Parameters<typeof deps.prisma.ingestionTask.findUnique>[0]) => deps.prisma.ingestionTask.findUnique(args) });
  db.sdfDocuments.push({ id: 'sdf-1', researchObjectId: TEST_RO_ID, coreJson: { ...CORE, problem: 'Before' } });
  for (const nodeType of Object.keys(CORE).filter(key => key !== 'schemaVersion')) db.sdfNodes.push({ id: nodeType, sdfDocumentId: 'sdf-1', nodeType, content: '' });
  const batch = await createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('notes.md')] });
  db.ingestionTasks[0].state = 'needs_review';
  return { ...fixture, input: { userId: user.id, taskId: batch.tasks[0].id, version: 1, core: CORE } };
}

describe('ingestion confirmation research record', () => {
  it('creates an immutable version with original material and replays the same result', async () => {
    const { deps, db, input } = await confirmationFixture();
    const first = await confirmIngestionTask(deps, input);
    expect(db.versions).toHaveLength(1);
    expect(db.manifestEntries[0].artifactId).toBe(db.artifacts[0].id);
    expect(first).toMatchObject({ confirmation: { versionId: db.versions[0].id, evidenceStatus: 'needs_review' } });
    expect(await confirmIngestionTask(deps, input)).toEqual(first);
    expect(db.versions).toHaveLength(1);
    expect(db.researchObjects[0].version).toBe(2);
  });

  it('rolls back every write when confirmation state cannot be claimed', async () => {
    const { deps, db, input } = await confirmationFixture();
    vi.spyOn(deps.prisma.ingestionTask, 'updateMany').mockResolvedValueOnce({ count: 0 });
    await expect(confirmIngestionTask(deps, input)).rejects.toThrow();
    expect(db.versions).toHaveLength(0);
    expect(db.commits).toHaveLength(0);
    expect(db.researchObjects[0].version).toBe(1);
    expect(db.sdfDocuments[0].coreJson.problem).toBe('Before');
  });

  it('rejects a stale version without partial writes', async () => {
    const { deps, db, input } = await confirmationFixture();
    await expect(confirmIngestionTask(deps, { ...input, version: 0 })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    expect(db.versions).toHaveLength(0);
    expect(db.ingestionTasks[0].state).toBe('needs_review');
  });

  it('retains earlier materials with colliding names and recovers confirmed imports without a task URL', async () => {
    const { deps, db, input } = await confirmationFixture();
    db.artifacts.push({ ...db.artifacts[0], id: 'previous-artifact' });
    await createCommit(deps, { researchObjectId: TEST_RO_ID, userId: input.userId, version: 1, message: 'Earlier material', artifacts: [{ logicalPath: 'notes.md', artifactId: 'previous-artifact' }] });
    const result = await confirmIngestionTask(deps, { ...input, version: 2 });
    const manifest = db.versionManifests.find(row => row.versionId === result.confirmation.versionId);
    const entries = db.manifestEntries.filter(row => row.manifestId === manifest.id);
    expect(entries.map(row => row.artifactId)).toEqual(['previous-artifact', db.artifacts[0].id]);
    expect(new Set(entries.map(row => row.logicalPath)).size).toBe(2);
    const recovered = await getResearchObjectIngestion(deps, { userId: input.userId, researchObjectId: TEST_RO_ID });
    expect(recovered.latestConfirmation).toEqual(result.confirmation);
    expect(recovered.tasks[0].state).toBe('confirmed');
    await expect(getResearchObjectIngestion(deps, { userId: 'outsider', researchObjectId: TEST_RO_ID })).rejects.toThrow();
  });

  it('simultaneous confirmation creates exactly one version', async () => {
    const { deps, db, input } = await confirmationFixture();
    const results = await Promise.all([confirmIngestionTask(deps, input), confirmIngestionTask(deps, input)]);
    expect(results[0]).toEqual(results[1]);
    expect(db.versions).toHaveLength(1);
  });

  it('keeps previous Claim/Evidence history and carries its graph as pending into the new version', async () => {
    const { deps, db, input } = await confirmationFixture();
    const prior = await createCommit(deps, { researchObjectId: TEST_RO_ID, userId: input.userId, version: 1,
      message: 'Prior record', artifacts: [{ logicalPath: 'notes.md', artifactId: db.artifacts[0].id }] });
    db.claimNodes.push({ id: 'old-claim', researchObjectId: TEST_RO_ID, versionId: prior.versionId, kind: 'core', statement: 'Earlier claim', assessment: 'supported', conditions: [], limitations: [], provenance: { source: 'human' }, extractionStatus: 'succeeded' });
    db.evidenceRecords.push({ id: 'old-evidence', researchObjectId: TEST_RO_ID, workspaceId: 'ws-1', versionId: prior.versionId, claimId: 'old-claim', artifactId: db.artifacts[0].id, kind: 'passage', title: 'Earlier source', exactQuote: 'Earlier quote', relation: 'supports', locator: {}, contentHash: db.artifacts[0].blobSha256, provenance: { source: 'human' }, extractionStatus: 'succeeded', verifiedByUserId: input.userId });
    const originals = structuredClone({ claim: db.claimNodes[0], evidence: db.evidenceRecords[0] });
    const next = await confirmIngestionTask(deps, { ...input, version: 2 });
    expect(db.claimNodes[0]).toEqual(originals.claim);
    expect(db.evidenceRecords[0]).toEqual(originals.evidence);
    expect(db.claimNodes[1]).toMatchObject({ versionId: next.confirmation.versionId, statement: 'Earlier claim', extractionStatus: 'needs_review' });
    expect(db.evidenceRecords[1]).toMatchObject({ versionId: next.confirmation.versionId, claimId: db.claimNodes[1].id, verifiedByUserId: null, extractionStatus: 'needs_review' });
  });

  it('enforces write permission on replay and keeps the original SDF snapshot after later edits', async () => {
    const { deps, db, input } = await confirmationFixture();
    const first = await confirmIngestionTask(deps, input);
    db.sdfDocuments[0].coreJson = { ...CORE, problem: 'Later work' };
    expect(await confirmIngestionTask(deps, { ...input, core: { ...CORE, problem: 'Replay changes' } })).toEqual(first);
    db.memberships[0].role = 'viewer';
    await expect(confirmIngestionTask(deps, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.versions).toHaveLength(1);
  });

  it.each(['exact', 'missing', 'ambiguous', 'edited', 'foreign'])('persists only verifiable source evidence: %s', async mode => {
    const { deps, db, input } = await confirmationFixture();
    const quote = 'Original source question.';
    const sourceMapRef = await persistDocumentSourceMapReference(deps.storage, {
      artifactId: mode === 'foreign' ? 'other-artifact' : db.artifacts[0].id,
      contentHash: db.artifacts[0].blobSha256, parser: { name: 'fixture', version: '1' },
      pages: [{ page: 1, width: 600, height: 800, blocks: [{ id: 'block-1', kind: 'paragraph',
        text: mode === 'ambiguous' ? `${quote} ${quote}` : quote,
        boundingBox: { x: 10, y: 20, width: 300, height: 30 }, parser: { name: 'fixture', version: '1' }, transformations: [] }] }],
    }, 'succeeded');
    db.agentTasks[0].result = { core: CORE, evidence: { problem: { quote: mode === 'missing' ? 'Invented quote' : quote, locator: 'page 999' } }, sourceMapRef };
    await confirmIngestionTask(deps, mode === 'edited' ? { ...input, core: { ...CORE, problem: 'Changed claim' } } : input);
    expect(db.evidenceRecords).toHaveLength(mode === 'exact' ? 1 : 0);
    if (mode === 'exact') {
      expect(db.evidenceRecords[0]).toMatchObject({ exactQuote: quote, extractionStatus: 'needs_review', verifiedByUserId: null, locator: { page: 1, blockId: 'block-1', charRange: { start: 0, end: quote.length } } });
      expect(db.claimNodes[0]).toMatchObject({ assessment: 'missing', extractionStatus: 'needs_review' });
    }
  });

  it.each(['method', 'limitations'])('imports an editable root claim for %s without inventing a parent', async field => {
    const { deps, db, input } = await confirmationFixture();
    const core = { ...CORE, [field]: 'Source-grounded statement' };
    const quote = 'Original source passage.';
    const sourceMapRef = await persistDocumentSourceMapReference(deps.storage, {
      artifactId: db.artifacts[0].id, contentHash: db.artifacts[0].blobSha256, parser: { name: 'fixture', version: '1' },
      pages: [{ page: 1, width: 600, height: 800, blocks: [{ id: 'source', kind: 'paragraph', text: quote,
        boundingBox: { x: 0, y: 0, width: 100, height: 20 }, parser: { name: 'fixture', version: '1' }, transformations: [] }] }],
    }, 'succeeded');
    db.agentTasks[0].result = { core, evidence: { [field]: { quote } }, sourceMapRef };
    const result = await confirmIngestionTask(deps, { ...input, core });
    const claim = db.claimNodes[0];
    const updated = await updateClaim(deps, { userId: input.userId, researchObjectId: TEST_RO_ID,
      versionId: result.confirmation.versionId, claimId: claim.id, expectedUpdatedAt: claim.updatedAt,
      patch: { statement: 'Human edited statement' } });
    expect(updated.statement).toBe('Human edited statement');
    expect(updated.kind).toBe('core');
  });
});

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

  it('includes other creators in scoped reads while preserving caller-only dashboard tasks', async () => {
    const { deps, db, user } = makeDeps();
    const batch = await createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('shared.pdf')] });
    db.memberships.push({ ...db.memberships[0], id: 'viewer-member', userId: 'viewer', role: 'viewer' });
    await expect(listActionableIngestionTasks(deps, { userId: 'viewer', researchObjectId: TEST_RO_ID })).resolves.toEqual([
      expect.objectContaining({ id: batch.tasks[0].id, logicalPath: 'shared.pdf' }),
    ]);
    await expect(listActionableIngestionTasks(deps, { userId: 'viewer' })).resolves.toEqual([]);
  });

  it('filters the research object before the twenty task limit', async () => {
    const { deps, db, user } = makeDeps();
    const batch = await createIngestionBatch(deps, { userId: user.id, researchObjectId: TEST_RO_ID, processingConsent: true, files: [file('target.pdf')] });
    db.ingestionTasks[0].updatedAt = new Date('2020-01-01');
    const otherRoId = '00000000-0000-4000-8000-000000000102';
    db.researchObjects.push({ ...db.researchObjects[0], id: otherRoId });
    db.ingestionBatches.push({ ...db.ingestionBatches[0], id: 'other-batch', researchObjectId: otherRoId });
    for (let i = 0; i < 21; i += 1) db.ingestionTasks.push({ ...db.ingestionTasks[0], id: `other-${i}`, batchId: 'other-batch', updatedAt: new Date('2025-01-01') });
    await expect(listActionableIngestionTasks(deps, { userId: user.id, researchObjectId: TEST_RO_ID })).resolves.toEqual([
      expect.objectContaining({ id: batch.tasks[0].id, researchObjectId: TEST_RO_ID }),
    ]);
    expect(await listActionableIngestionTasks(deps, { userId: user.id })).toHaveLength(20);
  });

  it('rejects nonmembers and missing research objects before returning scoped tasks', async () => {
    const { deps, user } = makeDeps();
    await expect(listActionableIngestionTasks(deps, { userId: 'outsider', researchObjectId: TEST_RO_ID })).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    await expect(listActionableIngestionTasks(deps, { userId: user.id, researchObjectId: 'missing' })).rejects.toMatchObject({ code: 'INGESTION_NOT_FOUND' });
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
