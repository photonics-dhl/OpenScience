import { describe, expect, it, vi } from 'vitest';
import { requirePartialParserRecovery } from '../src/parsers/recovery-checkpoint';

function fixture() {
  const reference = { schemaVersion: 1, parserStatus: 'needs_review', artifactId: 'artifact',
    contentHash: 'a'.repeat(64), serializedSha256: 'b'.repeat(64), objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, size: 50 };
  const input = { taskId: 'task', actorId: 'actor', workspaceId: 'workspace', researchObjectId: 'ro',
    artifactId: 'artifact', retryCount: 1, executionAttempt: 2, reference };
  const ingestion = { id: 'ingestion', agentTaskId: 'task', artifactId: 'artifact', state: 'parsing', retryCount: 1,
    batch: { userId: 'actor', researchObjectId: 'ro' } };
  const metadata = { recovery: 'unresolved_parser_pages', agentTaskId: 'task', retryAttempt: 1,
    previousExecutionAttempt: 1, previousRetryCount: 0, previousAgentRetryCount: 0,
    previousParserResult: { status: 'needs_review', reason: 'unresolved pages remain', sourceMapRef: reference } };
  const prisma = { ingestionTask: { findFirst: vi.fn().mockResolvedValue(ingestion) },
    hermesResearchStep: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { findMany: vi.fn().mockResolvedValue([{ metadata }]) } };
  return { input, ingestion, metadata, prisma };
}

describe('partial parser checkpoint authorization', () => {
  it('accepts only the existing exact retry receipt and current source scope', async () => {
    const { prisma, input } = fixture();
    await expect(requirePartialParserRecovery(prisma as never, input as never)).resolves.toBeUndefined();
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      action: 'ingestion.task.retry', actorId: 'actor', workspaceId: 'workspace', targetId: 'ingestion',
    }) }));
  });
  it.each(['missing-receipt', 'duplicate-receipt', 'different-map', 'different-attempt', 'different-actor', 'different-source', 'no-longer-running', 'extra-core'])('rejects %s', async mode => {
    const { prisma, input, ingestion, metadata } = fixture();
    if (mode === 'missing-receipt') prisma.auditLog.findMany.mockResolvedValue([]);
    if (mode === 'duplicate-receipt') prisma.auditLog.findMany.mockResolvedValue([{ metadata }, { metadata }]);
    if (mode === 'different-map') metadata.previousParserResult.sourceMapRef = { ...input.reference, size: 99 };
    if (mode === 'different-attempt') metadata.previousExecutionAttempt = 0;
    if (mode === 'different-actor') ingestion.batch.userId = 'other';
    if (mode === 'different-source') ingestion.artifactId = 'other';
    if (mode === 'no-longer-running') ingestion.state = 'confirmed';
    if (mode === 'extra-core') Object.assign(metadata.previousParserResult, { core: {} });
    await expect(requirePartialParserRecovery(prisma as never, input as never)).rejects.toThrow(/Parser recovery/);
  });
  it.each(['exact', 'missing-binding', 'duplicate-binding', 'other-run', 'stopped', 'changed-version', 'different-step'])('checks %s Hermes continuation binding', async mode => {
    const { prisma, input, metadata } = fixture();
    Object.assign(metadata, { runId: 'run', sourceStepId: 'step', previousVersion: 2,
      explicitUserAction: true, possibleDuplicateProviderCharge: true, clientIdempotencyKey: 'key', requestDigest: 'c'.repeat(64) });
    const binding = { id: 'step', agentTaskId: 'task', artifactId: 'artifact', status: 'waiting', run: {
      id: 'run', actorId: 'actor', researchObjectId: 'ro', status: 'running', version: 3, maxAgentTasks: 9,
      versionId: null, sourceClaimIds: [], steps: [{ id: 'step' }], researchObject: { status: 'draft', workspaceId: 'workspace' },
    } };
    if (mode === 'other-run') binding.run.id = 'other';
    if (mode === 'stopped') binding.run.status = 'stopped';
    if (mode === 'changed-version') binding.run.version = 4;
    if (mode === 'different-step') binding.id = 'other';
    prisma.hermesResearchStep.findMany.mockResolvedValue(mode === 'missing-binding' ? [] : mode === 'duplicate-binding' ? [binding, binding] : [binding]);
    const result = requirePartialParserRecovery(prisma as never, input as never);
    if (mode === 'exact') await expect(result).resolves.toBeUndefined();
    else await expect(result).rejects.toThrow(/Parser recovery/);
  });
});
