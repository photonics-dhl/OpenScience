import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import type { HermesResearchRunDeps } from '../../src/agent/research-run';
import { createHermesFirstImageContinuation } from '../../src/agent/first-image-continuation';
import { reconcileHermesResearchRuns } from '../../src/agent/research-run';
import { describeIllustrationBrief, type IllustrationBrief } from '../../src/assets/illustration-brief';
import { parseStoryboardDocument } from '../../src/assets/storyboard';
import { presentationClaimContent, presentationEvidenceIdentity, readVisualNarrativeSource } from '../../src/assets/illustration-source';
import { requireSceneImageParent } from '../../src/assets/scene-image';

export const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const hash = 'a'.repeat(64);
export function fixture() {
  const { prisma, db } = createFakePrisma();
  seedUser(db, { id: id(1) });
  db.usageLedger.push({ id: 'available-credit', userId: id(1), resource: 'ai_credit', kind: 'grant', delta: 100 });
  db.workspaces.push({ id: id(2), status: 'active' });
  db.memberships.push({ workspaceId: id(2), userId: id(1), role: 'author' });
  db.researchObjects.push({ id: id(3), workspaceId: id(2), status: 'draft', version: 1, deletedAt: null });
  db.commits.push({ id: id(40), branchId: id(41) });
  db.versions.push({ id: id(4), researchObjectId: id(3), status: 'draft', versionNo: 1, commitId: id(40), publicVersionId: null, createdAt: new Date('2026-09-01') });
  db.versionManifests.push({ id: id(42), versionId: id(4), coreJson: { title: 'Paper' } });
  db.manifestEntries.push({ id: id(43), manifestId: id(42), artifactId: id(8), blobSha256: hash });
  db.artifacts.push({ id: id(8), workspaceId: id(2), blobSha256: hash });
  db.ingestionBatches.push({ id: id(9), researchObjectId: id(3), userId: id(1) });
  db.agentSessions.push({ id: id(10), userId: id(1), researchObjectId: id(3), status: 'active', kind: 'workspace.guide' });
  db.agentTasks.push({ id: id(11), sessionId: id(10), kind: 'sdf.extract', status: 'succeeded', updatedAt: new Date('2026-09-01'),
    result: { sourceMapRef: { schemaVersion: 1, parserStatus: 'succeeded', artifactId: id(8), contentHash: hash,
      objectKey: `derived/source-maps/${hash}.json`, serializedSha256: hash, size: 10 },
    core: { problem: 'Problem', insight: 'Insight', method: 'Method', results: 'Results', limitations: 'Limits', reproducibility: 'Methods' },
    scientificReview: { responseHash: hash, status: 'review_received', contractVersion: '5' } } });
  db.ingestionTasks.push({ id: id(12), batchId: id(9), artifactId: id(8), agentTaskId: id(11), state: 'confirmed' });
  db.claimNodes.push({ id: id(6), researchObjectId: id(3), versionId: id(4), statement: 'Two regions share a relation.',
    kind: 'finding', assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded',
    provenance: { source: 'reviewed_ingestion', sourceTaskId: id(12) } });
  db.evidenceRecords.push({ id: id(7), claimId: id(6), researchObjectId: id(3), versionId: id(4), artifactId: id(8), contentHash: hash,
    relation: 'supports', exactQuote: 'Two regions share a relation.', locator: {}, extractionStatus: 'succeeded',
    provenance: { source: 'reviewed_ingestion', sourceTaskId: id(12) } });
  const goal = 'Generate one image explaining this paper.';
  db.agentTasks.push({ id: id(15), sessionId: id(10), kind: 'workspace.guide', status: 'running', executionAttempt: 1,
    payload: { goal, locale: 'en', route: 'research-object-edit', target: null, executionIntent: 'first-image',
      context: { tasks: [], researchObjects: [], presentation: { researchObjectId: id(3), versionId: id(4) } } } });
  Object.assign(prisma.hermesResearchRun, { findFirst: async ({ where }: { where: Record<string, unknown> }) => db.hermesResearchRuns.find(r =>
    r.actorId === where.actorId && r.researchObjectId === where.researchObjectId && r.versionId === where.versionId
    && !['succeeded', 'failed', 'stopped'].includes(r.status)) ?? null });
  Object.assign(prisma.agentTask, { findMany: async ({ where }: { where: { kind: string; payload: { equals: string } } }) => db.agentTasks.filter(t =>
    t.kind === where.kind && t.payload?.hermesRunAuthority?.runId === where.payload.equals) });
  Object.assign(prisma.auditLog, {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => db.auditLogs.find(row => matches(row, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) => db.auditLogs.filter(row => matches(row, where)),
  });
  Object.assign(prisma.usageLedger, { findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
    db.usageLedger.find(row => row.idempotencyKey === where.idempotencyKey) ?? null });
  const updateTask = prisma.agentTask.updateMany.bind(prisma.agentTask);
  vi.spyOn(prisma.agentTask, 'updateMany').mockImplementation(async args => {
    const row = db.agentTasks.find(task => task.id === args.where?.id);
    const result = args.where?.result as { equals?: unknown } | undefined;
    const payload = args.where?.payload as { equals?: unknown } | undefined;
    if (payload && !isDeepStrictEqual(row?.payload, payload.equals)
      || result && !isDeepStrictEqual(row?.result ?? Prisma.DbNull, result.equals)) return { count: 0 };
    return updateTask(args);
  });
  const deps = { prisma, nativeAgentRuntime: { runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills', model: 'MiniMax-M3' }, nativeSceneImageEnabled: true, sceneImageEnabled: true, redis: { lpush: vi.fn(async () => 1) },
    audit: { record: async (event: Record<string, unknown>, tx: { auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } }) =>
      tx.auditLog.create({ data: event }) } };
  return { db, prisma, deps: deps as unknown as HermesResearchRunDeps, input: { guideTaskId: id(15), executionAttempt: 1,
    payload: structuredClone(db.agentTasks.find(t => t.id === id(15))!.payload) }, goal };
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'path' in value) {
      const query = value as { path: string[]; equals: unknown };
      let current: unknown = row[key];
      for (const field of query.path) current = current && typeof current === 'object' ? (current as Record<string, unknown>)[field] : undefined;
      return isDeepStrictEqual(current, query.equals);
    }
    return isDeepStrictEqual(row[key], value);
  });
}

/** Persist the same private Native terminal envelope consumed by the actual reconciler. No provider is called. */
export async function plannedFixture() {
  const f = fixture();
  const started = await createHermesFirstImageContinuation(f.deps, f.input);
  const parent = f.db.agentTasks.find(task => task.kind === 'presentation.generate')!;
  const brief: IllustrationBrief = { schemaVersion: 2, message: 'Two regions share a relation.', domain: 'conceptual',
    encoding: 'Two linked regions.', subjects: [{ description: 'Two regions',
      basis: { claimId: id(6), evidenceId: id(7), quote: 'Two regions share a relation.' } }],
    composition: 'One relationship at the center.', treatment: 'Editorial linework.', labels: ['Regions'], constraints: [] };
  const document = parseStoryboardDocument({ schemaVersion: 1, title: 'Shared relation', narrative: { mainMessage: brief.message, audience: 'Researchers' },
    scenes: [{ title: 'Relation', narration: brief.message, visualAction: describeIllustrationBrief(brief), illustration: brief,
      durationSeconds: 10, sourceClaimIds: [id(6)] }] }, [id(6)], 'image');
  const source = await readVisualNarrativeSource(f.prisma, { userId: id(1), workspaceId: id(2), researchObjectId: id(3),
    versionId: id(4), sourceClaimIds: [id(6)] }, { runId: started.runId, taskId: parent.id });
  const sourceEvidenceIdentity = presentationEvidenceIdentity(f.db.evidenceRecords);
  const context = { payload: structuredClone(parent.payload), sourceEvidenceIdentity, claimContent: presentationClaimContent(f.db.claimNodes),
    baseIdentity: null, narrativeSourceIdentity: source.identity };
  const contentHash = createHash('sha256').update(JSON.stringify(document)).digest('hex');
  const checkpoint = { taskId: parent.id, objectKey: `derived/native-agent/${hash}.json`, serializedSha256: hash,
    size: 100, artifactId: id(8), documentSha256: hash, sourceMapHash: hash, executionAttempt: 1,
    turnCount: 2, state: 'completed', target: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: hash },
    responseHash: hash, finishReason: 'stop', hasToolCalls: false };
  const review = { stage: 'final-brief', decision: 'accepted', requestId: parent.id, candidateHash: contentHash, sourceEvidenceIdentity,
    summary: 'Matches the paper.', ...checkpoint.target, responseHash: hash };
  Object.assign(parent, { status: 'succeeded', executionAttempt: 1, result: { ...parent.result,
    nativeAgentExecution: { ...parent.result.nativeAgentExecution, checkpoint }, sourceMapRef: source.reference,
    assetId: parent.id, contentHash, nativeIllustrationContext: context,
    storyboardCheckpoint: { ...context, executionAttempt: 1, planned: { document, promptHash: hash, reviewFormat: 2 } },
    storyboardReview: review, illustrationPrompts: [{ sceneIndex: 0, prompt: 'Draw the supported relation.' }] } });
  f.db.presentationAssets.push({ id: parent.id, researchObjectId: id(3), versionId: id(4), kind: 'interactive_html', status: 'draft',
    deletedAt: null, contentHash, createdAt: new Date(), updatedAt: new Date(), provenance: {
      source: 'verified_claims', subtype: 'sourced_storyboard', taskId: parent.id, sourceEvidenceIdentity,
      storyboardSettings: structuredClone(parent.payload.storyboard), storyboardDocument: document, illustrationReview: review } });
  f.db.presentationAssetClaims.push({ presentationAssetId: parent.id, claimId: id(6) });
  return { ...f, started, parent, document, review, sourceEvidenceIdentity };
}

export async function renderingFixture() {
  const f = await plannedFixture();
  await reconcileHermesResearchRuns(f.deps);
  await reconcileHermesResearchRuns(f.deps);
  const image = f.db.agentTasks.find(task => task.payload?.kind === 'image');
  if (!image) throw new Error(`Image task not created: ${JSON.stringify(f.db.hermesResearchRuns)}`);
  return { ...f, image };
}

export async function completeImage(f: Awaited<ReturnType<typeof renderingFixture>>) {
  const parent = await requireSceneImageParent(f.prisma, f.image.payload);
  if (!parent) throw new Error('Image parent missing');
  const identity = { requestId: f.image.id, contentHash: hash, sourceEvidenceIdentity: f.sourceEvidenceIdentity, parentIdentity: parent.identity };
  const target = { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: hash };
  const review = { stage: 'generated-image', decision: 'accepted', summary: 'Matches the reviewed relation.', repairInstruction: null,
    ...identity, ...target, responseHash: hash };
  Object.assign(f.image, { status: 'succeeded', result: { assetId: f.image.id, contentHash: hash,
    nativeImageReview: { ...identity, provider: target.provider, model: target.model, mode: 'agent-native', state: 'completed',
      preparedAt: 1, deadlineAt: 300001, executionAttempt: 1, runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills',
      reservationLedgerId: 'existing-reservation', maxTurns: 4, maxOutputTokens: 32768, maxTotalOutputTokens: 32768, maxInputBytes: 100, review },
    nativeAgentExecution: { kind: 'hermes-agent', profile: 'image-review', runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills',
      model: target.model, checkpoint: { taskId: f.image.id, objectKey: `derived/native-agent/${hash}.json`, serializedSha256: hash, size: 100,
        sourceKind: 'illustration-image', imageIdentity: identity, executionAttempt: 1, turnCount: 2, state: 'completed', target,
        responseHash: hash, finishReason: 'stop', hasToolCalls: false } } } });
  f.db.presentationAssets.push({ id: f.image.id, researchObjectId: id(3), versionId: id(4), kind: 'image', status: 'draft', deletedAt: null,
    contentHash: hash, objectKey: `derived/images/${hash}.png`, provenance: { source: 'approved_storyboard_scene', taskId: f.image.id,
      contentType: 'image/png', parentIdentity: parent.identity, sourceEvidenceIdentity: f.sourceEvidenceIdentity,
      storyboardAssetId: f.parent.id, storyboardContentHash: f.parent.result.contentHash, sceneIndex: 0, imageReview: review } });
  f.db.presentationAssetClaims.push({ presentationAssetId: f.image.id, claimId: id(6) });
}
