import { describe, expect, it, vi } from 'vitest';
import { initialNativeAgentExecution } from '@openscience/domain';
import { createAudioAuditionAuthorization, createPollOnce, createWorkerDeps, createResearchRunReconcileScheduler, reconcileResearchRunsTick, recoverProcessingQueue, type TaskHandler, type WorkerDeps } from '../src/index';

describe('agent-worker durable queue recovery', () => {
  it('carries the actual bootstrap runtime into automatic review and storyboard creation', async () => {
    const deps = createWorkerDeps({ prisma: {}, redis: {} } as never, { HERMES_NATIVE_AGENT_ENABLED: 'true',
      HERMES_NATIVE_RUNTIME_ID: 'installed-runtime', HERMES_NATIVE_SKILL_CATALOGUE_ID: 'installed-skills', HERMES_NATIVE_AGENT_MODEL: 'MiniMax-M3' });
    const roles: unknown[] = [];
    const scheduler = createResearchRunReconcileScheduler({ reconcile: async actual => {
      for (const profile of ['paper-source-review', 'paper-illustration'] as const)
        roles.push(initialNativeAgentExecution(actual.nativeAgentRuntime, profile));
      return { inspected: 1, advanced: 1, failed: 0, stopped: 0, errors: 0 };
    } });
    expect(await scheduler(deps)).toBe(true);
    expect(roles).toEqual(['paper-source-review', 'paper-illustration'].map(profile => ({ nativeAgentExecution: {
      kind: 'hermes-agent', profile, runtimeId: 'installed-runtime', skillCatalogueId: 'installed-skills', model: 'MiniMax-M3' } })));
  });
  it('preserves disabled native execution and a closed audition policy at bootstrap', async () => {
    const deps = createWorkerDeps({ prisma: {}, redis: {} } as never, { HERMES_NATIVE_AGENT_ENABLED: 'false' });
    expect(deps.nativeAgentRuntime).toBeUndefined();
    await expect(deps.readAudioAuditionReadiness!()).resolves.toBeNull();
  });
  it('refuses enabled but incomplete runtime configuration before the Worker loop starts', () => {
    expect(() => createWorkerDeps({ prisma: {}, redis: {} } as never, { HERMES_NATIVE_AGENT_ENABLED: 'true' })).toThrow();
  });
  it('contains a research reconciler failure so normal queue polling can continue', async () => {
    const errors: unknown[] = [];
    const completed = await reconcileResearchRunsTick({} as never, async () => { throw new Error('database unavailable'); }, (error) => errors.push(error));
    expect(completed).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it('throttles bounded reconciliation while queue polling stays frequent', async () => {
    let current = 0;
    let calls = 0;
    const tick = createResearchRunReconcileScheduler({
      intervalMs: 5_000,
      now: () => current,
      reconcile: async () => { calls += 1; return { inspected: 0, advanced: 0, failed: 0, stopped: 0, errors: 0 }; },
      onError: () => undefined,
    });
    expect(await tick({} as never)).toBe(true);
    current = 1_000;
    expect(await tick({} as never)).toBe(false);
    current = 5_000;
    expect(await tick({} as never)).toBe(true);
    expect(calls).toBe(2);
  });

  it('requeues abandoned pending/running tasks and discards terminal processing residues', async () => {
    const tasks = new Map([
      ['pending-task', { id: 'pending-task', status: 'pending' }],
      ['running-task', { id: 'running-task', status: 'running', error: null }],
      ['succeeded-task', { id: 'succeeded-task', status: 'succeeded' }],
    ]);
    const lists = new Map<string, string[]>([
      ['agent:queue', []],
      ['agent:queue:processing', ['pending-task', 'running-task', 'succeeded-task']],
    ]);
    const redis = {
      lrange: async (key: string) => [...(lists.get(key) ?? [])],
      lpush: async (key: string, value: string) => {
        lists.set(key, [value, ...(lists.get(key) ?? [])]); return lists.get(key)!.length;
      },
      lindex: async (key: string, index: number) => {
        const rows = lists.get(key) ?? [];
        return rows[index < 0 ? rows.length + index : index] ?? null;
      },
      rpoplpush: async (source: string, destination: string) => {
        const value = lists.get(source)?.pop() ?? null;
        if (value) lists.set(destination, [value, ...(lists.get(destination) ?? [])]);
        return value;
      },
      lrem: async (key: string, _count: number, value: string) => {
        const before = lists.get(key) ?? [];
        lists.set(key, before.filter((entry) => entry !== value));
        return before.length - (lists.get(key)?.length ?? 0);
      },
    };
    const prisma = {
      agentTask: {
        findUnique: async ({ where }: { where: { id: string } }) => tasks.get(where.id) ?? null,
        updateMany: async ({ where, data }: {
          where: { id: string; status: string };
          data: { status: string; error: string };
        }) => {
          const task = tasks.get(where.id);
          if (!task || task.status !== where.status) return { count: 0 };
          Object.assign(task, data);
          return { count: 1 };
        },
      },
    };

    expect(await recoverProcessingQueue({ prisma, redis } as never)).toBe(2);
    expect(lists.get('agent:queue:processing')).toEqual([]);
    expect(new Set(lists.get('agent:queue'))).toEqual(new Set(['pending-task', 'running-task']));
    expect(tasks.get('running-task')).toMatchObject({ status: 'pending', error: null });
  });
});

// Exercise the current public Domain implementation and claim path, not stale dist or permission mocks.
vi.mock('@openscience/domain', () => import('../../../packages/domain/src/index.js'));
vi.mock('@openscience/ai-gateway', () => import('../../../packages/ai-gateway/src/index.js'));
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { describeIllustrationBrief, parseStoryboardDocument, presentationClaimContent, presentationEvidenceIdentity,
  readVisualNarrativeSource, requireVideoGenerationParents, CONTENT_DRIVEN_PROFILE,
  type IllustrationBrief, type NativeAgentCheckpointReference } from '@openscience/domain';
import type { AudioAuditionProposal } from '../src/presentation/host-video-spool';
import { createPresentationGenerationHandler } from '../src/presentation/handler';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { Readable } from 'node:stream';
import { SynclipVideoSpool } from '../src/presentation/synclip-video-spool';
import { Prisma } from '@prisma/client';
import { createStorageAdapter, streamToBuffer, type StorageAdapter } from '@openscience/storage';
import { createSession } from '@openscience/auth';
import { createFakeMailer, createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { buildApp } from '../../api/src/app';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
type WorkerTask = Parameters<TaskHandler>[1];
const uuid = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001`;
const roId = uuid(1), versionId = uuid(2), claimId = uuid(3), parentId = uuid(4), artifactId = uuid(5), ingestionId = uuid(6);
const now = new Date('2026-10-08T00:00:00Z');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const parentIdentity = (asset: { contentHash: string; provenance: unknown }) => JSON.stringify({ contentHash: asset.contentHash, provenance: asset.provenance, ids: [claimId] });
type RenderResources = Array<{ id: string; version?: string; upstreamCommit?: string; resources: string[] }>;

function document() {
  const illustration: IllustrationBrief = { schemaVersion: 2, message: 'The source transfers energy to the receiver.', domain: 'real-space',
    encoding: 'The supported transfer runs left to right.', subjects: [{ description: 'A source left of a receiver',
      basis: { claimId, evidenceId: uuid(7), quote: 'The source transfers energy to the receiver.' } }],
    composition: 'Both objects remain visible.', treatment: 'Scientific linework.', labels: ['Source', 'Receiver'], constraints: ['No invented apparatus.'] };
  return { schemaVersion: 1, title: 'Energy transfer', narrative: { mainMessage: 'Explain the supported transfer.', audience: 'Researchers' },
    videoProduction: { schemaVersion: 1, narrativeArc: 'question-mechanism-takeaway', visualContinuity: 'Keep the same source and receiver.', audioPolicy: 'external-narration', modelPolicy: 'commercial-primary' },
    scenes: Array.from({ length: 3 }, () => ({ title: 'Transfer', narration: 'The source transfers energy to the receiver.',
      visualAction: describeIllustrationBrief(illustration), illustration: structuredClone(illustration), durationSeconds: 10, sourceClaimIds: [claimId],
      videoDirection: { shotType: 'mechanism', purpose: 'Explain the transfer.', subjectLock: 'Source stays left of receiver.', generatedElements: 'One transfer trace.',
        motion: 'Trace advances left to right.', camera: 'Fixed view.', reference: 'scene-artwork', frameStrategy: 'start-reference', audioMode: 'external-narration',
        subtitleMode: 'sidecar', negativeConstraints: ['No invented apparatus.'], modelPolicy: 'commercial-primary' } })) };
}

async function audioNativeFixture() {
  const claims = [{ id: claimId, researchObjectId: roId, versionId, parentClaimId: null, kind: 'finding', statement: 'The source transfers energy to the receiver.',
    assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded', updatedAt: now,
    provenance: { source: 'reviewed_ingestion', sourceTaskId: ingestionId } }];
  const evidence = [{ id: uuid(7), claimId, researchObjectId: roId, versionId, artifactId, contentHash: 'a'.repeat(64), exactQuote: claims[0]!.statement,
    relation: 'supports', locator: { page: 1 }, extractionStatus: 'succeeded', updatedAt: now, provenance: { source: 'reviewed_ingestion', sourceTaskId: ingestionId } }];
  const sourceMapRef = { schemaVersion: 1, parserStatus: 'succeeded', artifactId, contentHash: 'a'.repeat(64),
    objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100 };
  const session = { id: uuid(8), userId: uuid(9), researchObjectId: roId, deletedAt: null as Date | null, status: 'active' };
  const ro = { id: roId, workspaceId: uuid(10), deletedAt: null as Date | null };
  const version = { id: versionId, researchObjectId: roId, manifest: { id: uuid(11), coreJson: {}, entries: [{ artifactId, blobSha256: sourceMapRef.contentHash }] } };
  const ingestion = { id: ingestionId, artifactId, state: 'confirmed', batch: { userId: session.userId, researchObjectId: roId },
    artifact: { workspaceId: ro.workspaceId, blobSha256: sourceMapRef.contentHash, deletedAt: null as Date | null, bytesPurgedAt: null },
    agentTask: { id: uuid(12), kind: 'sdf.extract', status: 'succeeded', deletedAt: null as Date | null, updatedAt: now, session,
      result: { sourceMapRef, scientificReview: { status: 'review_received', contractVersion: 4, responseHash: 'c'.repeat(64) },
        core: { problem: 'Problem', insight: 'Insight', method: 'Method', results: 'Results', limitations: 'Limitations', reproducibility: 'Reproducibility' } } } };
  const payload = { schemaVersion: 1, researchObjectId: roId, versionId, kind: 'interactive_html', sourceClaimIds: [claimId],
    storyboard: { locale: 'zh', style: 'scientific', instruction: 'Explain the supported transfer.', output: 'video', narrative: true } };
  const cp: NativeAgentCheckpointReference = { taskId: parentId, objectKey: `derived/native-agent/${'d'.repeat(64)}.json`, serializedSha256: 'd'.repeat(64),
    size: 100, artifactId, documentSha256: sourceMapRef.contentHash, sourceMapHash: sourceMapRef.serializedSha256,
    executionAttempt: 1, turnCount: 4, state: 'completed', target: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'e'.repeat(64) },
    responseHash: 'f'.repeat(64), finishReason: 'stop', hasToolCalls: false };
  const storyboardDocument = parseStoryboardDocument(document(), [claimId], 'video', { nativeNarrativeVideo: true });
  const sourceEvidenceIdentity = presentationEvidenceIdentity(evidence as never);
  const review = { stage: 'final-brief', decision: 'accepted', requestId: parentId, candidateHash: hash(storyboardDocument), sourceEvidenceIdentity,
    summary: 'Supported by the saved paper.', ...cp.target, responseHash: cp.responseHash };
  const context = { payload: structuredClone(payload), sourceEvidenceIdentity, claimContent: presentationClaimContent(claims), baseIdentity: null, narrativeSourceIdentity: '' };
  const result = { ...initialNativeAgentExecution({ runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills', model: 'MiniMax-M3' }, 'paper-illustration')!,
    sourceMapRef: structuredClone(sourceMapRef), assetId: parentId, contentHash: '1'.repeat(64), nativeIllustrationContext: context,
    storyboardCheckpoint: { ...structuredClone(context), executionAttempt: 1, planned: { document: structuredClone(storyboardDocument), promptHash: review.promptHash, reviewFormat: 2,
      designSkills: [{ id: 'scientific', version: '20', resources: ['SKILL.md#Execution'] }] as RenderResources } }, storyboardReview: structuredClone(review),
    nativeIllustration: { runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills', planToolCallId: 'actual-art', reviewToolCallId: 'actual-review' },
    illustrationPrompts: storyboardDocument.scenes.map((_, sceneIndex) => ({ sceneIndex, prompt: `Verified frame ${sceneIndex}`, videoPrompt: `Verified motion ${sceneIndex}` })) };
  result.nativeAgentExecution.checkpoint = cp;
  const parent = { id: parentId, researchObjectId: roId, versionId, kind: 'interactive_html', status: 'draft', deletedAt: null as Date | null,
    contentHash: result.contentHash, sourceClaims: [{ claimId }], provenance: { source: 'verified_claims', subtype: 'sourced_storyboard', taskId: parentId,
      sourceEvidenceIdentity, storyboardSettings: structuredClone(payload.storyboard), storyboardDocument, illustrationReview: structuredClone(review) } };
  Object.assign(parent.provenance, { designSkills: structuredClone(result.storyboardCheckpoint.planned.designSkills) });
  const parentTask = { id: parentId, sessionId: session.id, session, kind: 'presentation.generate', status: 'succeeded', deletedAt: null as Date | null,
    error: null as string | null, executionAttempt: 1, payload, result };
  const frames = Array.from({ length: 3 }, (_, sceneIndex) => {
    const id = uuid(20 + sceneIndex), contentHash = String(sceneIndex + 2).repeat(64);
    const imageReview = { stage: 'generated-image', requestId: id, decision: 'accepted', summary: 'Saved pixels preserve the source.', repairInstruction: null,
      contentHash, sourceEvidenceIdentity, parentIdentity: parentIdentity(parent), promptHash: '4'.repeat(64), responseHash: '5'.repeat(64),
      provider: 'minimax-key-1-model-1', model: 'MiniMax-M3' };
    return { id, researchObjectId: roId, versionId, kind: 'image', status: 'draft', deletedAt: null as Date | null, contentHash, sourceClaims: [{ claimId }],
      provenance: { source: 'approved_storyboard_scene', taskId: id, subtype: 'storyboard_scene_image', sceneImage: { storyboardAssetId: parentId, sceneIndex },
        sourceEvidenceIdentity, parentIdentity: parentIdentity(parent), imageReview } };
  });
  const frameTasks = frames.map(frame => ({ id: frame.id, kind: 'presentation.generate', status: 'succeeded', deletedAt: null as Date | null,
    result: { assetId: frame.id, contentHash: frame.contentHash, imageReview: structuredClone(frame.provenance.imageReview),
      nativeImageReview: { mode: 'model-native', state: 'completed', executionAttempt: 1, requestId: frame.id, contentHash: frame.contentHash,
        sourceEvidenceIdentity, parentIdentity: frame.provenance.parentIdentity, promptHash: '4'.repeat(64), provider: 'minimax-key-1-model-1', model: 'MiniMax-M3',
        review: structuredClone(frame.provenance.imageReview) } } }));
  const ancestors: Array<typeof parent> = [], ancestorTasks: Array<typeof parentTask> = [];
  type Where = { id?: { in: string[] }; claimId?: { in: string[] }; researchObjectId?: string; versionId?: string; extractionStatus?: string; contentHash?: string; exactQuote?: unknown };
  const prisma = {
    presentationAsset: { findUnique: async ({ where }: { where: { id: string } }) => [parent, ...ancestors, ...frames].find(asset => asset.id === where.id) ?? null,
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => frames.filter(frame => where.id.in.includes(frame.id)) },
    agentTask: { findUnique: async ({ where }: { where: { id: string } }) => [parentTask, ...ancestorTasks, ...frameTasks].find(task => task.id === where.id) ?? null },
    agentSession: { findUnique: async () => session }, researchObject: { findUnique: async () => ro },
    claimNode: { findMany: async ({ where }: { where: Where }) => claims.filter(claim => (!where.id || where.id.in.includes(claim.id))
      && (!where.researchObjectId || claim.researchObjectId === where.researchObjectId) && (!where.versionId || claim.versionId === where.versionId)
      && (!where.extractionStatus || claim.extractionStatus === where.extractionStatus)) },
    evidenceRecord: { findMany: async ({ where }: { where: Where }) => evidence.filter(row => (!where.claimId || where.claimId.in.includes(row.claimId))
      && (!where.researchObjectId || row.researchObjectId === where.researchObjectId) && (!where.versionId || row.versionId === where.versionId)
      && (!where.extractionStatus || row.extractionStatus === where.extractionStatus) && (!where.contentHash || row.contentHash === where.contentHash)) },
    version: { findFirst: async () => version }, ingestionTask: { findUnique: async () => ingestion },
  };
  const source = await readVisualNarrativeSource(prisma as never, { userId: session.userId, workspaceId: ro.workspaceId, researchObjectId: roId, versionId, sourceClaimIds: [claimId] });
  context.narrativeSourceIdentity = source.identity;
  result.storyboardCheckpoint.narrativeSourceIdentity = source.identity;
  const input = { researchObjectId: roId, versionId, sourceClaimIds: [claimId],
    video: { profile: CONTENT_DRIVEN_PROFILE, storyboardAssetId: parentId, sceneImageAssetIds: frames.map(frame => frame.id) } };
  return { prisma, input, parent, parentTask, frames, frameTasks, ancestors, ancestorTasks, claims, evidence, ingestion, version, context, cp, sourceEvidenceIdentity };
}

async function audioGrantFixture() {
  const f = await audioNativeFixture();
  const actorId = uuid(9), workspaceId = uuid(10), taskId = uuid(40);
  const audio = { provider: 'synclip' as const, voice: 'configured-voice', speed: 1 };
  const payload = { schemaVersion: 1, kind: 'video', ...f.input,
    video: { ...f.input.video, purpose: 'audio-audition', sceneIndex: 1, locale: 'zh', audio } };
  const owner = { id: taskId, kind: 'presentation.generate', payload, status: 'pending', deletedAt: null,
    sessionId: uuid(8), executionAttempt: 0, retryCount: 0, progress: 0, error: null, result: { previous: 'preserved' } as Record<string, unknown>,
    session: { id: uuid(8), status: 'active', userId: actorId, researchObjectId: roId, deletedAt: null,
      researchObject: { id: roId, workspaceId, deletedAt: null, workspace: { status: 'active' } } } };
  const state = { role: 'author', platformRole: 'platform_admin', credit: true, rejectCas: false,
    policy: { audio, maxEstimatedCoins: 7 } as { audio: typeof audio; maxEstimatedCoins: number } | null,
    insideTransaction: false, beforeGrant: undefined as (() => void) | undefined, transactions: [] as unknown[] };
  const events: string[] = [];
  const lookup = f.prisma.agentTask.findUnique;
  const prisma = { ...f.prisma,
    $executeRaw: async () => 0,
    workspace: { findUnique: async () => ({ id: workspaceId, status: owner.session.researchObject.workspace.status }) },
    membership: { findUnique: async () => ({ userId: actorId, workspaceId, role: state.role }) },
    user: { findUnique: async () => ({ id: actorId, platformRole: state.platformRole }) },
    version: { ...f.prisma.version, findUnique: async () => ({ ...f.version, status: 'draft',
      commit: { branchId: uuid(41) }, researchObject: owner.session.researchObject }) },
    usageLedger: { findUnique: async ({ where }: { where: { idempotencyKey: string } }) => state.credit && where.idempotencyKey === `agent-task-reserve:${taskId}`
      ? { userId: actorId, resource: 'ai_credit', delta: -1, kind: 'consume',
        metadata: { taskId, kind: owner.kind, policy: 'charged-on-submit' } } : null },
    trashEntry: { findFirst: async () => null },
    trashObjectCleanup: { updateMany: async () => ({ count: 0 }) },
    ingestionTask: { ...f.prisma.ingestionTask, updateMany: async () => ({ count: 0 }) },
    agentTask: { findUnique: async ({ where }: { where: { id: string } }) => {
      if (where.id !== taskId) return lookup({ where });
      return structuredClone(owner);
    }, updateMany: async ({ where, data }: { where: { id: string; status?: string; executionAttempt?: number; result?: { equals: unknown } };
      data: Record<string, unknown> & { executionAttempt?: number | { increment: number } } }) => {
      if (where.result) { const hook = state.beforeGrant; state.beforeGrant = undefined; hook?.(); }
      if (where.id !== taskId || (where.status && where.status !== owner.status)
        || (where.executionAttempt !== undefined && where.executionAttempt !== owner.executionAttempt)
        || (where.result && (state.rejectCas || !isDeepStrictEqual(where.result.equals, owner.result)))) return { count: 0 };
      const attempt = typeof data.executionAttempt === 'object' ? owner.executionAttempt + data.executionAttempt.increment : data.executionAttempt;
      Object.assign(owner, data, ...(attempt === undefined ? [] : [{ executionAttempt: attempt }]));
      if (where.result) events.push('grant-cas');
      return { count: 1 };
    } },
    async $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, options?: unknown) {
      state.transactions.push(options); state.insideTransaction = true;
      const snapshot = structuredClone(owner);
      try { const result = await fn(prisma as unknown as Prisma.TransactionClient); events.push('commit'); return result; }
      catch (error) { Object.assign(owner, snapshot); throw error; }
      finally { state.insideTransaction = false; }
    },
  };
  let queued = true;
  const deps = { prisma: prisma as unknown as WorkerDeps['prisma'], storage: undefined as StorageAdapter | undefined, mailer: createFakeMailer(),
    videoEnabled: true, readVideoReadiness: async () => true, readAudioAuditionReadiness: async () => state.policy,
    redis: { brpoplpush: async () => { if (!queued) return null; queued = false; return taskId; }, lrem: async () => 1 } as unknown as WorkerDeps['redis'] };
  const parents = await requireVideoGenerationParents(deps.prisma, payload as never);
  const proposal: AudioAuditionProposal = { purpose: 'audio-audition', taskId, executionAttempt: 1, profile: 'content-driven-v1',
    actorId, workspaceId, researchObjectId: roId, versionId, parentIdentity: parents!.identity, sourceClaimIds: [claimId],
    sceneImageTaskIds: f.frames.map(frame => frame.id), locale: 'zh', style: 'scientific', sceneIndex: 1, audio,
    inputHash: '9'.repeat(64), createdAt: Date.now(), deadlineAt: Date.now() + 60_000 };
  const run = async (handler: TaskHandler) => {
    queued = true;
    await (await createPollOnce({ 'presentation.generate': handler }, { runMaintenance: false }))(deps);
  };
  return { ...f, owner, state, events, deps, proposal, run };
}

describe('durable audio audition spending authority', () => {
  it('requires actual claimed Worker context even for an otherwise valid proposal', async () => {
    const f = await audioGrantFixture();
    await expect(createAudioAuditionAuthorization(f.deps)(f.proposal)).rejects.toThrow('claimed worker');
    expect(f.owner.result).toEqual({ previous: 'preserved' });
  });

  it('commits the original grant before the producer can publish, preserving previous JSON and both finite caps', async () => {
    const f = await audioGrantFixture();
    await f.run(async (_deps: unknown, task: WorkerTask) => {
      expect(task.executionAttempt).toBe(1);
      const grant = await createAudioAuditionAuthorization(f.deps)(f.proposal);
      expect(f.state.insideTransaction).toBe(false);
      expect(f.owner.result.audioAuditionGrant).toEqual(grant);
      expect(f.events.slice(-2)).toEqual(['grant-cas', 'commit']);
      f.events.push('publish');
      return { ...f.owner.result, purpose: 'audio-audition' };
    });
    expect(f.owner.status).toBe('succeeded');
    expect(f.owner.result).toMatchObject({ previous: 'preserved', audioAuditionGrant: {
      taskId: f.owner.id, executionAttempt: 1, inputHash: f.proposal.inputHash,
      workerMaxEstimatedCoins: 7, hostMaxEstimatedCoins: 7,
      createdAt: f.proposal.createdAt, deadlineAt: f.proposal.deadlineAt } });
    expect(f.state.transactions).toContainEqual(expect.objectContaining({ isolationLevel: 'Serializable' }));
  });

  it.each(['role', 'admin', 'actor', 'task', 'session', 'attempt', 'payload', 'ro', 'version', 'workspace', 'sourceIds',
    'parent', 'evidence', 'claim', 'voice', 'locale', 'scene', 'budget', 'zeroBudget', 'credit', 'forgedGrant', 'cas'])('denies %s before executable publication', async reason => {
    const f = await audioGrantFixture(); let published = false;
    await f.run(async () => {
      if (reason === 'role') f.state.role = 'viewer';
      if (reason === 'admin') f.state.platformRole = 'user';
      if (reason === 'actor') f.owner.session.userId = uuid(90);
      if (reason === 'task') f.proposal.taskId = uuid(90);
      if (reason === 'session') f.owner.session.status = 'closed';
      if (reason === 'attempt') f.proposal.executionAttempt++;
      if (reason === 'payload') f.owner.payload.kind = 'image';
      if (reason === 'ro') f.proposal.researchObjectId = uuid(90);
      if (reason === 'version') f.proposal.versionId = uuid(90);
      if (reason === 'workspace') f.proposal.workspaceId = uuid(90);
      if (reason === 'sourceIds') f.proposal.sourceClaimIds = [uuid(90)];
      if (reason === 'parent') f.frames[1]!.deletedAt = new Date();
      if (reason === 'evidence') f.evidence[0]!.exactQuote = 'Changed source';
      if (reason === 'claim') f.claims[0]!.statement = 'Changed source';
      if (reason === 'voice') f.state.policy!.audio = { ...f.state.policy!.audio, voice: 'different-configured-voice' };
      if (reason === 'locale') f.proposal.locale = 'en';
      if (reason === 'scene') f.proposal.sceneIndex = 0;
      if (reason === 'budget') f.state.policy!.maxEstimatedCoins = Infinity;
      if (reason === 'zeroBudget') f.state.policy!.maxEstimatedCoins = 0;
      if (reason === 'credit') f.state.credit = false;
      if (reason === 'forgedGrant') Object.assign(f.owner.payload, { audioAuditionGrant: { schemaVersion: 1, workerMaxEstimatedCoins: 9999 } });
      if (reason === 'cas') f.state.rejectCas = true;
      await createAudioAuditionAuthorization(f.deps)(f.proposal); published = true;
      return f.owner.result;
    });
    expect(f.owner.status).toBe('failed'); expect(published).toBe(false);
    expect(f.owner.result.audioAuditionGrant).toBeUndefined();
  });

  it('never mints a grant on an already recovered claim without the original authorization', async () => {
    const f = await audioGrantFixture(); f.owner.executionAttempt = 1;
    await f.run(async (_deps: unknown, task: WorkerTask) => {
      await createAudioAuditionAuthorization(f.deps)({ ...f.proposal, executionAttempt: task.executionAttempt });
      return f.owner.result;
    });
    expect(f.owner.executionAttempt).toBe(2); expect(f.owner.status).toBe('failed');
    expect(f.owner.error).toContain('no original durable grant'); expect(f.owner.result.audioAuditionGrant).toBeUndefined();
  });

  it('keeps the original grant exactly on a later claim with unavailable policy; never expands the original deadline/budget', async () => {
    const f = await audioGrantFixture();
    await f.run(async () => {
      await createAudioAuditionAuthorization(f.deps)(f.proposal);
      throw new Error('Worker crashed after host accepted the original request');
    });
    const original = structuredClone(f.owner.result.audioAuditionGrant);
    expect(original).toBeDefined();
    f.owner.status = 'pending'; f.state.policy = null;
    await f.run(async (_deps: unknown, task: WorkerTask) => {
      const grant = await createAudioAuditionAuthorization(f.deps)({ ...f.proposal, executionAttempt: task.executionAttempt,
        createdAt: Date.now() + 100_000, deadlineAt: Date.now() + 200_000 });
      expect(grant).toEqual(original);
      return { ...f.owner.result, adopted: true };
    });
    expect(f.owner.status).toBe('succeeded'); expect(f.owner.executionAttempt).toBe(2);
    expect(f.owner.result.audioAuditionGrant).toEqual(original);
    expect(f.events.filter(event => event === 'grant-cas')).toHaveLength(1);
  });

  it('rejects a changed original hash on a new claim rather than minting replacement authority', async () => {
    const f = await audioGrantFixture();
    await f.run(async () => { await createAudioAuditionAuthorization(f.deps)(f.proposal); throw new Error('crash'); });
    const original = structuredClone(f.owner.result.audioAuditionGrant); f.owner.status = 'pending';
    await f.run(async (_deps: unknown, task: WorkerTask) => {
      await createAudioAuditionAuthorization(f.deps)({ ...f.proposal, executionAttempt: task.executionAttempt, inputHash: '8'.repeat(64) });
      return f.owner.result;
    });
    expect(f.owner.status).toBe('failed'); expect(f.owner.result.audioAuditionGrant).toEqual(original);
  });
});

describe('private audition handler and current-attempt recovery', () => {
  async function handlerFixture() {
    const f = await audioGrantFixture();
    const objects = new Map<string, Buffer>();
    f.frames.forEach((frame, index) => {
      const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(25, index)]);
      Object.assign(frame, { objectKey: `frame-${index}`, contentHash: createHash('sha256').update(bytes).digest('hex') });
      frame.provenance.imageReview.contentHash = frame.contentHash;
      Object.assign(f.frameTasks[index]!.result, { contentHash: frame.contentHash });
      Object.assign(f.frameTasks[index]!.result.nativeImageReview, { contentHash: frame.contentHash,
        review: structuredClone(frame.provenance.imageReview) });
      Object.assign(f.frameTasks[index]!.result, { imageReview: structuredClone(frame.provenance.imageReview) });
      objects.set(`frame-${index}`, bytes);
    });
    f.proposal.parentIdentity = (await requireVideoGenerationParents(f.deps.prisma, f.owner.payload as never))!.identity;
    const root = resolve('..', '..', 'tmp', 'synclip-audio-audition', 'authority');
    await mkdir(root, { recursive: true });
    const dir = await mkdtemp(join(root, 'handler-'));
    const path = join(dir, 'audition.mp3');
    const frame = Buffer.concat([Buffer.from([255, 251, 144, 0]), Buffer.alloc(413)]);
    const mp3 = Buffer.concat([frame, frame]); await writeFile(path, mp3);
    let stored = 0, generated = 0, adopted = 0; let corruptOutput = false;
    let afterAudio: (() => void) | undefined;
    const storage: StorageAdapter = { getObject: async (key: string) => ({ body: Readable.from([objects.get(key)!]), size: objects.get(key)!.length }),
      headObject: async (key: string) => { const bytes = objects.get(key); return bytes ? { size: bytes.length, etag: '' } : null; },
      deleteObject: async (key: string) => { objects.delete(key); },
      putObject: async (key: string, body: Buffer | Readable) => {
        const bytes = Buffer.isBuffer(body) ? body : await streamToBuffer(body);
        objects.set(key, Buffer.from(bytes)); stored++; return { key, size: bytes.length, etag: '' }; } };
    f.deps.storage = storage;
    const handler = createPresentationGenerationHandler({ videoSpool: { provider: 'synclip', generate: async () => { generated++; throw Error('must not generate video'); },
      audition: async input => {
        expect(f.state.insideTransaction).toBe(false);
        expect(input).toMatchObject({ actorId: uuid(9), workspaceId: uuid(10), researchObjectId: roId, versionId,
          parentIdentity: f.proposal.parentIdentity, sceneIndex: 1, locale: 'zh', audio: f.proposal.audio,
          storyboard: f.parent.provenance.storyboardDocument, sceneImageTaskIds: f.frames.map(row => row.id) });
        const grant = await createAudioAuditionAuthorization(f.deps)({ ...f.proposal, executionAttempt: input.executionAttempt });
        if (grant.executionAttempt !== input.executionAttempt) adopted++;
        afterAudio?.();
        const characters = [...f.parent.provenance.storyboardDocument.scenes[1]!.narration].length;
        return { purpose: 'audio-audition', taskId: input.taskId, executionAttempt: grant.executionAttempt, inputHash: grant.inputHash,
          sceneIndex: 1, voice: grant.audio.voice, speed: 1, locale: 'zh', audioTaskId: 'known-original-tts', filePath: path,
          contentHash: corruptOutput ? '0'.repeat(64) : createHash('sha256').update(mp3).digest('hex'), size: mp3.length,
          contentType: 'audio/mpeg', durationSeconds: 2.5, timingStatus: 'decoded',
          quote: { coinsPerCharacter: 0.1, characters, estimatedCoins: characters * 0.1, workerCeiling: 7, hostCeiling: 7 }, coinsUsed: characters * 0.1 };
      } } });
    return { ...f, deps: { ...f.deps, storage }, objects, dir, path, mp3, handler, get stored() { return stored; }, get generated() { return generated; },
      get adopted() { return adopted; }, afterAudio: (hook: () => void) => { afterAudio = hook; }, corruptOutput: () => { corruptOutput = true; } };
  }

  it('stores validated private MP3 with the raw committed grant and never creates or generates a video asset', async () => {
    const f = await handlerFixture();
    try {
      await f.run(f.handler);
      expect(f.owner.error).toBeNull(); expect(f.owner.status).toBe('succeeded');
      const key = `presentation/${roId}/${versionId}/audio-audition/${f.owner.id}/${f.proposal.inputHash}.mp3`;
      expect(f.owner.result).toMatchObject({ purpose: 'audio-audition', previous: 'preserved', audioAudition: {
        taskId: f.owner.id, executionAttempt: 1, inputHash: f.proposal.inputHash, sceneIndex: 1, objectKey: key,
        audioTaskId: 'known-original-tts', contentType: 'audio/mpeg', durationSeconds: 2.5, timingStatus: 'decoded' } });
      expect(f.objects.get(key)).toEqual(f.mp3); expect(f.stored).toBe(1); expect(f.generated).toBe(0);
    } finally { await rm(f.dir, { recursive: true }); }
  });

  it('adopts the original MP3/attempt on the next real claim after storage acknowledgment was lost', async () => {
    const f = await handlerFixture();
    try {
      const put = f.deps.storage.putObject;
      f.deps.storage.putObject = async (...args: Parameters<StorageAdapter['putObject']>) => { await put(...args); throw Error('lost storage acknowledgment'); };
      await f.run(f.handler);
      expect(f.owner.status).toBe('failed'); const original = structuredClone(f.owner.result.audioAuditionGrant);
      expect(original).toBeDefined();
      f.owner.status = 'pending'; f.state.policy = null; f.deps.storage.putObject = put;
      await f.run(f.handler);
      expect(f.owner.error).toBeNull(); expect(f.owner.status).toBe('succeeded'); expect(f.owner.executionAttempt).toBe(2);
      expect(f.owner.result.audioAuditionGrant).toEqual(original);
      expect(f.owner.result.audioAudition).toMatchObject({ executionAttempt: 1, audioTaskId: 'known-original-tts' });
      expect(f.adopted).toBe(1); expect(f.generated).toBe(0);
    } finally { await rm(f.dir, { recursive: true }); }
  });

  it('runs real claim → durable authority → actual spool publication, then adopts expired original bytes without republishing', async () => {
    const f = await handlerFixture();
    try {
      const inboxDir = join(f.dir, 'inbox'), resultsDir = join(f.dir, 'results');
      await mkdir(inboxDir); await mkdir(resultsDir);
      await writeFile(join(resultsDir, '.ready'), JSON.stringify({ schemaVersion: 1, provider: 'synclip', model: 'ltx23',
        adapterRevision: 'synclip-video-v2', accepting: false, audioAccepting: true, updatedAt: Date.now(),
        narration: f.proposal.audio, audioAuditionBudget: { maxEstimatedCoins: 7 } }));
      let now = Date.now(), publications = 0;
      const spool = new SynclipVideoSpool({ inboxDir, resultsDir, now: () => now, timeoutMs: 60_000,
        authorizeAudioAudition: createAudioAuditionAuthorization(f.deps), sleep: async () => {
          expect(f.state.insideTransaction).toBe(false);
          const request = JSON.parse(await readFile(join(inboxDir, f.owner.id, 'request.json'), 'utf8'));
          expect(request.audioAuditionGrant).toEqual(f.owner.result.audioAuditionGrant);
          expect(f.events.slice(-2)).toEqual(['grant-cas', 'commit']); publications++;
          const out = join(resultsDir, f.owner.id); await mkdir(out, { recursive: true });
          await writeFile(join(out, 'audition.mp3'), f.mp3);
          const characters = [...f.parent.provenance.storyboardDocument.scenes[1]!.narration].length;
          await writeFile(join(out, 'result.json'), JSON.stringify({ schemaVersion: 1, purpose: 'audio-audition', id: f.owner.id,
            status: 'succeeded', inputHash: request.inputHash, executionAttempt: request.executionAttempt,
            audio: { sceneIndex: 1, locale: 'zh', voice: f.proposal.audio.voice, speed: 1, audioTaskId: 'original-known-tts',
              contentType: 'audio/mpeg', outputSha256: createHash('sha256').update(f.mp3).digest('hex'), outputSize: f.mp3.length,
              durationSeconds: 2.5, timingStatus: 'decoded', quote: { coinsPerCharacter: 0.1, characters,
                estimatedCoins: characters * 0.1, workerCeiling: 7, hostCeiling: 5 }, coinsUsed: characters * 0.1 } }));
        } });
      const handler = createPresentationGenerationHandler({ videoSpool: spool });
      const put = f.deps.storage.putObject;
      f.deps.storage.putObject = async (...args: Parameters<StorageAdapter['putObject']>) => { await put(...args); throw Error('lost acknowledgment'); };
      await f.run(handler);
      expect(f.owner.status).toBe('failed'); expect(f.owner.error).toBe('lost acknowledgment');
      const original = structuredClone(f.owner.result.audioAuditionGrant);
      expect(original).toBeDefined();
      await rm(join(inboxDir, f.owner.id), { recursive: true }); await rm(join(resultsDir, '.ready'));
      f.owner.status = 'pending'; f.state.policy = null; now += 120_000; f.deps.storage.putObject = put;
      await f.run(handler);
      expect(f.owner.error).toBeNull(); expect(f.owner.status).toBe('succeeded'); expect(f.owner.executionAttempt).toBe(2);
      expect(f.owner.result.audioAuditionGrant).toEqual(original);
      expect(f.owner.result.audioAudition).toMatchObject({ executionAttempt: 1, audioTaskId: 'original-known-tts', quote: { hostCeiling: 5 } });
      expect(publications).toBe(1);
      await expect(readFile(join(inboxDir, f.owner.id, 'request.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(f.dir, { recursive: true }); }
  });

  it('executes one normal API audition through claimed grant, real broker and private StorageAdapter completion', async () => {
    const f = await handlerFixture();
    const { runSynclipVideoBrokerOnce } = await import('../../../infra/synclip-video/broker.mjs');
    const objectRoot = join(f.dir, 'objects'), bucket = 'audition-fixture';
    const metadata = new Map<string, { size: number; etag: string; contentType: string; sha256: string }>();
    const storageErrors: unknown[] = [];
    // A loopback file-backed S3 fixture exercises the real adapter/SDK, not a putObject stub.
    const server = createServer((req, res) => {
      void (async () => {
        const url = new URL(req.url!, 'http://fixture');
        if (url.searchParams.has('location')) {
          res.setHeader('Content-Type', 'application/xml');
          res.end('<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>'); return;
        }
        const key = decodeURIComponent(url.pathname.slice(`/${bucket}/`.length));
        const path = resolve(objectRoot, key);
        const child = relative(objectRoot, path);
        if (!url.pathname.startsWith(`/${bucket}/`) || !child || child.startsWith('..') || isAbsolute(child)) throw Error('unexpected storage path');
        if (req.method === 'PUT') {
          const bytes = await streamToBuffer(req);
          await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, bytes);
          const etag = createHash('md5').update(bytes).digest('hex');
          metadata.set(key, { size: bytes.length, etag, contentType: String(req.headers['content-type']),
            sha256: String(req.headers['x-amz-meta-sha256']) });
          res.setHeader('ETag', `"${etag}"`); res.end(); return;
        }
        const saved = metadata.get(key);
        if (!saved) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Length', saved.size); res.setHeader('Content-Type', saved.contentType);
        res.setHeader('ETag', `"${saved.etag}"`); res.setHeader('Last-Modified', new Date().toUTCString());
        res.setHeader('x-amz-meta-sha256', saved.sha256);
        if (req.method === 'HEAD') res.end();
        else if (req.method === 'GET') createReadStream(path).pipe(res);
        else throw Error('unexpected storage operation');
      })().catch(error => { storageErrors.push(error); res.statusCode = 500; res.end(); });
    });
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      await new Promise<void>(resolveListen => { server.listen(0, '127.0.0.1', resolveListen); });
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('storage fixture did not bind');
      const storage = createStorageAdapter({ driver: 'minio', endPoint: '127.0.0.1', port: address.port, useSSL: false,
        accessKey: 'synthetic-storage-access', secretKey: 'synthetic-storage-secret', bucket });
      for (const [key, bytes] of f.objects) await storage.putObject(key, bytes, { contentType: 'image/png' });

      // Select a supported approved plan, updating the same fixture's saved review identities.
      const doc = f.parent.provenance.storyboardDocument;
      doc.scenes.forEach(scene => {
        if (!scene.videoDirection) throw Error('native fixture lacks its approved video direction');
        scene.videoDirection.subtitleMode = 'none';
      });
      f.parentTask.result.storyboardCheckpoint.planned.document = structuredClone(doc);
      f.parentTask.result.storyboardReview.candidateHash = hash(doc);
      f.parent.provenance.illustrationReview = structuredClone(f.parentTask.result.storyboardReview);
      f.frames.forEach((frame, index) => {
        frame.provenance.parentIdentity = parentIdentity(f.parent);
        frame.provenance.imageReview.parentIdentity = frame.provenance.parentIdentity;
        f.frameTasks[index]!.result.imageReview = structuredClone(frame.provenance.imageReview);
        Object.assign(f.frameTasks[index]!.result.nativeImageReview, { parentIdentity: frame.provenance.parentIdentity,
          review: structuredClone(frame.provenance.imageReview) });
      });
      const { prisma, db } = createFakePrisma();
      const actorId = uuid(9), workspaceId = uuid(10);
      seedUser(db, { id: actorId, platformRole: 'platform_admin' });
      db.workspaces.push({ id: workspaceId, status: 'active' });
      db.memberships.push({ id: uuid(50), userId: actorId, workspaceId, role: 'author' });
      db.researchObjects.push({ id: roId, workspaceId, deletedAt: null });
      db.commits.push({ id: uuid(51), researchObjectId: roId, branchId: uuid(52) });
      db.versions.push({ ...f.version, status: 'draft', versionNo: 1, commitId: uuid(51), publicVersionId: null });
      db.agentSessions.push({ ...f.parentTask.session, kind: 'visualization' });
      db.agentTasks.push(f.parentTask, ...f.frameTasks);
      // Reuse the existing native-source fixture readers; creation, billing, claim and completion remain real Domain calls.
      Object.assign(prisma, { claimNode: f.deps.prisma.claimNode, evidenceRecord: f.deps.prisma.evidenceRecord,
        presentationAsset: { ...prisma.presentationAsset, findUnique: f.deps.prisma.presentationAsset.findUnique,
          findMany: f.deps.prisma.presentationAsset.findMany }, ingestionTask: f.deps.prisma.ingestionTask,
        trashEntry: f.deps.prisma.trashEntry, trashObjectCleanup: f.deps.prisma.trashObjectCleanup,
        version: { ...prisma.version, findFirst: f.deps.prisma.version.findFirst } });
      // The existing in-memory Prisma fixture returns ordinary promises, not Prisma's branded client objects.
      prisma.usageLedger.findUnique = (async ({ where }: Prisma.UsageLedgerFindUniqueArgs) =>
        db.usageLedger.find(row => row.idempotencyKey === where.idempotencyKey) ?? null) as unknown as typeof prisma.usageLedger.findUnique;
      const updateTask = prisma.agentTask.updateMany.bind(prisma.agentTask);
      const events: string[] = []; let insideTransaction = false;
      const completedAttempts: number[] = [];
      prisma.agentTask.updateMany = (async (args: Prisma.AgentTaskUpdateManyArgs) => {
        const row = db.agentTasks.find(item => item.id === args.where?.id);
        const filter = args.where?.result as { equals?: unknown } | undefined;
        if (filter && !isDeepStrictEqual(filter.equals === Prisma.AnyNull ? null : filter.equals, row?.result)) return { count: 0 };
        const beforeGrant = row?.result?.audioAuditionGrant;
        const changed = await updateTask(args);
        const result = args.data.result as Record<string, unknown> | undefined;
        if (changed.count && result?.audioAuditionGrant && !beforeGrant) events.push('grant-cas');
        if (changed.count && filter && result?.audioAudition) {
          completedAttempts.push(Number(args.where?.executionAttempt)); events.push('private-result-cas');
        }
        return changed;
      }) as unknown as typeof prisma.agentTask.updateMany;
      const transact = prisma.$transaction.bind(prisma);
      const transactionOptions: unknown[] = [];
      prisma.$transaction = (async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: unknown) => {
        insideTransaction = true; transactionOptions.push(options);
        try { const result = await transact(operation); events.push('commit'); return result; }
        finally { insideTransaction = false; }
      }) as typeof prisma.$transaction;
      const kv = new Map<string, string>(), queued: string[] = [];
      const redis = { set: async (key: string, value: string) => { kv.set(key, value); return 'OK'; },
        get: async (key: string) => kv.get(key) ?? null, expire: async () => 1, del: async (key: string) => Number(kv.delete(key)),
        lpush: async (key: string, id: string) => { expect(key).toBe('agent:queue'); queued.unshift(id); return queued.length; },
        brpoplpush: async () => queued.pop() ?? null, lrem: async () => 1 };
      const cfg = { inbox: join(f.dir, 'inbox'), results: join(f.dir, 'results'), privateRoot: join(f.dir, 'private'),
        keyPath: join(f.dir, 'unused-key'), rendererImage: `sha256:${'a'.repeat(64)}`, model: 'ltx23', resolution: '720p',
        referenceMode: 'synclip-receipt', adapterRevision: 'synclip-video-v2', adminModelsEnabled: false,
        audioAuditionEnabled: true, audioAuditionBudget: { maxEstimatedCoins: 7 }, audio: f.proposal.audio };
      await Promise.all([cfg.inbox, cfg.results, cfg.privateRoot].map(path => mkdir(path)));
      const providerCalls: Array<{ method: string; url: string }> = [];
      let originalGrant: Record<string, unknown> | undefined;
      const narration = doc.scenes[1]!.narration, characters = [...narration].length, rate = 0.1;
      const brokerDeps = { readKey: async () => 'synthetic-test-key',
        audioFetch: async (url: string, options: RequestInit) => {
          const method = options.method ?? 'GET'; providerCalls.push({ method, url });
          if (method === 'POST') {
            expect(insideTransaction).toBe(false); expect(originalGrant).toBeDefined();
            expect(events.slice(0, events.indexOf('grant-cas') + 2).slice(-2)).toEqual(['grant-cas', 'commit']);
            expect(JSON.parse(String(options.body))).toEqual({ text: narration, voice: cfg.audio.voice, speed: cfg.audio.speed });
          }
          const data = url.endsWith('/voices') ? [{ id: cfg.audio.voice, name: 'Synthetic catalog voice', gender: 'Female', languages: ['zh'],
            is_premium: false, coins_per_char: rate, preview_url: null }]
            : method === 'POST' ? { task_id: 'vertical-original-tts', status: 'queued' }
              : { task_id: 'vertical-original-tts', status: 'completed', output: { type: 'audio', url: 'https://cdn.synclip.ai/fixture.mp3' },
                coins_used: characters * rate, url_expires_at: '2099-01-01T00:00:00Z' };
          return Response.json({ success: true, data });
        },
        downloadAudio: async () => ({ bytes: f.mp3, format: 'mp3', contentType: 'audio/mpeg' }), decodeAudio: async () => 2.5,
        fetch: async () => { throw Error('audio audition attempted a video request'); },
        resolveReference: async () => { throw Error('audio audition resolved a video reference'); },
        render: async () => { throw Error('audio audition rendered a video'); } };
      // Initial heartbeat comes from the actual broker; no hand-authored result JSON is used.
      expect(await runSynclipVideoBrokerOnce(cfg, brokerDeps)).toBeNull();
      const readPolicy = async () => {
        const ready = JSON.parse(await readFile(join(cfg.results, '.ready'), 'utf8'));
        return ready.audioAccepting ? { audio: ready.narration, maxEstimatedCoins: ready.audioAuditionBudget.maxEstimatedCoins } : null;
      };
      const deps = { prisma, redis: redis as unknown as WorkerDeps['redis'], storage, mailer: createFakeMailer(), videoEnabled: true,
        readVideoReadiness: async () => false, readAudioAuditionReadiness: readPolicy };
      const token = await createSession(deps.redis, { userId: actorId, status: 'email_verified' });
      app = await buildApp({ ...deps, mailer: createFakeMailer(), cookieSecret: 'synthetic-cookie-secret', secureCookies: false,
        security: { csrf: true }, rateLimitEnabled: false });
      const csrf = await app.inject({ method: 'GET', url: '/csrf-token' });
      const cookies = { openscience_session: token, _csrf: csrf.cookies.find(cookie => cookie.name === '_csrf')!.value };
      const response = await app.inject({ method: 'POST',
        url: `/research-objects/${roId}/versions/${versionId}/presentation-assets/generations`, cookies,
        headers: { 'x-csrf-token': csrf.json().csrfToken, 'idempotency-key': 'one-real-broker-audition' },
        payload: { kind: 'video', sourceClaimIds: [claimId], video: f.owner.payload.video } });
      expect(response.statusCode, response.body).toBe(202);
      const taskId = response.json().task.id as string;
      expect(queued).toEqual([taskId]);
      expect(db.usageLedger.filter(row => row.metadata?.taskId === taskId).map(row => row.delta)).toEqual([1n, -1n]);
      const authorize = createAudioAuditionAuthorization(deps);
      const spool = new SynclipVideoSpool({ inboxDir: cfg.inbox, resultsDir: cfg.results, timeoutMs: 60_000,
        authorizeAudioAudition: async proposal => {
          const grant = await authorize(proposal); originalGrant = structuredClone(grant) as unknown as Record<string, unknown>;
          expect(insideTransaction).toBe(false);
          await expect(readFile(join(cfg.inbox, taskId, 'request.json'))).rejects.toMatchObject({ code: 'ENOENT' });
          return grant;
        }, sleep: async () => {
          cfg.audioAuditionBudget.maxEstimatedCoins = 5; // The actual Host applies its fresh, stricter finite cap.
          expect(await runSynclipVideoBrokerOnce(cfg, brokerDeps)).toEqual({ id: taskId, status: 'succeeded' });
        } });
      const handler = createPresentationGenerationHandler({ videoSpool: spool });
      expect(await (await createPollOnce({ 'presentation.generate': handler }, { runMaintenance: false }))(deps)).toBe(true);
      const raw = db.agentTasks.find(row => row.id === taskId)!;
      expect(raw.error).toBeNull(); expect(raw.status).toBe('succeeded'); expect(raw.executionAttempt).toBe(1);
      expect(raw.result.audioAuditionGrant).toEqual(originalGrant);
      expect(Number(originalGrant!.deadlineAt) - Number(originalGrant!.createdAt)).toBe(60_000);
      expect(originalGrant).toMatchObject({ workerMaxEstimatedCoins: 7, hostMaxEstimatedCoins: 7, executionAttempt: 1 });
      expect(completedAttempts).toEqual([1]);
      expect(transactionOptions).toContainEqual(expect.objectContaining({ isolationLevel: 'Serializable' }));
      const audio = raw.result.audioAudition;
      expect(audio).toMatchObject({ taskId, executionAttempt: 1, audioTaskId: 'vertical-original-tts', durationSeconds: 2.5,
        contentType: 'audio/mpeg', timingStatus: 'decoded', quote: { coinsPerCharacter: rate, characters,
          estimatedCoins: characters * rate, workerCeiling: 7, hostCeiling: 5 }, coinsUsed: characters * rate });
      const stored = await storage.getObject(audio.objectKey);
      expect(await streamToBuffer(stored.body)).toEqual(f.mp3);
      expect(await storage.headObject(audio.objectKey)).toMatchObject({ size: f.mp3.length, contentType: 'audio/mpeg', sha256: audio.contentHash });
      expect(providerCalls.filter(call => call.method === 'POST')).toHaveLength(1);
      expect(db.presentationAssets).toHaveLength(0); expect(storageErrors).toEqual([]);
      await expect(readFile(join(cfg.results, taskId, 'result.mp4'))).rejects.toMatchObject({ code: 'ENOENT' });
      const projected = await app.inject({ method: 'GET', url: `/research-objects/${roId}/versions/${versionId}/presentation-tasks/${taskId}`, cookies });
      expect(projected.statusCode, projected.body).toBe(200);
      expect(projected.json().task.result).toEqual({ purpose: 'audio-audition', audioAudition: {
        taskId, sceneIndex: 1, contentType: 'audio/mpeg', durationSeconds: 2.5, timingStatus: 'decoded' } });
      const downloaded = await app.inject({ method: 'GET',
        url: `/research-objects/${roId}/versions/${versionId}/presentation-tasks/${taskId}/audio`, cookies });
      expect(downloaded.statusCode, downloaded.body).toBe(200);
      expect(downloaded.headers['content-type']).toBe('audio/mpeg');
      expect(downloaded.headers['cache-control']).toBe('private, no-store');
      expect(downloaded.rawPayload).toEqual(f.mp3);
    } finally {
      await app?.close(); await new Promise<void>((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()));
      await rm(f.dir, { recursive: true });
    }
  });

  it.each(['hash', 'role', 'parent', 'attempt', 'payload', 'workspace', 'cas'])('rejects changed %s before private result completion', async reason => {
    const f = await handlerFixture();
    try {
      if (reason === 'hash') f.corruptOutput();
      f.afterAudio(() => {
        if (reason === 'role') f.state.role = 'viewer';
        if (reason === 'parent') f.frames[1]!.deletedAt = new Date();
        if (reason === 'attempt') f.owner.executionAttempt++;
        if (reason === 'payload') f.owner.payload.video.sceneIndex = 0;
        if (reason === 'workspace') f.owner.session.researchObject.workspaceId = uuid(90);
        if (reason === 'cas') f.state.rejectCas = true;
      });
      await f.run(f.handler);
      expect(f.owner.status).toBe(reason === 'attempt' ? 'running' : 'failed');
      expect(f.owner.result.audioAudition).toBeUndefined(); expect(f.generated).toBe(0);
    } finally { await rm(f.dir, { recursive: true }); }
  });
});
