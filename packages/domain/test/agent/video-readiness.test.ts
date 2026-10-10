import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../helpers/fakes';
import { claimAgentTask, markTaskProgress } from '../../src/agent/agent';
import { retryIngestionTaskInTransaction } from '../../src/ingestion/ingestion-service';
import { getHermesVideoCapability, type HermesResearchRunDeps } from '../../src/agent/research-run';
import { HermesVideoUnavailableError, isHermesVideoReady, requireHermesVideoReady, isHermesVideoTask, isHermesVideoRun, type HermesVideoReadinessDeps } from '../../src/agent/video-readiness';

describe('Hermes video run intent', () => {
  it.each([
    { profile: 'visual-narrative-v1', generationSettings: { output: 'video' }, video: true },
    { profile: 'visual-narrative-v1', generationSettings: {}, video: false },
    { profile: 'visual-narrative-v1', generationSettings: null, video: false },
    { profile: 'visual-narrative-v1', generationSettings: { output: 'image' }, video: false },
    { profile: 'content-driven-v1', generationSettings: null, video: true },
    { profile: 'content-driven-v1', generationSettings: { output: 'video' }, video: true },
    { profile: 'onchip-field-sampling-v1', generationSettings: null, video: true },
    { profile: 'content-driven-image-v1', generationSettings: null, video: false },
    { profile: 'content-driven-image-v1', generationSettings: { output: 'video' }, video: false },
    { profile: 'unknown', generationSettings: { output: 'video' }, video: false },
    { profile: null, generationSettings: { output: 'video' }, video: false },
  ])('recognizes $profile / $generationSettings as video=$video without changing settings', input => {
    const before = structuredClone(input);
    expect(isHermesVideoRun(input)).toBe(input.video);
    expect(input).toEqual(before);
  });
});

describe('Hermes video readiness', () => {
  it.each([undefined, false, 1, 'true'])('fails closed for server flag %s without reading the host', async flag => {
    const readVideoReadiness = vi.fn(async () => true);
    expect(await isHermesVideoReady({ videoEnabled: flag, readVideoReadiness } as HermesVideoReadinessDeps)).toBe(false);
    expect(readVideoReadiness).not.toHaveBeenCalled();
  });

  it.each([undefined, null, false, 1, 'true', {}])('requires a strict true host result, got %s', async result => {
    expect(await isHermesVideoReady({ videoEnabled: true, readVideoReadiness: async () => result } as HermesVideoReadinessDeps)).toBe(false);
  });

  it('fails closed when the reader is missing or throws, without retaining sensitive details', async () => {
    expect(await isHermesVideoReady({ videoEnabled: true })).toBe(false);
    const deps = { videoEnabled: true, readVideoReadiness: async () => { throw new Error('/private/config voice=private-value'); } };
    expect(await isHermesVideoReady(deps)).toBe(false);
    const error = await requireHermesVideoReady(deps).catch(value => value);
    expect(error).toBeInstanceOf(HermesVideoUnavailableError);
    expect(error).toMatchObject({ code: 'VIDEO_UNAVAILABLE', message: 'Video generation is temporarily unavailable.' });
    expect(error).not.toHaveProperty('cause');
    expect(String(error)).not.toMatch(/private|voice|config/u);
  });

  it('rereads dynamic readiness on every call', async () => {
    const readVideoReadiness = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const deps = { videoEnabled: true, readVideoReadiness };
    await expect(requireHermesVideoReady(deps)).resolves.toBeUndefined();
    expect(await isHermesVideoReady(deps)).toBe(false);
    expect(await isHermesVideoReady(deps)).toBe(true);
    expect(readVideoReadiness).toHaveBeenCalledTimes(3);
  });
});

describe('independent narration audition admission', () => {
  const policy = { audio: { provider: 'synclip' as const, voice: 'selected-voice', speed: 1 }, maxEstimatedCoins: 200 };
  it('admits explicit speech readiness while leaving full-video admission closed', async () => {
    const deps = { videoEnabled: true, readVideoReadiness: async () => false,
      readAudioAuditionReadiness: async () => policy };
    expect(await isHermesVideoReady(deps, 'audio-audition')).toBe(true);
    expect(await isHermesVideoReady(deps)).toBe(false);
  });
  it.each([null, undefined, { ...policy, maxEstimatedCoins: 0 }, { ...policy, maxEstimatedCoins: Infinity },
    { ...policy, audio: { ...policy.audio, voice: '' } }])('refuses missing or invalid server speech budget %j', async value => {
    expect(await isHermesVideoReady({ videoEnabled: true, readAudioAuditionReadiness: async () => value } as never, 'audio-audition')).toBe(false);
  });
  it('does not turn a legacy full-video true into speech permission', async () => {
    expect(await isHermesVideoReady({ videoEnabled: true, readVideoReadiness: async () => true }, 'audio-audition')).toBe(false);
  });
});

function sourceTaskFixture() {
  const f = capabilityFixture();
  const { prisma } = f.deps;
  const { db } = f;
  db.agentSessions.push({ id: 'old-session', userId: 'actor', researchObjectId: 'ro', kind: 'ingestion', deletedAt: null },
    { id: 'new-session', userId: 'actor', researchObjectId: 'ro', kind: 'ingestion', deletedAt: null });
  const payload = { artifactId: 'artifact', researchObjectId: 'ro' };
  db.agentTasks.push({ id: 'old-task', kind: 'sdf.extract', sessionId: 'old-session', payload, deletedAt: null },
    { id: 'new-task', kind: 'sdf.extract', sessionId: 'new-session', payload, status: 'pending', deletedAt: null });
  db.ingestionBatches.push({ id: 'old-batch', userId: 'actor', researchObjectId: 'ro', agentSessionId: 'old-session' },
    { id: 'new-batch', userId: 'actor', researchObjectId: 'ro', agentSessionId: 'new-session' });
  db.ingestionTasks.push({ id: 'old-ingestion', batchId: 'old-batch', artifactId: 'artifact', agentTaskId: 'old-task' },
    { id: 'new-ingestion', batchId: 'new-batch', artifactId: 'artifact', agentTaskId: 'new-task' });
  db.auditLogs.push({ actorId: 'actor', workspaceId: 'workspace', action: 'ingestion.task.reanalyze', targetType: 'ingestion_task',
    targetId: 'new-ingestion', metadata: { requestedOutput: 'video', newAgentTaskId: 'new-task', artifactId: 'artifact',
      sourceIngestionTaskId: 'old-ingestion', sourceAgentTaskId: 'old-task' } });
  // This read operation is not supplied by the shared fake. Query the persisted rows, including scope decoys.
  Object.assign(prisma.auditLog, { findMany: async ({ where }: { where: Record<string, unknown> }) =>
    db.auditLogs.filter(row => Object.entries(where).every(([key, value]) => {
      if (key !== 'metadata') return row[key] === value;
      const filter = value as { path: string[]; equals: unknown };
      return filter.path.reduce((nested, part) => nested?.[part], row.metadata) === filter.equals;
    })) });
  return { ...f, prisma };
}

function parserRetryFixture() {
  const f = sourceTaskFixture();
  Object.assign(f.db.agentTasks[0], { status: 'pending', executionAttempt: 1, retryCount: 1 });
  f.db.ingestionTasks[0].retryCount = 1;
  f.db.hermesResearchRuns.push({ id: 'run', actorId: 'actor', researchObjectId: 'ro', profile: 'visual-narrative-v1',
    generationSettings: { output: 'video' }, version: 2 });
  f.db.hermesResearchSteps.push({ id: 'source-step', runId: 'run', stage: 'source_ingestion', ingestionTaskId: 'old-ingestion',
    artifactId: 'artifact', agentTaskId: 'old-task' });
  f.db.auditLogs[0] = { actorId: 'actor', workspaceId: 'workspace', action: 'ingestion.task.retry', targetType: 'ingestion_task',
    targetId: 'old-ingestion', metadata: { agentTaskId: 'old-task', runId: 'run', sourceStepId: 'source-step',
      clientIdempotencyKey: 'parser-retry', requestDigest: 'c'.repeat(64), previousVersion: 1,
      explicitUserAction: true, possibleDuplicateProviderCharge: true, previousExecutionAttempt: 1,
      previousAgentRetryCount: 0, retryAttempt: 1 } };
  return f;
}

async function committedParserRetryFixture() {
  const f = parserRetryFixture();
  f.db.auditLogs.length = 0;
  f.db.agentSessions[0].status = 'active';
  f.db.artifacts.push({ id: 'artifact', workspaceId: 'workspace', blobSha256: 'a'.repeat(64),
    deletedAt: null, bytesPurgedAt: null });
  const sourceMapRef = { schemaVersion: 1, parserStatus: 'needs_review', artifactId: 'artifact', contentHash: 'a'.repeat(64),
    objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100 };
  Object.assign(f.db.agentTasks[0], { status: 'succeeded', retryCount: 0, progress: 100, error: null,
    result: { status: 'needs_review', reason: 'unresolved pages remain', sourceMapRef } });
  Object.assign(f.db.ingestionTasks[0], { state: 'needs_review', retryCount: 0, error: null });
  f.db.hermesResearchRuns[0].version = 1;
  f.deps.audit = { record: async (event, tx) => {
    await (tx as typeof f.prisma).auditLog.create({ data: event as never });
  } };
  await f.prisma.$transaction(tx => retryIngestionTaskInTransaction(f.deps, tx,
    { userId: 'actor', taskId: 'old-ingestion' }, {}, { runId: 'run', sourceStepId: 'source-step',
      clientIdempotencyKey: 'parser-retry', requestDigest: 'c'.repeat(64), previousVersion: 1 }));
  return f;
}

function refreshMarkerFixture(internal = false) {
  const f = sourceTaskFixture();
  f.db.agentSessions.push({ id: 'refresh-session', userId: 'actor', researchObjectId: 'ro', kind: 'ingestion', deletedAt: null });
  f.db.agentTasks.push({ id: 'refresh-task', sessionId: 'refresh-session', kind: 'sdf.extract', status: 'pending', deletedAt: null,
    payload: { researchObjectId: 'ro', artifactId: 'artifact' } });
  f.db.ingestionTasks[1].agentTaskId = 'refresh-task';
  f.db.auditLogs.push({ actorId: internal ? null : 'actor', workspaceId: 'workspace',
    action: internal ? 'ingestion.task.system_analysis_refresh' : 'ingestion.task.analysis_refresh',
    targetType: 'ingestion_task', targetId: 'new-ingestion', metadata: { requestedOutput: 'video', newAgentTaskId: 'refresh-task',
      oldAgentTaskId: 'new-task', artifactId: 'artifact', ...(internal ? { executor: 'hermes', authorizedByUserId: 'actor' } : {}) } });
  return f;
}

describe('persisted video task intent', () => {
  it.each(['running', 'succeeded', 'failed'] as const)(
    'retains parser video intent through real retry and claim to %s, but not another unapproved attempt', async status => {
      const f = await committedParserRetryFixture();
      expect(f.db.agentTasks[0]).toMatchObject({ status: 'pending', executionAttempt: 1, retryCount: 1 });
      expect(f.db.auditLogs).toHaveLength(1);
      expect(f.db.auditLogs[0]).toMatchObject({ action: 'ingestion.task.retry', actorId: 'actor',
        workspaceId: 'workspace', targetId: 'old-ingestion', metadata: { previousExecutionAttempt: 1,
          previousAgentRetryCount: 0, retryAttempt: 1, runId: 'run', sourceStepId: 'source-step' } });
      expect(await isHermesVideoTask(f.prisma, 'old-task')).toBe(true);
      await expect(claimAgentTask(f.deps, 'old-task')).resolves.toMatchObject({ status: 'running', executionAttempt: 2 });
      if (status !== 'running') await markTaskProgress(f.deps,
        { taskId: 'old-task', status, expectedExecutionAttempt: 2 });
      const beforeRead = structuredClone(f.db);
      expect(await isHermesVideoTask(f.prisma, 'old-task')).toBe(true);
      expect(f.db).toEqual(beforeRead);
      expect(f.db.usageLedger).toHaveLength(0);
      // A subsequent claim without a fresh retry audit cannot inherit this authorization.
      f.db.agentTasks[0].status = 'pending';
      await expect(claimAgentTask(f.deps, 'old-task')).resolves.toMatchObject({ status: 'running', executionAttempt: 3 });
      expect(await isHermesVideoTask(f.prisma, 'old-task')).toBe(false);
    });

  it('recognizes a bounded parser retry intent, not a shared upload reference', async () => {
    const f = parserRetryFixture();
    expect(await isHermesVideoTask(f.prisma, 'old-task')).toBe(true);
    f.db.auditLogs.length = 0;
    expect(await isHermesVideoTask(f.prisma, 'old-task')).toBe(false);
  });

  it.each(['actor', 'workspace', 'run', 'run-actor', 'run-ro', 'image-run', 'task', 'attempt', 'agent-retry', 'ingestion-retry',
    'explicit', 'charge-warning', 'key', 'digest', 'version', 'target-type', 'target', 'source-actor', 'source-artifact', 'source-step'])(
    'does not trust parser retry with broken %s binding', async change => {
      const f = parserRetryFixture();
      const audit = f.db.auditLogs[0];
      if (change === 'actor') audit.actorId = 'other';
      if (change === 'workspace') audit.workspaceId = 'other';
      if (change === 'run') audit.metadata.runId = 'other';
      if (change === 'run-actor') f.db.hermesResearchRuns[0].actorId = 'other';
      if (change === 'run-ro') f.db.hermesResearchRuns[0].researchObjectId = 'other';
      if (change === 'image-run') f.db.hermesResearchRuns[0].generationSettings = {};
      if (change === 'task') audit.metadata.agentTaskId = 'other';
      if (change === 'attempt') f.db.agentTasks[0].executionAttempt += 1;
      if (change === 'agent-retry') f.db.agentTasks[0].retryCount += 1;
      if (change === 'ingestion-retry') f.db.ingestionTasks[0].retryCount += 1;
      if (change === 'explicit') audit.metadata.explicitUserAction = false;
      if (change === 'charge-warning') audit.metadata.possibleDuplicateProviderCharge = false;
      if (change === 'key') delete audit.metadata.clientIdempotencyKey;
      if (change === 'digest') delete audit.metadata.requestDigest;
      if (change === 'version') f.db.hermesResearchRuns[0].version = 10;
      if (change === 'target-type') audit.targetType = 'agent_task';
      if (change === 'target') audit.targetId = 'other';
      if (change === 'source-actor') f.db.ingestionBatches[0].userId = 'other';
      if (change === 'source-artifact') f.db.ingestionTasks[0].artifactId = 'other';
      if (change === 'source-step') audit.metadata.sourceStepId = 'other';
      expect(await isHermesVideoTask(f.prisma, 'old-task')).toBe(false);
    });

  it.each([false, true])('recognizes propagated refresh video intent with a new session and no run (internal=%s)', async internal => {
    const f = refreshMarkerFixture(internal);
    expect(f.db.hermesResearchRuns).toHaveLength(0);
    expect(f.db.ingestionBatches[1].agentSessionId).not.toBe('refresh-session');
    expect(await isHermesVideoTask(f.prisma, 'refresh-task')).toBe(true);
    expect(await isHermesVideoTask(f.prisma, 'old-task')).toBe(false);
  });

  it.each(['no-audit', 'output', 'payload-only', 'action', 'actor', 'workspace', 'target', 'new-task', 'old-task',
    'old-actor', 'old-ro', 'old-payload', 'artifact', 'source-actor', 'source-ro'])(
    'does not trust a refresh marker with broken %s binding', async change => {
      const f = refreshMarkerFixture();
      const audit = f.db.auditLogs[1];
      if (change === 'no-audit') f.db.auditLogs.splice(1);
      if (change === 'output') audit.metadata.requestedOutput = 'image';
      if (change === 'payload-only') { delete audit.metadata.requestedOutput; f.db.agentTasks[2].payload.output = 'video'; }
      if (change === 'action') audit.action = 'ingestion.task.refresh';
      if (change === 'actor') audit.actorId = 'other';
      if (change === 'workspace') audit.workspaceId = 'other';
      if (change === 'target') audit.targetId = 'old-ingestion';
      if (change === 'new-task') audit.metadata.newAgentTaskId = 'new-task';
      if (change === 'old-task') audit.metadata.oldAgentTaskId = 'refresh-task';
      if (change === 'old-actor') f.db.agentSessions[1].userId = 'other';
      if (change === 'old-ro') f.db.agentSessions[1].researchObjectId = 'other';
      if (change === 'old-payload') f.db.agentTasks[1].payload = { researchObjectId: 'ro', artifactId: 'other' };
      if (change === 'artifact') audit.metadata.artifactId = 'other';
      if (change === 'source-actor') f.db.ingestionBatches[1].userId = 'other';
      if (change === 'source-ro') f.db.ingestionBatches[1].researchObjectId = 'other';
      expect(await isHermesVideoTask(f.prisma, 'refresh-task')).toBe(false);
    });

  it.each(['executor', 'authorized-actor'])('requires the internal refresh %s binding', async change => {
    const f = refreshMarkerFixture(true);
    if (change === 'executor') delete f.db.auditLogs[1].metadata.executor;
    if (change === 'authorized-actor') f.db.auditLogs[1].metadata.authorizedByUserId = 'other';
    expect(await isHermesVideoTask(f.prisma, 'refresh-task')).toBe(false);
  });

  it('recognizes the exact audited new analysis, not its shared uploaded source task', async () => {
    const f = sourceTaskFixture();
    expect(await isHermesVideoTask(f.prisma, 'new-task')).toBe(true);
    expect(await isHermesVideoTask(f.prisma, 'old-task')).toBe(false);
  });

  it.each(['audit-absent', 'action', 'actor', 'workspace', 'target-type', 'target', 'new-task', 'artifact', 'batch-session',
    'source-ingestion', 'source-agent', 'source-actor', 'source-ro', 'source-payload', 'task-ro', 'session-actor', 'hint-only'])(
    'does not trust an analysis with a broken %s binding', async change => {
      const f = sourceTaskFixture();
      const audit = f.db.auditLogs[0];
      if (change === 'audit-absent') f.db.auditLogs.length = 0;
      if (change === 'action') audit.action = 'other';
      if (change === 'actor') audit.actorId = 'other';
      if (change === 'workspace') audit.workspaceId = 'other';
      if (change === 'target-type') audit.targetType = 'agent_task';
      if (change === 'target') audit.targetId = 'old-ingestion';
      if (change === 'new-task') audit.metadata.newAgentTaskId = 'old-task';
      if (change === 'artifact') audit.metadata.artifactId = 'other';
      if (change === 'batch-session') f.db.ingestionBatches[1].agentSessionId = 'old-session';
      if (change === 'source-ingestion') audit.metadata.sourceIngestionTaskId = 'new-ingestion';
      if (change === 'source-agent') audit.metadata.sourceAgentTaskId = 'new-task';
      if (change === 'source-actor') f.db.agentSessions[0].userId = 'other';
      if (change === 'source-ro') f.db.ingestionBatches[0].researchObjectId = 'other';
      if (change === 'source-payload') f.db.agentTasks[0].payload = { researchObjectId: 'ro', artifactId: 'other' };
      if (change === 'task-ro') f.db.agentTasks[1].payload = { researchObjectId: 'other', artifactId: 'artifact' };
      if (change === 'session-actor') f.db.agentSessions[1].userId = 'other';
      if (change === 'hint-only') { delete audit.metadata.requestedOutput; f.db.agentTasks[1].payload = { ...f.db.agentTasks[1].payload, output: 'video' }; }
      // A newer wrong-owner audit cannot make another task into a video task.
      f.db.auditLogs.push({ ...audit, actorId: 'decoy', metadata: { ...audit.metadata, requestedOutput: 'video' } });
      expect(await isHermesVideoTask(f.prisma, 'new-task')).toBe(false);
    });

  it('derives the restriction from a bound video source run even when the client hint is absent', async () => {
    const f = sourceTaskFixture();
    const metadata = f.db.auditLogs[0].metadata;
    delete metadata.requestedOutput;
    metadata.sourceRunId = 'run';
    f.db.hermesResearchRuns.push({ id: 'run', actorId: 'actor', researchObjectId: 'ro', profile: 'visual-narrative-v1', generationSettings: { output: 'video' } });
    f.db.hermesResearchSteps.push({ runId: 'run', stage: 'source_ingestion', ingestionTaskId: 'old-ingestion', artifactId: 'artifact', agentTaskId: 'old-task' });
    expect(await isHermesVideoTask(f.prisma, 'new-task')).toBe(true);
    f.db.hermesResearchRuns[0].actorId = 'other';
    expect(await isHermesVideoTask(f.prisma, 'new-task')).toBe(false);
  });

  it('recognizes an owned video reviewer despite its distinct review session; the upload reference alone is insufficient', async () => {
    const f = sourceTaskFixture();
    f.db.auditLogs.length = 0;
    f.db.ingestionBatches[1].agentSessionId = 'old-session';
    f.db.hermesResearchRuns.push({ id: 'run', actorId: 'actor', researchObjectId: 'ro', profile: 'visual-narrative-v1', generationSettings: { output: 'video' } });
    f.db.hermesResearchSteps.push({ runId: 'run', stage: 'source_ingestion', ingestionTaskId: 'new-ingestion', artifactId: 'artifact', agentTaskId: 'new-task' });
    expect(await isHermesVideoTask(f.prisma, 'new-task')).toBe(false);
    f.db.hermesResearchSteps.push({ runId: 'run', stage: 'source_review', ingestionTaskId: 'new-ingestion', artifactId: 'artifact', agentTaskId: 'new-task' });
    expect(await isHermesVideoTask(f.prisma, 'new-task')).toBe(true);
    f.db.hermesResearchRuns[0].generationSettings = null;
    expect(await isHermesVideoTask(f.prisma, 'new-task')).toBe(false);
  });

  it.each(['source_review', 'source_composition'])('recognizes an owned technical %s task outside the current ingestion pointer', async stage => {
    const f = sourceTaskFixture();
    f.db.auditLogs.length = 0;
    f.db.agentTasks.push({ id: 'current-author', kind: 'sdf.extract', sessionId: 'new-session', payload: { artifactId: 'artifact', researchObjectId: 'ro' } });
    f.db.ingestionTasks[1].agentTaskId = 'current-author';
    f.db.hermesResearchRuns.push({ id: 'run', actorId: 'actor', researchObjectId: 'ro', profile: 'visual-narrative-v1', generationSettings: { output: 'video' } });
    f.db.hermesResearchSteps.push({ runId: 'run', stage: 'source_ingestion', ingestionTaskId: 'new-ingestion', artifactId: 'artifact', agentTaskId: 'current-author' },
      { runId: 'run', stage, ingestionTaskId: 'new-ingestion', artifactId: 'artifact', agentTaskId: 'new-task' });
    expect(await isHermesVideoTask(f.prisma, 'new-task')).toBe(true);
    expect(await isHermesVideoTask(f.prisma, 'current-author')).toBe(false);
    f.db.hermesResearchSteps[1].artifactId = 'other';
    expect(await isHermesVideoTask(f.prisma, 'new-task')).toBe(false);
  });
});

function capabilityFixture() {
  const { prisma, db } = createFakePrisma();
  db.workspaces.push({ id: 'workspace', status: 'active' });
  db.researchObjects.push({ id: 'ro', workspaceId: 'workspace', status: 'draft', deletedAt: null });
  db.memberships.push({ workspaceId: 'workspace', userId: 'actor', role: 'author' });
  const readVideoReadiness = vi.fn(async () => true);
  const deps = { prisma, videoEnabled: true, readVideoReadiness } as HermesResearchRunDeps;
  return { db, deps, readVideoReadiness };
}

describe('Hermes video capability', () => {
  const input = { actorId: 'actor', researchObjectId: 'ro' };
  it('returns only the scoped dynamic capability and does not mutate any row', async () => {
    const f = capabilityFixture();
    const before = structuredClone(f.db);
    expect(await getHermesVideoCapability(f.deps, input)).toEqual({ canGenerateVideo: true });
    f.readVideoReadiness.mockResolvedValue(false);
    expect(await getHermesVideoCapability(f.deps, input)).toEqual({ canGenerateVideo: false });
    expect(f.db).toEqual(before);
  });

  it.each(['viewer', 'reviewer'])('returns false for the read-only %s role', async role => {
    const f = capabilityFixture();
    f.db.memberships[0].role = role;
    expect(await getHermesVideoCapability(f.deps, input)).toEqual({ canGenerateVideo: false });
    expect(f.readVideoReadiness).not.toHaveBeenCalled();
  });

  it('returns false for an immutable research object', async () => {
    const f = capabilityFixture();
    f.db.researchObjects[0].status = 'published';
    expect(await getHermesVideoCapability(f.deps, input)).toEqual({ canGenerateVideo: false });
    expect(f.readVideoReadiness).not.toHaveBeenCalled();
  });

  it.each(['missing', 'deleted', 'nonmember', 'archived'])('masks an inaccessible %s research object', async reason => {
    const f = capabilityFixture();
    if (reason === 'missing') f.db.researchObjects.length = 0;
    if (reason === 'deleted') f.db.researchObjects[0].deletedAt = new Date();
    if (reason === 'nonmember') f.db.memberships.length = 0;
    if (reason === 'archived') f.db.workspaces[0].status = 'archived';
    await expect(getHermesVideoCapability(f.deps, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(f.readVideoReadiness).not.toHaveBeenCalled();
  });
});
