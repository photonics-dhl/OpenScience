import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import type { Prisma } from '@prisma/client';
import { fixture, fields } from './direct-source-review-fixture';
import { materializeHermesIngestion } from '../../src/ingestion/ingestion-service';
import { reconcileHermesResearchRuns } from '../../src/agent/research-run';
import { persistDocumentSourceMapReference } from '../../src/research-intelligence/source-map-ref';
import { createBlockSourceLocator } from '../../src/research-intelligence/source-locator';

export async function nativeSourceCorrectionFixture() {
  const f = fixture(); const objects = new Map<string, Buffer>();
  const ingestionCreate = f.prisma.ingestionTask.create.bind(f.prisma.ingestionTask);
  Object.assign(f.prisma.ingestionTask, { create: (args: Parameters<typeof ingestionCreate>[0]) => ingestionCreate({ ...args,
    data: { agentTaskId: null, ...args.data } as Prisma.IngestionTaskUncheckedCreateInput }) });
  const hydrateTask = (task: typeof f.db.agentTasks[number] | undefined) => task ? { ...task,
    session: f.db.agentSessions.find(session => session.id === task.sessionId) } : null;
  const ingestionRead = f.prisma.ingestionTask.findUnique.bind(f.prisma.ingestionTask);
  Object.assign(f.prisma.ingestionTask, { findUnique: async (args: Prisma.IngestionTaskFindUniqueArgs) => {
    const foreign = args.where.agentTaskId ? f.db.ingestionTasks.find(task => task.agentTaskId === args.where.agentTaskId) : undefined;
    const row = await ingestionRead(foreign ? { ...args, where: { id: foreign.id } } : args);
    return row && args.include?.agentTask ? { ...row, agentTask: hydrateTask(f.db.agentTasks.find(task => task.id === row.agentTaskId)) } : row;
  } });
  const batchRead = f.prisma.ingestionBatch.findUnique.bind(f.prisma.ingestionBatch);
  Object.assign(f.prisma.ingestionBatch, { findUnique: async (args: Prisma.IngestionBatchFindUniqueArgs) => {
    const row = await batchRead(args);
    return row && args.include?.tasks ? { ...row, tasks: f.db.ingestionTasks.filter(task => task.batchId === row.id)
      .map(task => ({ ...task, artifact: f.db.artifacts.find(artifact => artifact.id === task.artifactId),
        agentTask: hydrateTask(f.db.agentTasks.find(candidate => candidate.id === task.agentTaskId)) })) } : row;
  } });
  const storage = { headObject: async () => null,
    putObject: async (key: string, body: Buffer) => { objects.set(key, body); return { key, size: body.length, etag: 'test' }; },
    getObject: async (key: string) => ({ size: objects.get(key)!.length, body: Readable.from([objects.get(key)!]) }),
  } as unknown as StorageAdapter;
  const text = 'The numerical model predicts coherent radiation under the stated optical geometry.';
  const parser = { name: 'fixture', version: '1' };
  const map = { artifactId: f.ids.artifact, contentHash: 'a'.repeat(64), parser,
    pages: [{ page: 1, width: 100, height: 100, blocks: [{ id: 'source', kind: 'paragraph' as const, text,
      boundingBox: { x: 1, y: 1, width: 90, height: 90 }, parser, transformations: [] }] }] };
  const ref = await persistDocumentSourceMapReference(storage, map, 'succeeded');
  const locator = createBlockSourceLocator(map, 'source', { charRange: { start: 0, end: text.length } });
  f.db.agentTasks.splice(1); f.db.agentSessions.splice(1); f.db.auditLogs.length = 0;
  const author = f.db.agentTasks[0]!;
  const runtime = { runtimeId: 'fixture-native-runtime', skillCatalogueId: 'fixture-native-skills', model: 'MiniMax-M3' };
  const cp = { taskId: author.id, objectKey: `derived/native-agent/${'c'.repeat(64)}.json`, serializedSha256: 'c'.repeat(64), size: 100,
    artifactId: f.ids.artifact, documentSha256: map.contentHash, sourceMapHash: ref.serializedSha256,
    executionAttempt: 1, turnCount: 3, state: 'completed', target: { provider: 'primary', model: 'MiniMax-M3', promptHash: 'd'.repeat(64) },
    responseHash: 'e'.repeat(64), finishReason: 'stop', hasToolCalls: false };
  const claim = { clientKey: 'core', sourceField: 'insight', kind: 'core', statement: text,
    conditions: [], limitations: [], sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] };
  Object.assign(author, { executionAttempt: 1, retryCount: 0, result: {
    nativeAgentExecution: { kind: 'hermes-agent', profile: 'paper-author', ...runtime, checkpoint: cp },
    canonicalExtractionContract: 'grounded-passages-v2', sourceMapRef: ref, core: { schemaVersion: '0.1.0', ...fields(() => text) },
    evidence: fields(() => ({ quote: text, locator: 'passages:P00001' })),
    evidenceSegments: fields(() => [{ quote: text, sourceLocator: locator }]),
    evidenceLocation: fields(() => ({ status: 'located', origin: 'model_quote', matching: 'exact', sourceLocator: locator })), needsMoreInformation: [],
    reviewedClaimSuggestions: [{ ...claim, sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }],
    scientificReview: { kind: 'hermes_agent_review', profile: 'paper-author', contractVersion: '5', status: 'review_received',
      ...runtime, ...cp.target, responseHash: cp.responseHash, reviewedCandidateHash: 'f'.repeat(64), finishReason: 'stop',
      fieldReviews: fields(() => ({ verdict: 'accepted', summary: text, sourcePassageIds: ['P00001'], issues: [] })), draftClaims: [claim] },
  } });
  f.db.hermesResearchSteps.splice(1); Object.assign(f.db.hermesResearchSteps[0]!, { agentTaskId: author.id, status: 'waiting' });
  Object.assign(f.db.ingestionTasks[0]!, { agentTaskId: author.id, state: 'needs_review' });
  Object.assign(f.db.hermesResearchRuns[0]!, { status: 'awaiting_source_review', error: null });
  Object.assign(f.db.researchObjects[0]!, { version: 1, visibility: 'private' });
  f.db.sdfDocuments.push({ id: 'doc', researchObjectId: f.ids.ro, coreJson: author.result.core });
  f.db.sdfNodes.push(...Object.keys(author.result.scientificReview.fieldReviews).map(nodeType => ({ id: `node-${nodeType}`, sdfDocumentId: 'doc', nodeType, content: text })));
  f.db.branches.push({ id: 'main-branch', researchObjectId: f.ids.ro, name: 'main', headCommitId: null });
  Object.assign(f.prisma.evidenceRecord, { createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
    f.db.evidenceRecords.push(...data); return { count: data.length };
  } });
  const deps = { ...f.deps, storage, nativeAgentRuntime: runtime };
  await materializeHermesIngestion(deps, { actorId: f.input.actorId, runId: f.ids.run, taskId: f.ids.source });
  const reconciled = await reconcileHermesResearchRuns(deps);
  if (reconciled.errors) throw new Error('Parent Native confirmation fixture did not advance');
  f.db.hermesResearchRuns[0]!.status = 'failed';
  return { ...f, deps, author, cp, ref, input: { userId: f.input.actorId, taskId: f.ids.source,
    sourceAgentTaskId: author.id, processingConsent: true, idempotencyKey: 'revise-saved-source',
    sourceReanalysis: { intent: 'revise_saved_source' as const } } };
}
