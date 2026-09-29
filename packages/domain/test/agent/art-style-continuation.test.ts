import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createHermesArtStyleContinuation, readNarrativeCheckpointEvidence, reconcileHermesResearchRuns, requireHermesPresentationTaskAuthority } from '../../src/agent/research-run';
import { ART_STYLE_CONTINUATION, advanceArtStyleContinuation, getHermesImageArtStyleCapability, requireArtStyleContinuationDocument, requireArtStyleContinuationTaskAuthority } from '../../src/agent/art-style-continuation';
import { parseStoryboardDocument } from '../../src/assets/storyboard';
import { requireSceneImageParent } from '../../src/assets/scene-image';
import { describeIllustrationBrief } from '../../src/assets/illustration-brief';
import { transitionPresentationAsset } from '../../src/assets/presentation-asset';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const h = 'a'.repeat(64);
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Record<string, unknown>[]).some(part => matches(row, part));
    if (value && typeof value === 'object') {
      const predicate = value as { in?: unknown[]; notIn?: unknown[]; gte?: number };
      if (predicate.in) return predicate.in.includes(row[key]);
      if (predicate.notIn) return !predicate.notIn.includes(row[key]);
      if (predicate.gte !== undefined) return Number(row[key]) >= predicate.gte;
    }
    return row[key] === value;
  });
}
const recommendations = { selectedStyleId: 'article:watercolor', choices: [
  { styleId: 'article:watercolor', name: 'Watercolor', reason: 'Soft pigment' },
  { styleId: 'infographic:technical-schematic', name: 'Technical', reason: 'Clear lines' },
] };
function document() {
  const scene = { title: 'Relation', narration: 'A sourced relation.', visualAction: 'Show the relation.', sourceClaimIds: [id(6)],
    styleRecommendations: recommendations, illustration: { schemaVersion: 2, message: 'A sourced relation.', domain: 'conceptual',
      subjects: [{ description: 'Two regions', basis: { claimId: id(6), evidenceId: id(7), quote: 'Two regions share a relation.' } }],
      encoding: 'The line depicts the relation.', labels: ['Relation'], constraints: ['Not to scale'], composition: 'Centered', treatment: 'Ink' } };
  scene.visualAction = describeIllustrationBrief(scene.illustration as never);
  return parseStoryboardDocument({ schemaVersion: 1, title: 'Paper', narrative: { mainMessage: 'A sourced relation.', audience: 'Readers' },
    scenes: [scene, { ...structuredClone(scene), title: 'Unchanged second scene' }] }, [id(6)], 'image');
}

async function fixture() {
  const { prisma, db } = createFakePrisma();
  seedUser(db, { id: id(1) });
  db.workspaces.push({ id: id(2), status: 'active' });
  db.memberships.push({ workspaceId: id(2), userId: id(1), role: 'author' });
  db.researchObjects.push({ id: id(3), workspaceId: id(2), status: 'draft' });
  db.commits.push({ id: id(40), branchId: id(41) });
  db.versions.push({ id: id(4), researchObjectId: id(3), status: 'draft', versionNo: 1, commitId: id(40), publicVersionId: null, createdAt: new Date('2026-09-01') });
  db.versionManifests.push({ id: id(42), versionId: id(4), coreJson: { title: 'Paper' } });
  db.artifacts.push({ id: id(8), workspaceId: id(2), blobSha256: h });
  db.ingestionBatches.push({ id: id(9), researchObjectId: id(3), userId: id(1) });
  db.agentSessions.push({ id: id(10), userId: id(1), researchObjectId: id(3), status: 'active', kind: 'visualization' });
  db.agentTasks.push({ id: id(11), sessionId: id(10), kind: 'sdf.extract', status: 'succeeded', updatedAt: new Date('2026-09-01'),
    result: { sourceMapRef: { schemaVersion: 1, parserStatus: 'succeeded', artifactId: id(8), contentHash: h,
      objectKey: `derived/source-maps/${h}.json`, serializedSha256: h, size: 10 }, scientificReview: { responseHash: h } } });
  db.ingestionTasks.push({ id: id(12), batchId: id(9), artifactId: id(8), agentTaskId: id(11), state: 'confirmed' });
  db.claimNodes.push({ id: id(6), researchObjectId: id(3), versionId: id(4), statement: 'Two regions share a relation.',
    kind: 'finding', assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded',
    provenance: { source: 'reviewed_ingestion', sourceTaskId: id(12) } });
  db.evidenceRecords.push({ id: id(7), claimId: id(6), researchObjectId: id(3), versionId: id(4), artifactId: id(8), contentHash: h,
    relation: 'supports', exactQuote: 'Two regions share a relation.', locator: {}, extractionStatus: 'succeeded',
    provenance: { source: 'reviewed_ingestion', sourceTaskId: id(12) } });
  const run = { id: id(5), actorId: id(1), researchObjectId: id(3), versionId: id(4), profile: 'visual-narrative-v1', maxAgentTasks: 9,
    generationSettings: { locale: 'en', style: 'auto', instruction: 'Explain the paper' }, sourceClaimIds: [id(6)], status: 'succeeded', version: 1 };
  db.hermesResearchRuns.push(run);
  db.hermesResearchSteps.push({ id: id(20), runId: run.id, stage: 'source_ingestion', ordinal: 0, status: 'succeeded', ingestionTaskId: id(12), artifactId: id(8), agentTaskId: id(11) },
    { id: id(21), runId: run.id, stage: 'storyboard', ordinal: 0, status: 'succeeded', agentTaskId: id(13), presentationAssetId: id(13) },
    { id: id(22), runId: run.id, stage: 'scene_image', ordinal: 1, status: 'succeeded', agentTaskId: id(14), presentationAssetId: id(14) });
  const withSteps = () => ({ ...db.hermesResearchRuns[0], steps: db.hermesResearchSteps.filter(s => s.runId === run.id) });
  const source = (await readNarrativeCheckpointEvidence(prisma as never, withSteps()))!;
  const doc = document();
  const parent = { id: id(13), researchObjectId: id(3), versionId: id(4), kind: 'interactive_html', status: 'approved', contentHash: h,
    provenance: { source: 'verified_claims', subtype: 'sourced_storyboard', taskId: id(13), sourceEvidenceIdentity: source.sourceEvidenceIdentity,
      storyboardSettings: { locale: 'en', style: 'auto', instruction: 'Explain the paper', output: 'image', narrative: true }, storyboardDocument: doc,
      illustrationReview: { stage: 'final-brief', requestId: id(13), decision: 'accepted', candidateHash: hash(doc), sourceEvidenceIdentity: source.sourceEvidenceIdentity,
        promptHash: h, responseHash: h, provider: 'chatgpt-web-science-review', summary: 'Accepted' } } };
  db.presentationAssets.push(parent);
  db.presentationAssetClaims.push({ presentationAssetId: parent.id, claimId: id(6) });
  db.agentTasks.push({ id: parent.id, sessionId: id(10), kind: 'presentation.generate', status: 'succeeded',
    result: { storyboardCheckpoint: { claimContent: source.claimContent, sourceEvidenceIdentity: source.sourceEvidenceIdentity, narrativeSourceIdentity: source.narrativeSourceIdentity } } });
  const payload = { schemaVersion: 1, researchObjectId: id(3), versionId: id(4), kind: 'image', sourceClaimIds: [id(6)],
    sceneImage: { storyboardAssetId: parent.id, sceneIndex: 1 }, hermesRunAuthority: { runId: run.id, stage: 'scene_image', ordinal: 1, profile: run.profile } };
  const sceneParent = (await requireSceneImageParent(prisma as never, payload))!;
  db.presentationAssets.push({ id: id(14), researchObjectId: id(3), versionId: id(4), kind: 'image', status: 'approved', contentHash: h, objectKey: 'old.png',
    provenance: { source: 'approved_storyboard_scene', subtype: 'storyboard_scene_image', taskId: id(14), sceneImage: payload.sceneImage,
      sourceEvidenceIdentity: source.sourceEvidenceIdentity, parentIdentity: sceneParent.identity,
      imageReview: { stage: 'generated-image', requestId: id(14), decision: 'accepted', summary: 'Accepted', repairInstruction: null,
        contentHash: h, sourceEvidenceIdentity: source.sourceEvidenceIdentity, parentIdentity: sceneParent.identity,
        promptHash: h, responseHash: h, provider: 'chatgpt-web-science-review', model: 'review-model' } } });
  db.presentationAssetClaims.push({ presentationAssetId: id(14), claimId: id(6) });
  db.agentTasks.push({ id: id(14), sessionId: id(10), kind: 'presentation.generate', status: 'succeeded', payload });
  db.usageLedger.push({ userId: id(1), resource: 'ai_credit', delta: 10, kind: 'grant' });
  // Add only missing query forms to the existing transactional fake; keep real task persistence/ledger.
  Object.assign(prisma.auditLog, {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => db.auditLogs.find(r => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
    findMany: async ({ where }: { where: { action: string; metadata: { equals: string } } }) => db.auditLogs.filter(r => r.action === where.action && r.metadata.imageAssetId === where.metadata.equals),
  });
  Object.assign(prisma.hermesResearchRun, { findFirst: async ({ where }: { where: Record<string, unknown> }) => db.hermesResearchRuns.find(r => matches(r, where)) ?? null });
  Object.assign(prisma.hermesResearchStep, { findFirst: async ({ where, include }: { where: { run: Record<string, unknown> } & Record<string, unknown>; include?: { run?: boolean } }) => {
    const { run: scope, ...stepWhere } = where;
    const step = db.hermesResearchSteps.find(s => {
      const run = db.hermesResearchRuns.find(r => r.id === s.runId);
      return matches(s, stepWhere) && run && matches(run, scope);
    });
    return step ? { ...step, ...(include?.run ? { run: db.hermesResearchRuns.find(r => r.id === step.runId) } : {}) } : null;
  } });
  Object.assign(prisma.hermesResearchStep, { findMany: async ({ where }: { where: { stage: string; status: string; presentationAssetId: string; run: Record<string, unknown> } }) => db.hermesResearchSteps.filter(s => {
    const r = db.hermesResearchRuns.find(r => r.id === s.runId);
    return s.stage === where.stage && s.status === where.status && s.presentationAssetId === where.presentationAssetId
      && r && Object.entries(where.run).every(([key, value]) => r[key] === value);
  }) });
  Object.assign(prisma.agentTask, { findMany: async ({ where }: { where: { kind: string; payload: { equals: string } } }) => db.agentTasks.filter(t => t.kind === where.kind && t.payload?.hermesRunAuthority?.runId === where.payload.equals) });
  const originalCreate = prisma.agentTask.create;
  prisma.agentTask.create = vi.fn(async args => {
    const runId = args.data.payload?.hermesRunAuthority?.runId;
    if (runId) {
      expect(db.auditLogs.some(r => r.action === ART_STYLE_CONTINUATION && r.targetId === runId)).toBe(true);
      expect(db.hermesResearchSteps.filter(s => s.runId === runId && ['storyboard', 'scene_image'].includes(s.stage))).toHaveLength(2);
    }
    return originalCreate(args);
  });
  const deps = { prisma, redis: { lpush: vi.fn(async () => 1) }, audit: { record: async (event: Record<string, unknown>,
    tx: { auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } }) => tx.auditLog.create({ data: event }) } } as never;
  const input = { actorId: id(1), researchObjectId: id(3), runId: run.id, expectedVersion: 1, versionId: id(4), imageAssetId: id(14),
    sceneIndex: 1, style: 'infographic:technical-schematic', idempotencyKey: 'style-key' };
  return { prisma, db, deps, input, doc, parent };
}

describe('bounded ordinary-user art style continuation', () => {
  it('allows only selected art changes and preserves all other scenes/science', () => {
    const base = document(), candidate = structuredClone(base);
    candidate.scenes[1]!.illustration!.composition = 'Diagonal';
    candidate.scenes[1]!.illustration!.treatment = 'Pencil';
    candidate.scenes[1]!.visualAction = 'Derived new composition';
    expect(() => requireArtStyleContinuationDocument(base, candidate, 1)).not.toThrow();
    for (const mutate of [(d: typeof base) => { d.scenes[0]!.visualAction = 'Changed sibling'; },
      (d: typeof base) => { d.scenes[1]!.narration = 'New science'; },
      (d: typeof base) => { d.scenes[1]!.illustration!.labels = ['New label']; }]) {
      const changed = structuredClone(candidate); mutate(changed);
      expect(() => requireArtStyleContinuationDocument(base, changed, 1)).toThrow(/science|unselected/);
    }
  });
  it('projects exact displayed image capability without granting or charging', async () => {
    const f = await fixture();
    expect(await getHermesImageArtStyleCapability(f.deps, f.input)).toMatchObject({ styleContinuation: {
      runId: f.input.runId, sceneIndex: 1, maxAgentTasks: 2, choices: [recommendations.choices[1]],
    } });
    expect(f.db.auditLogs).toHaveLength(0); expect(f.prisma.agentTask.create).not.toHaveBeenCalled();
  });
  it('fences slots before payment, returns a safe view, and replays without a second debit', async () => {
    const f = await fixture();
    const first = await createHermesArtStyleContinuation(f.deps, f.input);
    const second = await createHermesArtStyleContinuation(f.deps, f.input);
    expect(second.run.id).toBe(first.run.id); expect(first.run.maxAgentTasks).toBe(2);
    expect(first.taskIds.sceneImage).toBeNull(); expect(first.run).not.toHaveProperty('requestDigest');
    expect(f.db.usageLedger.filter(e => e.kind === 'consume')).toHaveLength(1);
    expect(f.db.presentationAssets.find(a => a.id === f.input.imageAssetId)).toMatchObject({ status: 'approved', objectKey: 'old.png' });
    await expect(createHermesArtStyleContinuation(f.deps, { ...f.input, style: 'article:watercolor' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('allows one concurrent child per exact base and rejects a second pending child even after refetch', async () => {
    const f = await fixture();
    const outcomes = await Promise.allSettled([createHermesArtStyleContinuation(f.deps, f.input),
      createHermesArtStyleContinuation(f.deps, { ...f.input, idempotencyKey: 'other' })]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    await expect(createHermesArtStyleContinuation(f.deps, { ...f.input, expectedVersion: 2, idempotencyKey: 'third' })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    expect(f.db.usageLedger.filter(e => e.kind === 'consume')).toHaveLength(1);
  });
  it('coalesces concurrent identical submissions into one charged task', async () => {
    const f = await fixture();
    const [a, b] = await Promise.all([createHermesArtStyleContinuation(f.deps, f.input), createHermesArtStyleContinuation(f.deps, f.input)]);
    expect(a.run.id).toBe(b.run.id);
    expect(f.db.usageLedger.filter(e => e.kind === 'consume')).toHaveLength(1);
  });
  it('does not expose or authorize another ordinary writer’s managed image', async () => {
    const f = await fixture();
    seedUser(f.db, { id: id(99) });
    f.db.memberships.push({ workspaceId: id(2), userId: id(99), role: 'author' });
    const input = { ...f.input, actorId: id(99) };
    expect(await getHermesImageArtStyleCapability(f.deps, input)).toEqual({ styleContinuation: null });
    await expect(createHermesArtStyleContinuation(f.deps, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(f.prisma.agentTask.create).not.toHaveBeenCalled();
  });
  it.each(['actor', 'stale', 'style', 'review', 'evidence', 'claim', 'history', 'credit'])("rejects %s before task/payment", async kind => {
    const f = await fixture();
    if (kind === 'actor') f.db.agentSessions[0].userId = id(99);
    if (kind === 'stale') f.input.expectedVersion = 9;
    if (kind === 'style') f.input.style = 'arbitrary-unrecommended';
    if (kind === 'review') f.parent.provenance.illustrationReview.decision = 'blocked';
    if (kind === 'evidence') f.db.evidenceRecords[0].exactQuote = 'Changed quote';
    if (kind === 'claim') f.db.claimNodes[0].statement = 'Changed science';
    if (kind === 'history') f.db.versions[0].publicVersionId = 'published';
    if (kind === 'credit') f.db.usageLedger.length = 0;
    await expect(createHermesArtStyleContinuation(f.deps, f.input)).rejects.toThrow();
    expect(f.db.usageLedger.filter(e => e.kind === 'consume')).toHaveLength(0);
    expect(f.db.hermesResearchRuns).toHaveLength(1);
  });
  it('revalidates exact source and two-task budget at the existing pre-provider authority boundary', async () => {
    const f = await fixture(); const created = await createHermesArtStyleContinuation(f.deps, f.input);
    const task = f.db.agentTasks.find(t => t.id === created.taskIds.storyboard)!;
    task.status = 'running'; task.executionAttempt = 1;
    const provider = vi.fn();
    const invoke = async () => { await requireHermesPresentationTaskAuthority(f.prisma as never, {
      taskId: task.id, actorId: f.input.actorId, payload: task.payload, authority: task.payload.hermesRunAuthority,
    }); provider(); };
    await invoke(); expect(provider).toHaveBeenCalledTimes(1); provider.mockClear();
    f.db.claimNodes[0].statement = 'Changed after submission';
    await expect(invoke()).rejects.toThrow(); expect(provider).not.toHaveBeenCalled();
    f.db.claimNodes[0].statement = 'Two regions share a relation.';
    f.db.agentTasks.push({ ...task, id: id(90) });
    await expect(invoke()).rejects.toThrow(/allowance/); expect(provider).not.toHaveBeenCalled();
  });
  it('creates only the selected scene image after an accepted unchanged-science plan', async () => {
    const f = await fixture(); const created = await createHermesArtStyleContinuation(f.deps, f.input);
    const run = f.db.hermesResearchRuns.find(r => r.id === created.run.id)!;
    const plan = f.db.hermesResearchSteps.find(s => s.runId === run.id && s.stage === 'storyboard')!;
    const task = f.db.agentTasks.find(t => t.id === plan.agentTaskId)!;
    task.status = 'succeeded'; task.executionAttempt = 1;
    plan.presentationAssetId = task.id; plan.status = 'awaiting_approval'; run.status = 'awaiting_storyboard_review';
    const candidate = structuredClone(f.parent);
    candidate.id = task.id; candidate.provenance.taskId = task.id; candidate.provenance.illustrationReview.requestId = task.id;
    candidate.provenance.storyboardDocument.scenes[1]!.styleRecommendations!.selectedStyleId = f.input.style;
    candidate.provenance.illustrationReview.candidateHash = hash(candidate.provenance.storyboardDocument);
    f.db.presentationAssets.push(candidate);
    const loaded = await f.prisma.hermesResearchRun.findUnique({ where: { id: run.id }, include: { steps: true } });
    expect(await advanceArtStyleContinuation(f.deps, f.prisma as never, loaded)).toBe('generating_scene_images');
    const image = f.db.agentTasks.find(t => t.payload?.hermesRunAuthority?.runId === run.id && t.payload.kind === 'image')!;
    expect(image.payload.sceneImage).toEqual({ storyboardAssetId: task.id, sceneIndex: 1 });
    expect(f.db.usageLedger.filter(e => e.kind === 'consume')).toHaveLength(2);
    expect(f.db.presentationAssets.find(a => a.id === f.input.imageAssetId)?.status).toBe('approved');
  });
  it.each(['blocked', 'revised'])('lets a %s final review be rejected and stop without an image task', async decision => {
    const f = await fixture(); const created = await createHermesArtStyleContinuation(f.deps, f.input);
    const run = f.db.hermesResearchRuns.find(r => r.id === created.run.id)!;
    const plan = f.db.hermesResearchSteps.find(s => s.runId === run.id && s.stage === 'storyboard')!;
    const task = f.db.agentTasks.find(t => t.id === plan.agentTaskId)!;
    task.status = 'succeeded'; task.executionAttempt = 1;
    plan.presentationAssetId = task.id; plan.status = 'awaiting_approval'; run.status = 'awaiting_storyboard_review';
    const candidate = structuredClone(f.parent);
    candidate.id = task.id; candidate.provenance.taskId = task.id; candidate.provenance.illustrationReview.requestId = task.id;
    candidate.status = 'draft'; candidate.provenance.illustrationReview.decision = decision;
    f.db.presentationAssets.push(candidate);
    await expect(requireArtStyleContinuationTaskAuthority(f.prisma as never, { runId: run.id, actorId: f.input.actorId,
      taskId: task.id, payload: task.payload, review: true })).resolves.toBe(true);
    candidate.status = 'rejected';
    const loaded = await f.prisma.hermesResearchRun.findUnique({ where: { id: run.id }, include: { steps: true } });
    expect(await advanceArtStyleContinuation(f.deps, f.prisma as never, loaded)).toBe('stopped');
    expect(f.db.agentTasks.filter(t => t.payload?.hermesRunAuthority?.runId === run.id)).toHaveLength(1);
    expect(f.db.usageLedger.filter(e => e.kind === 'consume')).toHaveLength(1);
  });
  it('stops invalidated sources during reconciliation without creating another task', async () => {
    const f = await fixture(); const created = await createHermesArtStyleContinuation(f.deps, f.input);
    f.db.claimNodes[0].statement = 'Changed source after grant';
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ stopped: 1, errors: 0 });
    expect(f.db.hermesResearchRuns.find(r => r.id === created.run.id)?.status).toBe('stopped');
    expect(f.db.usageLedger.filter(e => e.kind === 'consume')).toHaveLength(1);
  });
  it('stops a worker-blocked plan with no saved asset and never creates its image', async () => {
    const f = await fixture(); const created = await createHermesArtStyleContinuation(f.deps, f.input);
    const task = f.db.agentTasks.find(t => t.id === created.taskIds.storyboard)!;
    task.status = 'failed'; task.error = '[blocked] Illustration needs upstream scientific revision';
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ stopped: 1, errors: 0 });
    expect(f.db.hermesResearchRuns.find(r => r.id === created.run.id)?.status).toBe('stopped');
    expect(f.db.agentTasks.filter(t => t.payload?.hermesRunAuthority?.runId === created.run.id)).toHaveLength(1);
  });
  it.each(['accepted', 'blocked', 'missing-receipt'])('reconciles an ordinary writer’s %s image only with exact continuation authority', async decision => {
    const f = await fixture(); const created = await createHermesArtStyleContinuation(f.deps, f.input);
    const child = () => f.db.hermesResearchRuns.find(r => r.id === created.run.id)!;
    const planTask = f.db.agentTasks.find(t => t.id === created.taskIds.storyboard)!;
    planTask.status = 'succeeded'; planTask.executionAttempt = 1;
    const planAsset = { ...structuredClone(f.parent), status: 'draft', id: planTask.id,
      label: 'presentation_not_evidence', updatedAt: new Date(), generator: 'OpenScience Hermes storyboard planner' };
    planAsset.provenance.taskId = planTask.id;
    planAsset.provenance.storyboardSettings = planTask.payload.storyboard;
    planAsset.provenance.storyboardDocument.scenes[1]!.styleRecommendations!.selectedStyleId = f.input.style;
    planAsset.provenance.illustrationReview.requestId = planTask.id;
    planAsset.provenance.illustrationReview.candidateHash = hash(planAsset.provenance.storyboardDocument);
    f.db.presentationAssets.push(planAsset);
    f.db.presentationAssetClaims.push({ presentationAssetId: planTask.id, claimId: id(6) });
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ advanced: 1, errors: 0 });
    expect(child().status).toBe('awaiting_storyboard_review');
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ advanced: 1, errors: 0 });
    expect(child().status).toBe('generating_scene_images');
    expect(f.db.presentationAssets.find(a => a.id === planTask.id)?.status).toBe('approved');
    const imageTask = f.db.agentTasks.find(t => t.payload?.hermesRunAuthority?.runId === created.run.id && t.payload.kind === 'image')!;
    imageTask.status = 'succeeded'; imageTask.executionAttempt = 1;
    const parent = (await requireSceneImageParent(f.prisma as never, imageTask.payload))!;
    const imageAsset = structuredClone(f.db.presentationAssets.find(a => a.id === f.input.imageAssetId)!);
    Object.assign(imageAsset, { id: imageTask.id, status: 'draft', label: 'presentation_not_evidence', updatedAt: new Date(), objectKey: 'new-private.png' });
    Object.assign(imageAsset.provenance, { taskId: imageTask.id, sceneImage: imageTask.payload.sceneImage, parentIdentity: parent.identity });
    Object.assign(imageAsset.provenance.imageReview, { requestId: imageTask.id, parentIdentity: parent.identity,
      decision: decision === 'accepted' ? 'accepted' : 'blocked', repairInstruction: decision !== 'accepted' ? 'The new image fails its approved brief.' : null });
    f.db.presentationAssets.push(imageAsset);
    f.db.presentationAssetClaims.push({ presentationAssetId: imageTask.id, claimId: id(6) });
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ advanced: 1, errors: 0 });
    expect(child().status).toBe('awaiting_scene_images_review');
    if (decision === 'missing-receipt') {
      const receipt = f.db.auditLogs.findIndex(r => r.action === ART_STYLE_CONTINUATION && r.targetId === child().id);
      f.db.auditLogs.splice(receipt, 1);
      // Exercise the later generic gate directly, without the internal review's earlier proof check.
      await expect(transitionPresentationAsset(f.deps, { userId: f.input.actorId, researchObjectId: f.input.researchObjectId,
        versionId: f.input.versionId, assetId: imageTask.id, status: 'rejected', expectedUpdatedAt: imageAsset.updatedAt }))
        .rejects.toMatchObject({ code: 'SOURCE_NOT_READY' });
      expect(f.db.presentationAssets.find(a => a.id === imageTask.id)?.status).toBe('draft');
      return;
    }
    const outcome = await reconcileHermesResearchRuns(f.deps);
    expect(outcome).toMatchObject({ errors: 0, ...(decision === 'accepted' ? { advanced: 1 } : { stopped: 1 }) });
    expect(child().status).toBe(decision === 'accepted' ? 'succeeded' : 'stopped');
    expect(f.db.presentationAssets.find(a => a.id === imageTask.id)?.status).toBe(decision === 'accepted' ? 'approved' : 'rejected');
    expect(f.db.users.find(u => u.id === f.input.actorId)?.platformRole).not.toBe('platform_admin');
    expect(f.db.usageLedger.filter(e => e.kind === 'consume')).toHaveLength(2);
    expect(f.db.presentationAssets.find(a => a.id === f.input.imageAssetId)).toMatchObject({ status: 'approved', objectKey: 'old.png' });
    expect(f.db.publications).toHaveLength(0);
  });
});
