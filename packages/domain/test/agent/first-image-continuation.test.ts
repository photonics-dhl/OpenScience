import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { seedUser } from '../helpers/fakes';
import { createHermesFirstImageContinuation, findFirstImageContinuation, FIRST_IMAGE_CONTINUATION, readFirstImageContinuationAuthority } from '../../src/agent/first-image-continuation';
import { reconcileHermesResearchRuns, recoverCompletedHermesSceneImageResults, requireHermesPresentationTaskAuthority } from '../../src/agent/research-run';
import { claimAgentTask, prepareAgentTaskForCrashRecovery } from '../../src/agent/agent';
import { readVisualNarrativeSource } from '../../src/assets/illustration-source';

import { completeImage, fixture, id, plannedFixture, renderingFixture } from './first-image-continuation-fixture';

describe('first-image fixture JSON compare-and-set semantics', () => {
  it.each([null, undefined])('matches a null or missing result with AnyNull: %s', async value => {
    const f = fixture(); const task = f.db.agentTasks.find(t => t.id === id(15))!;
    task.result = value;
    expect(await f.prisma.agentTask.updateMany({ where: { id: task.id, result: { equals: Prisma.AnyNull } },
      data: { progress: 11 } })).toEqual({ count: 1 });
    expect(task.progress).toBe(11);
  });
  it('refuses AnyNull for a nonnull result without writing it', async () => {
    const f = fixture(); const task = f.db.agentTasks.find(t => t.id === id(15))!;
    task.result = { summary: 'retained evidence' }; task.progress = 10;
    expect(await f.prisma.agentTask.updateMany({ where: { id: task.id, result: { equals: Prisma.AnyNull } },
      data: { progress: 11 } })).toEqual({ count: 0 });
    expect(task).toMatchObject({ progress: 10, result: { summary: 'retained evidence' } });
  });
  it('retains deep object result equality and the original payload condition', async () => {
    const f = fixture(); const task = f.db.agentTasks.find(t => t.id === id(15))!;
    task.result = { nested: { summary: 'retained evidence' } };
    const payload = structuredClone(task.payload), result = structuredClone(task.result);
    expect(await f.prisma.agentTask.updateMany({ where: { id: task.id, result: { equals: result }, payload: { equals: payload } },
      data: { progress: 11 } })).toEqual({ count: 1 });
    expect(await f.prisma.agentTask.updateMany({ where: { id: task.id, result: { equals: { nested: { summary: 'different' } } } },
      data: { progress: 12 } })).toEqual({ count: 0 });
    expect(await f.prisma.agentTask.updateMany({ where: { id: task.id, result: { equals: result }, payload: { equals: { ...payload, goal: 'changed' } } },
      data: { progress: 13 } })).toEqual({ count: 0 });
    expect(task).toMatchObject({ progress: 11, result, payload });
  });
  it('does not treat an absent task as a matching null row', async () => {
    const f = fixture();
    expect(await f.prisma.agentTask.updateMany({ where: { id: id(99), result: { equals: Prisma.AnyNull } },
      data: { progress: 11 } })).toEqual({ count: 0 });
  });
});

describe('current Hermes first-image continuation', () => {
  it('advances a real Native terminal plan into one image and completes with an unadopted private draft', async () => {
    const f = await renderingFixture();
    expect(f.db.agentTasks.filter(t => t.kind === 'presentation.generate')).toHaveLength(2);
    expect(f.db.presentationAssets[0].status).toBe('approved'); // Internal plan only.
    const ledger = structuredClone(f.db.usageLedger);
    await requireHermesPresentationTaskAuthority(f.prisma, { taskId: f.image.id, actorId: id(1), payload: f.image.payload,
      authority: f.image.payload.hermesRunAuthority });
    await completeImage(f);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.hermesResearchRuns[0].status).toBe('succeeded');
    expect(f.db.presentationAssets.find(a => a.id === f.image.id)?.status).toBe('draft');
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.usageLedger).toEqual(ledger);
    expect(f.db.agentTasks.filter(t => t.kind === 'presentation.generate')).toHaveLength(2);
  });
  it('recovers a lost guide result by exact origin GET identity without restarting the plan', async () => {
    const f = await plannedFixture();
    const guide = f.db.agentTasks.find(t => t.id === f.input.guideTaskId)!;
    guide.status = 'failed'; guide.result = null;
    const before = structuredClone(f.db.usageLedger);
    expect(await findFirstImageContinuation(f.prisma, { actorId: id(1), researchObjectId: id(3), originGuideTaskId: guide.id })).toBe(f.started.runId);
    expect(f.db.usageLedger).toEqual(before);
    expect(f.db.agentTasks.filter(t => t.kind === 'presentation.generate')).toHaveLength(1);
    await expect(findFirstImageContinuation(f.prisma, { actorId: id(18), researchObjectId: id(3), originGuideTaskId: guide.id })).rejects.toThrow();
  });
  it.each(['admin_reviewed_import', 'version_history_copy'])('does not turn a %s asset into a generated first-image result', async source => {
    const f = await renderingFixture(); await completeImage(f);
    f.db.presentationAssets.find(a => a.id === f.image.id)!.provenance.source = source;
    const ledger = structuredClone(f.db.usageLedger);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.hermesResearchRuns[0].status).toBe('stopped'); expect(f.db.usageLedger).toEqual(ledger);
  });
  it.each(['blocked', 'multiple-scenes', 'missing-receipt', 'changed-source', 'changed-session', 'changed-slot'])(
    'does not enqueue an image after %s', async reason => {
      const f = await plannedFixture();
      if (reason === 'blocked') f.review.decision = 'blocked';
      if (reason === 'multiple-scenes') f.document.scenes.push(structuredClone(f.document.scenes[0]!));
      if (reason === 'missing-receipt') f.db.auditLogs.length = 0;
      if (reason === 'changed-source') f.db.claimNodes[0].statement = 'Changed scientific meaning';
      if (reason === 'changed-session') f.db.agentSessions.find(s => s.id === f.parent.sessionId)!.userId = id(99);
      if (reason === 'changed-slot') f.db.hermesResearchSteps.find(s => s.stage === 'scene_image')!.ordinal = 1;
      const before = structuredClone(f.db.usageLedger);
      await reconcileHermesResearchRuns(f.deps); await reconcileHermesResearchRuns(f.deps);
      expect(f.db.agentTasks.filter(t => t.payload?.kind === 'image')).toHaveLength(0);
      expect(f.db.usageLedger).toEqual(before);
    });
  it.each(['completed', 'uncertain'] as const)('only reconnects an original completed paid result: %s', async state => {
    const f = await renderingFixture();
    Object.assign(f.image, { status: 'failed', executionAttempt: 1, retryCount: 0, error: 'image submission timeout' });
    const slot = f.db.hermesResearchSteps.find(s => s.stage === 'scene_image')!; slot.status = 'failed'; slot.presentationAssetId = null;
    f.db.hermesResearchRuns[0].status = 'failed';
    const before = structuredClone(f.db.usageLedger);
    const result = await recoverCompletedHermesSceneImageResults({ ...f.deps, inspectImageRecoveryState: async () => state });
    expect(result.resumed).toBe(state === 'completed' ? 1 : 0);
    expect(f.db.usageLedger).toEqual(before);
    expect(f.db.agentTasks.filter(t => t.payload?.kind === 'image')).toHaveLength(1);
    if (state === 'completed') {
      expect(f.image.status).toBe('pending'); expect(f.image.retryCount).toBe(1);
      expect((await recoverCompletedHermesSceneImageResults({ ...f.deps, inspectImageRecoveryState: async () => state })).resumed).toBe(0);
    }
  });
  it('keeps an actual startup-reclaimed paid image recoverable through reconciliation and returns the same draft', async () => {
    const f = await renderingFixture();
    expect(await claimAgentTask(f.deps, f.image.id)).toMatchObject({ executionAttempt: 1 });
    expect(await prepareAgentTaskForCrashRecovery(f.deps, f.image.id)).toBe(true);
    expect(await claimAgentTask(f.deps, f.image.id)).toMatchObject({ executionAttempt: 2 });
    Object.assign(f.image, { status: 'failed', error: '[blocked] Previous paid image attempt has no saved result; explicit new generation is required' });
    const ledger = structuredClone(f.db.usageLedger), taskIds = f.db.agentTasks.map(t => t.id);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.hermesResearchRuns[0].status).toBe('failed');
    expect((await recoverCompletedHermesSceneImageResults({ ...f.deps, inspectImageRecoveryState: async () => 'uncertain' })).resumed).toBe(0);
    expect((await recoverCompletedHermesSceneImageResults({ ...f.deps, inspectImageRecoveryState: async () => 'completed' })).resumed).toBe(1);
    expect(await claimAgentTask(f.deps, f.image.id)).toMatchObject({ executionAttempt: 3 });
    await completeImage(f);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.hermesResearchRuns[0].status).toBe('succeeded');
    expect(f.db.presentationAssets.find(a => a.id === f.image.id)?.status).toBe('draft');
    expect(f.db.agentTasks.map(t => t.id)).toEqual(taskIds); expect(f.db.usageLedger).toEqual(ledger);
  });
  it.each(['unrelated-error', 'used-retry', 'review-submitted'])(
    'does not reopen a stopped first-image run for %s', async reason => {
      const f = await renderingFixture();
      Object.assign(f.image, { status: 'failed', executionAttempt: 2, retryCount: 0,
        error: '[blocked] Previous paid image attempt has no saved result; explicit new generation is required' });
      if (reason === 'unrelated-error') f.image.error = '[blocked] source binding changed';
      if (reason === 'used-retry') f.image.retryCount = 1;
      if (reason === 'review-submitted') f.image.result.nativeImageReview = { mode: 'model-native', state: 'started' };
      const ledger = structuredClone(f.db.usageLedger);
      await reconcileHermesResearchRuns(f.deps);
      expect(f.db.hermesResearchRuns[0].status).toBe('stopped');
      expect((await recoverCompletedHermesSceneImageResults({ ...f.deps, inspectImageRecoveryState: async () => 'completed' })).resumed).toBe(0);
      expect(f.db.usageLedger).toEqual(ledger);
    });
  it('keeps collaborator task ownership while retaining the original source producer', async () => {
    const f = fixture();
    seedUser(f.db, { id: id(18) });
    f.db.ingestionBatches[0].userId = id(18);
    f.db.agentSessions.push({ id: id(19), userId: id(18), researchObjectId: id(3), status: 'active', kind: 'extract' });
    f.db.agentTasks.find(t => t.id === id(11))!.sessionId = id(19);
    const scope = { userId: id(1), workspaceId: id(2), researchObjectId: id(3), versionId: id(4), sourceClaimIds: [id(6)] };
    await expect(readVisualNarrativeSource(f.prisma as never, scope)).rejects.toThrow('source is unavailable');
    const created = await createHermesFirstImageContinuation(f.deps, f.input);
    const plan = f.db.hermesResearchSteps.find(s => s.runId === created.runId && s.stage === 'storyboard')!;
    expect(await readVisualNarrativeSource(f.prisma as never, scope, { runId: created.runId, taskId: plan.agentTaskId })).toBeDefined();
    const planTask = f.db.agentTasks.find(t => t.id === plan.agentTaskId)!;
    expect(f.db.agentSessions.find(s => s.id === planTask.sessionId)?.userId).toBe(id(1));
    expect(f.db.ingestionBatches[0].userId).toBe(id(18));
    await expect(readVisualNarrativeSource(f.prisma as never, scope, { runId: created.runId, taskId: id(99) })).rejects.toThrow();
    f.db.memberships[0].role = 'viewer';
    await expect(readVisualNarrativeSource(f.prisma as never, scope, { runId: created.runId, taskId: plan.agentTaskId })).rejects.toThrow();
  });
  it('starts exactly one Native plan from saved science without starting source analysis', async () => {
    const f = fixture();
    const result = await createHermesFirstImageContinuation(f.deps, f.input);
    expect(result.versionId).toBe(id(4));
    expect(f.db.hermesResearchRuns).toHaveLength(1);
    expect(f.db.hermesResearchSteps.map(s => s.stage).sort()).toEqual(['scene_image', 'source_ingestion', 'storyboard']);
    const tasks = f.db.agentTasks.filter(t => t.kind === 'presentation.generate');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].payload.storyboard).toMatchObject({ instruction: f.goal, output: 'image', narrativeSceneLimit: 1, style: 'auto' });
    expect(f.db.agentTasks.filter(t => t.kind === 'sdf.extract')).toHaveLength(1);
    expect(f.db.auditLogs.find(a => a.action === FIRST_IMAGE_CONTINUATION)?.metadata).toMatchObject({
      maxRenderTasks: 1, publicationAuthorized: false, automaticImageRepair: false, originGuideTaskId: id(15),
    });
    const ledgerCount = f.db.usageLedger.length;
    expect(await createHermesFirstImageContinuation(f.deps, f.input)).toEqual(result);
    expect(f.db.usageLedger).toHaveLength(ledgerCount);
    expect(f.db.agentTasks.filter(t => t.kind === 'presentation.generate')).toHaveLength(1);
    expect(await readFirstImageContinuationAuthority(f.prisma as never, { runId: result.runId, actorId: id(1) })).not.toBeNull();
  });
  it('fences a lost guide claim before reserving any plan or credit', async () => {
    const f = fixture(); const ledger = structuredClone(f.db.usageLedger);
    vi.mocked(f.prisma.agentTask.updateMany).mockResolvedValueOnce({ count: 0 });
    await expect(createHermesFirstImageContinuation(f.deps, f.input)).rejects.toThrow('changed before continuation');
    expect(f.db.hermesResearchRuns).toHaveLength(0);
    expect(f.db.agentTasks.filter(t => t.kind === 'presentation.generate')).toHaveLength(0);
    expect(f.db.usageLedger).toEqual(ledger);
  });
  it('does not allocate a second active run when the same request arrives under another guide task', async () => {
    const f = fixture(); await createHermesFirstImageContinuation(f.deps, f.input);
    const ledger = structuredClone(f.db.usageLedger);
    f.db.agentTasks.push({ ...structuredClone(f.db.agentTasks.find(t => t.id === f.input.guideTaskId)), id: id(98) });
    await expect(createHermesFirstImageContinuation(f.deps, { ...f.input, guideTaskId: id(98) })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    expect(f.db.hermesResearchRuns).toHaveLength(1); expect(f.db.usageLedger).toEqual(ledger);
  });
  it.each(['receipt', 'manifest', 'map', 'producer', 'source-pointer', 'archived', 'task-payload'])(
    'revalidates %s before a subsequent task can execute', async reason => {
      const f = await plannedFixture();
      f.parent.status = 'running';
      await expect(requireHermesPresentationTaskAuthority(f.prisma, { taskId: f.parent.id, actorId: id(1), payload: f.parent.payload,
        authority: f.parent.payload.hermesRunAuthority })).resolves.toBeUndefined();
      if (reason === 'receipt') f.db.auditLogs.find(r => r.action === FIRST_IMAGE_CONTINUATION)!.metadata.maxRenderTasks = 2;
      if (reason === 'manifest') f.db.versionManifests[0].coreJson = { title: 'Another paper' };
      if (reason === 'map') f.db.agentTasks.find(t => t.id === id(11))!.result.sourceMapRef.serializedSha256 = 'b'.repeat(64);
      if (reason === 'producer') f.db.agentSessions.find(s => s.id === id(10))!.userId = id(99);
      if (reason === 'source-pointer') f.db.ingestionTasks[0].agentTaskId = id(99);
      if (reason === 'archived') f.db.workspaces[0].status = 'archived';
      if (reason === 'task-payload') f.parent.payload.storyboard.instruction = 'Unrelated changed instruction';
      const ledger = structuredClone(f.db.usageLedger);
      await expect(requireHermesPresentationTaskAuthority(f.prisma, { taskId: f.parent.id, actorId: id(1), payload: f.parent.payload,
        authority: f.parent.payload.hermesRunAuthority })).rejects.toThrow();
      expect(f.db.usageLedger).toEqual(ledger);
    });
  it.each(['old-payload', 'old-attempt', 'viewer', 'published', 'deleted-source', 'changed-evidence', 'unreviewed', 'other-session'])(
    'does not create or charge on %s', async reason => {
      const f = fixture(); const guide = f.db.agentTasks.find(t => t.id === id(15))!;
      if (reason === 'old-payload') delete guide.payload.executionIntent;
      if (reason === 'old-attempt') guide.executionAttempt = 2;
      if (reason === 'viewer') f.db.memberships[0].role = 'viewer';
      if (reason === 'published') f.db.versions[0].status = 'published';
      if (reason === 'deleted-source') f.db.artifacts[0].deletedAt = new Date();
      if (reason === 'changed-evidence') f.db.evidenceRecords[0].contentHash = 'b'.repeat(64);
      if (reason === 'unreviewed') f.db.ingestionTasks[0].state = 'needs_review';
      if (reason === 'other-session') f.db.agentSessions[0].researchObjectId = id(99);
      const ledgerCount = f.db.usageLedger.length;
      await expect(createHermesFirstImageContinuation(f.deps, f.input)).rejects.toThrow();
      expect(f.db.agentTasks.filter(t => t.kind === 'presentation.generate')).toHaveLength(0);
      expect(f.db.usageLedger).toHaveLength(ledgerCount);
    });
});
