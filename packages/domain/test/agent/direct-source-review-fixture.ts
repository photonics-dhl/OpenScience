import { vi } from 'vitest';
import type { AuditSink } from '@openscience/observability';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import type { retryHermesGeneration } from '../../src/agent/research-run';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const fields = <T>(value: (field: string) => T) => Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, value(field)]));

export function fixture(legacy = false) {
  const { prisma, db } = createFakePrisma(); const user = seedUser(db);
  const ids = { ro: uuid(100), run: uuid(101), source: uuid(102), artifact: uuid(103), anchor: uuid(104), failed: uuid(105) };
  db.workspaces.push({ id: 'workspace', status: 'active' });
  db.memberships.push({ workspaceId: 'workspace', userId: user.id, role: 'author' });
  db.researchObjects.push({ id: ids.ro, workspaceId: 'workspace', status: 'draft', deletedAt: null });
  db.usageLedger.push({ id: 'credit', userId: user.id, resource: 'ai_credit', delta: 100, createdAt: new Date() });
  db.artifacts.push({ id: ids.artifact, workspaceId: 'workspace', blobSha256: 'a'.repeat(64), logicalPath: 'source.pdf', mimeType: 'application/pdf', deletedAt: null, bytesPurgedAt: null });
  db.ingestionBatches.push({ id: 'batch', userId: user.id, researchObjectId: ids.ro });
  const sourceMapRef = { schemaVersion: 1, parserStatus: 'succeeded', artifactId: ids.artifact, contentHash: 'a'.repeat(64),
    objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100 };
  const semanticStage = { kind: 'semantic_reduce', source: { artifactId: ids.artifact, contentHash: 'a'.repeat(64),
    sourceMapHash: 'b'.repeat(64) }, reduction: { fields: {} }, passageBindings: [],
    provider: 'primary', model: 'MiniMax-M3', promptHash: 'c'.repeat(64), responseHash: 'd'.repeat(64), finishReason: 'stop' };
  const anchorResult = { canonicalExtractionContract: 'grounded-passages-v2', sourceMapRef,
    core: { schemaVersion: '0.1.0', ...fields(field => `Original ${field}`) },
    evidence: fields(field => ({ quote: `Source ${field}`, locator: 'passages:P00001' })),
    evidenceSegments: fields(field => [{ quote: `Source ${field}`, locator: { kind: 'document_source_map' } }]),
    needsMoreInformation: [], scientificReview: { kind: 'model_self_check', contractVersion: '4', status: 'review_received',
      compositionSkill: { id: 'scientific-summary', version: '6' }, semanticStage, provider: 'primary', model: 'MiniMax-M3',
      promptHash: 'c'.repeat(64), responseHash: 'd'.repeat(64), finishReason: 'stop', reviewedCandidateHash: 'e'.repeat(64) } };
  const failedResult = { canonicalExtractionContract: 'grounded-passages-v2', sourceMapRef, sourceMapReused: true,
    reason: 'canonical_partial_validation_exhausted', core: { schemaVersion: '0.1.0', ...fields(() => '') },
    evidence: fields(() => ({ quote: '', locator: '' })), evidenceSegments: fields(() => []),
    fieldDiagnostics: fields(() => 'malformed_item'),
    fieldDiagnosticsDetails: fields(() => 'scientificReview=STRUCTURED_JSON_INVALID'),
    unverifiedSummaries: fields(field => `Original ${field}`), unverifiedSourcePassageIds: fields(() => ['P00001']),
    needsMoreInformation: [...SDF_CORE_FIELDS], scientificReview: { kind: 'model_self_check', contractVersion: '5',
      status: 'blocked_scientific_review', sourceAgentTaskId: ids.anchor, semanticStage,
      reviewSkill: { id: 'scientific-critical-thinking', version: '5' }, compositionSkill: { id: 'scientific-summary', version: '6' },
      provider: null, model: null, reviewedCandidateHash: 'f'.repeat(64), attemptId: uuid(106) } };
  const initialKey = `ingestion-analysis-compose:${ids.source}:${ids.anchor}:${ids.anchor}:scientific-review-v4`;
  const now = new Date('2026-09-29T05:00:00Z');
  for (const [id, key, result, attempt, retries] of [
    [ids.anchor, 'original-upload', anchorResult, 3, 2], [ids.failed, initialKey, failedResult, 1, 0],
  ] as const) {
    const sessionId = `${id}-session`;
    db.agentSessions.push({ id: sessionId, userId: user.id, researchObjectId: ids.ro, kind: 'ingestion', status: 'active',
      deletedAt: null, idempotencyKey: `${key}:session` });
    db.agentTasks.push({ id, sessionId, kind: 'sdf.extract', status: 'succeeded', executionAttempt: attempt, retryCount: retries,
      payload: { artifactId: ids.artifact, researchObjectId: ids.ro }, result, deletedAt: null, error: null,
      createdAt: new Date(now.getTime() - 600_000), updatedAt: now, dispatchedAt: now, idempotencyKey: key });
  }
  db.ingestionTasks.push({ id: ids.source, batchId: 'batch', artifactId: ids.artifact, agentTaskId: ids.failed,
    state: 'needs_review', retryCount: 0, error: null });
  db.hermesResearchRuns.push({ id: ids.run, actorId: user.id, researchObjectId: ids.ro, status: 'failed', version: 7,
    versionId: null, sourceClaimIds: [], sourceReviewDigest: null, maxAgentTasks: 9, profile: 'visual-narrative-v1',
    generationSettings: { locale: 'en', style: 'auto', instruction: 'Explain the paper' }, error: 'Scientific review incomplete' });
  const addStep = (stage: string, agentTaskId: string, status: string) => db.hermesResearchSteps.push({ id: `${stage}-step`,
    runId: ids.run, stage, agentTaskId, status, ordinal: 0, ingestionTaskId: ids.source, artifactId: ids.artifact,
    presentationAssetId: null, error: null });
  addStep('source_ingestion', ids.failed, 'succeeded'); addStep('source_review', ids.failed, 'failed');
  if (legacy) addStep('source_composition', ids.anchor, 'succeeded');
  for (let i = 0; i < 2; i++) db.auditLogs.push({ id: `call-${i}`, action: 'ai.gateway.call', actorId: null,
    targetType: 'ai_gateway', requestId: ids.failed, createdAt: new Date(now.getTime() - 1000 + i),
    metadata: { operation: 'text', outcome: 'succeeded', provider: 'primary', model: 'MiniMax-M3',
      promptHash: String(i + 1).repeat(64), inputTokens: 100, outputTokens: 100, retryCount: 0,
      fallbackReason: null, error: null, finishReason: 'stop' } });
  type AuditWhere = { action?: string | { in: string[] }; actorId?: string; targetId?: string; targetType?: string; requestId?: string; workspaceId?: string;
    metadata?: { path: string[]; equals: unknown }; AND?: Array<{ metadata: { path: string[]; equals: unknown } }> };
  const audits = (where: AuditWhere) => db.auditLogs.filter(row =>
    (typeof where.action === 'object' ? where.action.in.includes(row.action) : where.action === undefined || row.action === where.action)
    && ['actorId', 'targetId', 'targetType', 'requestId', 'workspaceId'].every(key => where[key as keyof AuditWhere] === undefined
      || row[key] === where[key as keyof AuditWhere])
    && (!where.metadata || row.metadata[where.metadata.path[0]!] === where.metadata.equals)
    && (!where.AND || where.AND.every(clause => row.metadata[clause.metadata.path[0]!] === clause.metadata.equals)));
  Object.assign(prisma.auditLog, { findMany: vi.fn(async ({ where }: { where: AuditWhere }) => audits(where)),
    findFirst: vi.fn(async ({ where }: { where: AuditWhere }) => audits(where)[0] ?? null) });
  Object.assign(prisma.usageLedger, { findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
    db.usageLedger.find(row => row.idempotencyKey === where.idempotencyKey) ?? null });
  Object.assign(prisma.agentTask, { findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] };
    session?: { idempotencyKey?: { endsWith: string } } } }) => db.agentTasks.filter(task =>
      (!where.id || where.id.in.includes(task.id)) && (!where.session?.idempotencyKey ||
        db.agentSessions.find(session => session.id === task.sessionId)?.idempotencyKey.endsWith(where.session.idempotencyKey.endsWith)))
      .map(task => ({ ...task, session: db.agentSessions.find(session => session.id === task.sessionId) }))),
    count: vi.fn(async () => db.agentTasks.filter(task => task.kind === 'presentation.generate').length) });
  Object.assign(prisma.hermesResearchRun, { findUniqueOrThrow: async (args: Parameters<typeof prisma.hermesResearchRun.findUnique>[0]) =>
    prisma.hermesResearchRun.findUnique(args) });
  Object.assign(prisma.ingestionTask, { findUniqueOrThrow: async (args: Parameters<typeof prisma.ingestionTask.findUnique>[0]) =>
    prisma.ingestionTask.findUnique(args) });
  Object.assign(prisma.hermesResearchStep, {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const step = { id: `step-${db.hermesResearchSteps.length}`, presentationAssetId: null, error: null, ...data };
      db.hermesResearchSteps.push(step); return step;
    },
    findMany: async ({ where }: { where: { agentTaskId?: string; ordinal?: number | { gt: number };
      OR?: Array<{ agentTaskId?: string; ingestionTaskId?: string }> } }) => db.hermesResearchSteps.filter(step =>
      where.OR ? where.OR.some(part => (part.agentTaskId !== undefined && step.agentTaskId === part.agentTaskId)
        || (part.ingestionTaskId !== undefined && step.ingestionTaskId === part.ingestionTaskId))
      : step.stage === 'source_review' && step.agentTaskId === where.agentTaskId
      && (typeof where.ordinal === 'number' ? step.ordinal === where.ordinal
        : where.ordinal ? step.ordinal > where.ordinal.gt : true)),
    findFirst: async () => null,
  });
  const audit: AuditSink = { record: async (event, tx) => { await (tx as typeof prisma).auditLog.create({ data: event as never }); } };
  const redis = { lpush: vi.fn(async () => 1) };
  const deps = { prisma, audit, redis } as unknown as Parameters<typeof retryHermesGeneration>[0];
  const input = { actorId: user.id, researchObjectId: ids.ro, runId: ids.run, expectedVersion: 7, idempotencyKey: 'explicit-fresh-review' };
  return { db, prisma, deps, redis, ids, input, anchorResult, failedResult };
}
