import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../../../../packages/domain/test/helpers/fakes';
import { createAgentSession, submitAgentTask, markTaskProgress, claimAgentTask, getAgentTask, listAgentTasks, retryAgentTask } from '../../../../packages/domain/src/agent/agent';
import { getHermesResearchRun, reconcileHermesResearchRuns, retryHermesGeneration, recoverCompletedHermesSceneImageResults } from '../../../../packages/domain/src/agent/research-run';
import { serializeDocumentSourceMap, createBlockSourceLocator, readNativeAgentExecution, readNativeImageReviewCheckpoint, requireSceneImageParent } from '@openscience/domain';
import { workspaceGuideHandler } from '../../src/workspace-guide';
import * as selectedGuideProduction from '../../src/workspace-guide';
import { AiGateway, AnthropicCompatProvider } from '@openscience/ai-gateway';
import { createPresentationGenerationHandler, requireIllustrationReviewSubmission } from '../../src/presentation/handler';
import { createHandlers, createPollOnce, recoverProcessingQueue, type WorkerDeps } from '../../src/index';
import * as nativeHost from '../../src/native-agent/host-task';
import * as scenePlanning from '../../src/presentation/scene-image';
import * as selectedImageSource from '../../../../packages/domain/src/assets/scene-image';
import { SynclipVideoTimingError } from '../../src/presentation/synclip-video-spool';
import type { runHostedNativeTask } from '../../src/native-agent/host-task';

// Only the operating-system Agent process is replaced. The actual gateway, private store,
// task CAS, source resolution, materializers, handler and asset transaction run below.
vi.mock('../../src/native-agent/host-task', () => ({ runHostedNativeTask: async (input: Parameters<typeof runHostedNativeTask>[0]) => {
  const tools = [...['skills_list', 'skill_view'].map(name => ({ name, description: name, parameters: { type: 'object', properties: {} } })), ...input.config.sourceTools];
  // The real host reuses the authenticated saved Native system prompt on restart.
  const systemPrompt = await input.session.systemPrompt() ?? input.config.instructions;
  const bindFirstTurn = (input.session as typeof input.session & {
    bindFirstTurn?: (goal: string, systemPrompt: string) => Promise<void>;
  }).bindFirstTurn;
  await bindFirstTurn?.(input.config.goal, systemPrompt);
  const messages: Array<Record<string, unknown>> = [{ role: 'system', content: systemPrompt }, { role: 'user', content: input.config.goal }];
  let sequence = 0;
  for (let turn = 0; turn < 8; turn++) {
    const response = await input.session.complete({ model: input.config.model, max_tokens: 1000, messages,
      tools: tools.map(tool => ({ type: 'function', function: tool })) });
    const message = response.choices[0]!.message;
    if (!message.tool_calls?.length) return { finalResponse: message.content!, observedPassageIds: [] };
    messages.push(message as unknown as Record<string, unknown>);
    for (const tool of message.tool_calls) {
      await input.authorize();
      const result = await input.paper.call(tool.function.name, JSON.parse(tool.function.arguments), sequence++, tool.id);
      messages.push({ role: 'tool', tool_call_id: tool.id, content: JSON.stringify(result) });
      if (tool.function.name === 'paper_image_view') {
        const images = await input.paper.images!(JSON.parse(tool.function.arguments), result);
        messages.push({ role: 'user', content: images.content });
      }
    }
  }
  throw new Error('Fixture did not finish');
} }));

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const quote = 'Two regions are connected under the stated condition.';
const core = { schemaVersion: '0.1.0', problem: quote, method: quote, results: quote, insight: quote, limitations: quote, reproducibility: quote };
const science = { title: 'Connected regions', narrative: { mainMessage: 'A conditional relation', audience: 'New readers' }, scenes: [{ title: 'Two regions',
  narration: quote, message: 'A supported connection', domain: 'conceptual', subjects: [{ description: 'Connected regions', basis: { sourceId: 's0' } }],
  encoding: 'A link represents the relation of subject 0.', labels: ['Connected regions'], constraints: ['Not to scale'], paperOriginalAssetId: null }] };
const responses = [
  ['context', 'paper_illustration_context', {}], ['science', 'paper_illustration_science', science],
  ['art', 'paper_illustration_art', { scienceToolCallId: 'science', scenes: [{ layout: 'Place label 0 above subject 0.', treatment: 'Crisp ink on plain white paper.' }] }],
  ['review', 'paper_illustration_review', { planToolCallId: 'art', decision: 'accepted', summary: 'Source, scientific relationship and layout agree.', corrections: [], issues: [] }],
] as const;

async function fixture(automaticRun = false, nativeVideo = false, additionalClaim = false) {
  let transactionError: unknown;
  const { prisma, db } = createFakePrisma(); seedUser(db, { id: id(1), platformRole: 'user' });
  db.workspaces.push({ id: id(2), status: 'active' }); db.memberships.push({ userId: id(1), workspaceId: id(2), role: 'author' });
  db.researchObjects.push({ id: id(3), workspaceId: id(2), createdBy: id(1), status: 'draft', visibility: 'private', deletedAt: null });
  db.commits.push({ id: id(9), branchId: id(10) });
  db.versions.push({ id: id(4), researchObjectId: id(3), status: 'draft', versionNo: 1, commitId: id(9), publicVersionId: null, createdAt: new Date() });
  db.versionManifests.push({ id: id(11), versionId: id(4), coreJson: core });
  db.manifestEntries.push({ id: id(12), manifestId: id(11), artifactId: id(7), blobSha256: 'a'.repeat(64) });
  db.usageLedger.push({ id: id(13), userId: id(1), resource: 'ai_credit', delta: 10 });
  const parser = { name: 'fixture', version: '1' };
  const map = { artifactId: id(7), contentHash: 'a'.repeat(64), parser, pages: [{ page: 1, width: 100, height: 100,
    blocks: [{ id: 'block', kind: 'paragraph', text: quote, boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] }] };
  const bytes = Buffer.from(serializeDocumentSourceMap(map));
  const ref = { schemaVersion: 1, parserStatus: 'succeeded', artifactId: id(7), contentHash: 'a'.repeat(64), objectKey: `derived/source-maps/${sha(bytes)}.json`, serializedSha256: sha(bytes), size: bytes.length };
  db.artifacts.push({ id: id(7), workspaceId: id(2), blobSha256: ref.contentHash, mimeType: 'application/pdf', logicalPath: 'paper.pdf', deletedAt: null, bytesPurgedAt: null });
  db.agentSessions.push({ id: id(14), userId: id(1), researchObjectId: id(3), kind: 'ingestion', status: 'active', deletedAt: null });
  db.agentTasks.push({ id: id(15), sessionId: id(14), kind: 'sdf.extract', status: 'succeeded', deletedAt: null, updatedAt: new Date(),
    result: { core, sourceMapRef: ref, scientificReview: { status: 'review_received', contractVersion: '5', responseHash: 'd'.repeat(64) } } });
  db.ingestionBatches.push({ id: id(16), userId: id(1), researchObjectId: id(3) });
  db.ingestionTasks.push({ id: id(17), batchId: id(16), artifactId: id(7), agentTaskId: id(15), state: 'confirmed' });
  db.claimNodes.push({ id: id(5), researchObjectId: id(3), versionId: id(4), kind: 'core', statement: quote, assessment: 'supported',
    conditions: [], limitations: [], extractionStatus: 'succeeded', provenance: { source: 'reviewed_ingestion', sourceTaskId: id(17) } });
  db.evidenceRecords.push({ id: id(6), claimId: id(5), researchObjectId: id(3), versionId: id(4), artifactId: id(7), contentHash: ref.contentHash,
    exactQuote: quote, relation: 'supports', locator: createBlockSourceLocator(JSON.parse(bytes.toString('utf8')), 'block', { charRange: { start: 0, end: quote.length } }), extractionStatus: 'succeeded',
    updatedAt: new Date(), provenance: { source: 'reviewed_ingestion', sourceTaskId: id(17), sourceMapRef: ref } });
  const objects = new Map([[ref.objectKey, bytes]]);
  if (additionalClaim) {
    db.claimNodes.push({ ...structuredClone(db.claimNodes[0]), id: id(55) });
    db.evidenceRecords.push({ ...structuredClone(db.evidenceRecords[0]), id: id(56), claimId: id(55) });
  }
  const putObject = vi.fn(async (key: string, body: Uint8Array) => { const data = Buffer.from(body); objects.set(key, data); return { key, size: data.length }; });
  const deps = { prisma, redis: { lpush: vi.fn(async () => 1) }, mailer: {} as never,
    audit: { record: async (event: Record<string, unknown>) => void await prisma.auditLog.create({ data: event }) },
    nativeAgentRuntime: { runtimeId: 'installed-fixture', skillCatalogueId: 'fixture-catalogue', model: 'MiniMax-M3' },
    storage: { putObject, headObject: async (key: string) => objects.has(key) ? { key, size: objects.get(key)!.length } : null,
      getObject: async (key: string) => { const data = objects.get(key); if (!data) throw new Error('Missing fixture object'); return { body: Readable.from([data]), size: data.length }; } } };
  const session = await createAgentSession(deps as never, { userId: id(1), researchObjectId: id(3), kind: 'visualization' });
  let payload = { schemaVersion: 1, researchObjectId: id(3), versionId: id(4), kind: 'interactive_html', sourceClaimIds: additionalClaim ? [id(5), id(55)] : [id(5)],
    storyboard: { locale: 'en', style: 'aged-academia', instruction: 'Explain the relation.', output: nativeVideo ? 'video' : 'image', narrative: true, narrativeSceneLimit: nativeVideo ? 3 : 1 } };
  const submit = () => submitAgentTask(deps as never, { userId: id(1), sessionId: session.id, kind: 'presentation.generate', payload, idempotencyKey: 'native-plan', dispatch: false });
  if (automaticRun) {
    const findTasks = prisma.agentTask.findMany.bind(prisma.agentTask);
    prisma.agentTask.findMany = async args => (await findTasks(args)).filter(row =>
      (!args.where.id || (typeof args.where.id === 'string' ? row.id === args.where.id : args.where.id.in.includes(row.id)))
      && (!args.where.idempotencyKey || (typeof args.where.idempotencyKey === 'string' ? row.idempotencyKey === args.where.idempotencyKey
        : row.idempotencyKey?.startsWith(args.where.idempotencyKey.startsWith))));
    prisma.agentTask.findFirst = async args => (await prisma.agentTask.findMany(args))[0] ?? null;
    prisma.hermesResearchRun.findUniqueOrThrow = async args => (await prisma.hermesResearchRun.findUnique(args))!;
    prisma.hermesResearchRun.findFirst = async ({ where }) => {
      const rows = await prisma.hermesResearchRun.findMany({ where });
      return rows.find(row => ['id', 'profile', 'researchObjectId', 'versionId'].every(key =>
        where[key] === undefined || row[key] === where[key])) ?? null;
    };
    prisma.agentTask.count = async ({ where }) => (await prisma.agentTask.findMany({ where })).length;
    prisma.auditLog.findMany = async ({ where }) => db.auditLogs.filter(row =>
      ['action', 'targetId', 'targetType', 'actorId'].every(key => where[key] === undefined || row[key] === where[key])
      && (!where.metadata?.path || where.metadata.path.reduce((value: Record<string, unknown>, key: string) => value?.[key], row.metadata) === where.metadata.equals));
    prisma.auditLog.findFirst = async args => (await prisma.auditLog.findMany(args))[0] ?? null;
    const transaction = prisma.$transaction.bind(prisma);
    prisma.$transaction = async (...args) => {
      try { return await transaction(...args); } catch (error) { transactionError = error; throw error; }
    };
    db.hermesResearchRuns.push({ id: id(30), actorId: id(1), researchObjectId: id(3), versionId: id(4),
      profile: 'visual-narrative-v1', maxAgentTasks: 9, sourceClaimIds: [id(5)], sourceReviewDigest: 'f'.repeat(64),
      generationSettings: { locale: 'en', style: 'aged-academia', instruction: 'Explain the relation.' },
      status: 'awaiting_claim_review', version: 2, error: null, lastReconciledAt: null, createdAt: new Date(), updatedAt: new Date() });
    db.hermesResearchSteps.push({ id: id(31), runId: id(30), stage: 'source_ingestion', ordinal: 0, status: 'succeeded',
      ingestionTaskId: id(17), artifactId: id(7), agentTaskId: id(15), presentationAssetId: null });
    const createdRun = await reconcileHermesResearchRuns(deps as never);
    expect(createdRun, transactionError instanceof Error ? transactionError.stack : String(transactionError)).toMatchObject({ advanced: 1, errors: 0 });
  }
  const submitted = automaticRun ? db.agentTasks.find(row => row.kind === 'presentation.generate')! : await submit();
  const owner = db.agentTasks.find(row => row.id === submitted.id)!;
  payload = owner.payload;
  Object.assign(owner, { status: 'running', executionAttempt: 1 });
  prisma.trashEntry = { findFirst: async () => null } as never;
  prisma.agentTask.findUniqueOrThrow = async args => (await prisma.agentTask.findUnique(args))!;
  let localVideoScene: number | undefined;
  const fetcher = vi.fn(async () => {
    const step = responses[fetcher.mock.calls.length - 1];
    let input: unknown = step?.[2];
    if (nativeVideo && step?.[1] === 'paper_illustration_science') input = { ...science,
      videoProduction: { schemaVersion: 1, narrativeArc: 'question-mechanism-takeaway', visualContinuity: 'Keep the same connected regions.',
        audioPolicy: 'external-narration', modelPolicy: 'commercial-primary' },
      scenes: Array.from({ length: 3 }, () => ({ ...science.scenes[0], durationSeconds: 10,
        videoDirection: { shotType: 'mechanism', purpose: 'Explain the connection', subjectLock: 'The connected regions',
          generatedElements: 'Only the source-supported regions', motion: 'Reveal the connection while keeping its endpoints fixed', camera: 'Fixed view',
          reference: 'scene-artwork', frameStrategy: 'start-reference', audioMode: 'external-narration', subtitleMode: 'none',
          negativeConstraints: ['Do not invent a measurement'], modelPolicy: 'commercial-primary' } })) };
    if (nativeVideo && step?.[1] === 'paper_illustration_art') input = { scienceToolCallId: 'science',
      scenes: Array.from({ length: localVideoScene === undefined ? 3 : 1 }, () => ({
        layout: localVideoScene === undefined ? 'Place label 0 above subject 0.' : 'Place label 0 above subject 0 with generous negative space.',
        treatment: 'Crisp ink on plain white paper.' })) };
    return new Response(JSON.stringify({ model: 'MiniMax-M3', content: step ? [{ type: 'tool_use', id: step[0], name: step[1], input }]
      : [{ type: 'text', text: '{"reviewToolCallId":"review"}' }], stop_reason: step ? 'tool_use' : 'end_turn', usage: { input_tokens: 20, output_tokens: 20 } }));
  });
  const gateway = new AiGateway({ providers: [new AnthropicCompatProvider('minimax-key-1-model-1', { baseUrl: 'https://offline.invalid', apiKey: 'fixture', model: 'MiniMax-M3' }, fetcher)] });
  const oldPlan = vi.spyOn(gateway, 'completeStructured'), oldReview = vi.spyOn(gateway, 'reviewScientific'), generate = vi.spyOn(gateway, 'generateImage');
  const handler = createPresentationGenerationHandler({ gateway, nativeAgent: { gateway, inboxRoot: '/unused-test-socket', renderPages: async () => [] } });
  const task = () => ({ id: owner.id, payload, executionAttempt: owner.executionAttempt, retryCount: 0 });
  const resume = vi.spyOn(gateway, 'resumeImageFromCompletedResult');
  const canResume = vi.spyOn(gateway, 'canResumeImageFromCompletedResult');
  return { deps, db, owner, task, handler, fetcher, gateway, oldPlan, oldReview, generate, resume, canResume, submit, putObject,
    useLocalVideoScene: (index: number) => { localVideoScene = index; }, transactionError: () => transactionError };
}

async function selectedGuideFixture(goal = 'Clarify the left connecting line', additionalClaim = false) {
  const f = await fixture(false, false, additionalClaim);
  const plan = await f.handler(f.deps as never, f.task() as never);
  await markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1, status: 'succeeded', result: plan });
  f.db.presentationAssets[0].status = 'approved';
  const sceneImage = { storyboardAssetId: f.owner.id, sceneIndex: 0 };
  const parent = await requireSceneImageParent(f.deps.prisma, { researchObjectId: id(3), versionId: id(4), sourceClaimIds: f.owner.payload.sourceClaimIds, sceneImage });
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const image = { id: id(50), researchObjectId: id(3), versionId: id(4), kind: 'image', status: 'draft', deletedAt: null,
    contentHash: sha(bytes), objectKey: 'private/selected.png', provenance: { subtype: 'storyboard_scene_image', contentType: 'image/png', sceneImage, parentIdentity: parent!.identity } };
  await f.putObject(image.objectKey, bytes); f.db.presentationAssets.push(image);
  f.db.presentationAssetClaims.push({ presentationAssetId: image.id, claimId: id(5) });
  if (additionalClaim) f.db.presentationAssetClaims.push({ presentationAssetId: image.id, claimId: id(55) });
  const session = await createAgentSession(f.deps as never, { userId: id(1), researchObjectId: id(3), kind: 'workspace.guide' });
  const payload = { goal, locale: 'en', route: 'research-object-edit', target: null,
    context: { tasks: [], researchObjects: [], presentation: { researchObjectId: id(3), versionId: id(4), selectedImageAssetId: image.id } } };
  const task = await submitAgentTask(f.deps as never, { userId: id(1), sessionId: session.id, kind: 'workspace.guide', payload, idempotencyKey: 'selected-guide', dispatch: false });
  const claimed = await claimAgentTask(f.deps as never, task.id);
  f.fetcher.mockClear();
  const selectedResponses = [responses[0], ['selected-view', 'paper_image_view', {}], ...responses.slice(1)] as const;
  f.fetcher.mockImplementation(async () => {
    const step = selectedResponses[f.fetcher.mock.calls.length - 1];
    return new Response(JSON.stringify({ model: 'MiniMax-M3', content: step ? [{ type: 'tool_use', id: step[0], name: step[1], input: step[2] }]
      : [{ type: 'text', text: '{"reviewToolCallId":"review"}' }], stop_reason: step ? 'tool_use' : 'end_turn', usage: { input_tokens: 20, output_tokens: 20 } }));
  });
  const run = (executionAttempt = claimed!.executionAttempt) => workspaceGuideHandler(f.gateway, f.deps as never, { id: task.id, payload, executionAttempt },
    { gateway: f.gateway, inboxRoot: '/unused-test-socket', renderPages: async () => [] });
  const runThroughFactory = () => createHandlers(f.gateway, { nativeAgentInboxRoot: '/unused-test-socket',
    parserCascade: { renderPages: async () => ({ pages: [] }) } as never })['workspace.guide']!(f.deps as never,
    { id: task.id, payload, executionAttempt: claimed!.executionAttempt, retryCount: 0 });
  return { ...f, image, bytes, guide: task, run, runThroughFactory };
}

async function completedSelectedEditFixture(goal?: string, additionalClaim = false) {
  const f = await selectedGuideFixture(goal, additionalClaim), result = await f.run();
  await markTaskProgress(f.deps as never, { taskId: f.guide.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
  const deps = { ...f.deps, sceneImageEnabled: true, nativeSceneImageEnabled: true };
  deps.prisma.hermesResearchRun.findFirst = (async args => (await deps.prisma.hermesResearchRun.findMany(args))[0] ?? null) as typeof deps.prisma.hermesResearchRun.findFirst;
  return { ...f, result, deps, prepare: () => selectedGuideProduction.prepareSelectedImageGeneration(deps as never, { userId: id(1), guideTaskId: f.guide.id }) };
}

describe('selected-image Native guide', () => {
  it('keeps the full selected request when it exceeds the old presentation instruction limit', async () => {
    const goal = 'Make the left arrow thinner. ' + 'Retain the original scientific relation. '.repeat(30);
    expect(goal.length).toBeGreaterThan(1000);
    const f = await completedSelectedEditFixture(goal), child = await f.prepare();
    expect(child?.id).toBeTruthy();
    expect(f.db.agentTasks.find(row => row.id === f.guide.id)!.payload.goal).toBe(goal);
    expect(JSON.stringify(f.fetcher.mock.calls).includes(goal.trim())).toBe(true);
  });
  it('uses the original active guide lease for adoption and retains the paid result when the guide completes', async () => {
    const f = await selectedGuideFixture(), result = await f.run();
    const deps = { ...f.deps, sceneImageEnabled: true, nativeSceneImageEnabled: true };
    deps.prisma.hermesResearchRun.findFirst = (async args => (await deps.prisma.hermesResearchRun.findMany(args))[0] ?? null) as typeof deps.prisma.hermesResearchRun.findFirst;
    const prepare = (executionAttempt: number) => selectedGuideProduction.prepareSelectedImageGeneration(deps as never,
      { userId: id(1), guideTaskId: f.guide.id, executionAttempt });
    await expect(prepare(0)).rejects.toThrow();
    expect(f.db.presentationAssets).toHaveLength(2);
    const child = await prepare(1);
    expect(child?.id).toBeTruthy();
    expect((await getAgentTask(deps as never, { userId: id(1), taskId: f.guide.id })).result?.nextSteps)
      .toEqual(expect.arrayContaining([expect.objectContaining({ intent: 'open-task', targetId: child!.id })]));
    const parent = f.db.presentationAssets.find(row => row.id === f.guide.id)!;
    expect(parent.status).toBe('approved');
    expect(f.db.auditLogs).toEqual(expect.arrayContaining([expect.objectContaining({ actorId: null,
      action: 'presentation_asset.system_approved', metadata: expect.objectContaining({ guideTaskId: f.guide.id, userAccepted: false }) })]));
    await markTaskProgress(deps as never, { taskId: f.guide.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
    expect((await prepare(1))?.id).toBe(child?.id);
    expect(f.fetcher).toHaveBeenCalledTimes(6);
  });
  it.each(['source-image', 'goal', 'claim'])('refuses a changed %s after the paid image reply and before writing its pixels', async change => {
    const f = await completedSelectedEditFixture(), child = await f.prepare();
    if (!child) throw new Error('Expected selected image child');
    const row = f.db.agentTasks.find(item => item.id === child.id)!;
    const claimed = await claimAgentTask(f.deps as never, child.id);
    f.generate.mockImplementationOnce(async () => {
      if (change === 'source-image') f.image.contentHash = 'f'.repeat(64);
      if (change === 'goal') f.db.agentTasks.find(item => item.id === f.guide.id)!.payload.goal = 'Change a different object';
      if (change === 'claim') f.db.claimNodes[0].statement = 'Another relation';
      return { bytes: f.bytes, contentType: 'image/png', provider: 'synclip', model: 'gpt-image-2.5', promptHash: 'c'.repeat(64) };
    });
    await expect(f.handler(f.deps as never, { id: child.id, payload: row.payload,
      executionAttempt: claimed!.executionAttempt, retryCount: 0 } as never)).rejects.toThrow();
    expect(f.generate).toHaveBeenCalledOnce();
    expect(f.db.presentationAssets.some(asset => asset.id === child.id)).toBe(false);
    expect(f.db.agentTasks.filter(item => item.payload?.sceneImage?.storyboardAssetId === f.guide.id)).toHaveLength(1);
  });
  it.each(['kind', 'body', 'actor'])('does not project a forged %s child into the original guide', async change => {
    const f = await completedSelectedEditFixture(), child = await f.prepare();
    const row = f.db.agentTasks.find(item => item.id === child!.id)!;
    if (change === 'kind') row.kind = 'workspace.guide';
    if (change === 'body') row.payload.sceneImage.storyboardAssetId = f.owner.id;
    if (change === 'actor') f.db.agentSessions.find(session => session.id === row.sessionId)!.userId = id(99);
    const view = await getAgentTask(f.deps as never, { userId: id(1), taskId: f.guide.id });
    expect(view.result?.nextSteps ?? []).toEqual([]);
    expect(view.result?.summary).toContain('cannot be confirmed');
  });
  it('does not send a guide-owned parent through the generic renderer when its real owner is missing', async () => {
    const f = await completedSelectedEditFixture(), child = await f.prepare();
    const row = f.db.agentTasks.find(item => item.id === child!.id)!, claimed = await claimAgentTask(f.deps as never, child!.id);
    f.db.agentTasks.splice(f.db.agentTasks.findIndex(item => item.id === f.guide.id), 1);
    await expect(f.handler(f.deps as never, { id: row.id, payload: row.payload, executionAttempt: claimed!.executionAttempt, retryCount: 0 } as never))
      .rejects.toThrow('Selected-image parent has no original guide owner');
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('retains the complete original PNG evidence scope when the edited scene cites only one Claim', async () => {
    const f = await completedSelectedEditFixture(undefined, true), child = await f.prepare();
    expect(f.result.selectedImageDraft!.source.sourceClaimIds).toEqual([id(5)]);
    const row = f.db.agentTasks.find(item => item.id === child!.id)!;
    expect(row.payload.sourceClaimIds).toEqual([id(5), id(55)]);
    const claimed = await claimAgentTask(f.deps as never, row.id);
    f.generate.mockRejectedValue(new Error('R2_MULTICLAIM_IMAGE_CAPTURED'));
    await expect(f.handler(f.deps as never, { id: row.id, payload: row.payload,
      executionAttempt: claimed!.executionAttempt, retryCount: 0 } as never)).rejects.toThrow('R2_MULTICLAIM_IMAGE_CAPTURED');
  });
  it('renders the real selected-guide child and reviews its saved pixels through the existing Native image path', async () => {
    const f = await completedSelectedEditFixture(), child = await f.prepare();
    if (!child) throw new Error('Expected the normal selected-image child');
    f.deps.prisma.presentationAsset.findUniqueOrThrow = (async args => {
      const row = await f.deps.prisma.presentationAsset.findUnique(args);
      if (!row) throw new Error('Missing selected-image parent in fixture');
      return row;
    }) as typeof f.deps.prisma.presentationAsset.findUniqueOrThrow;
    f.deps.prisma.presentationAsset.update = (async args => {
      const changed = await f.deps.prisma.presentationAsset.updateMany({ where: args.where, data: args.data });
      if (changed.count !== 1) throw new Error('Selected-image fixture asset changed');
      return f.deps.prisma.presentationAsset.findUniqueOrThrow({ where: args.where });
    }) as typeof f.deps.prisma.presentationAsset.update;
    // Honor the real reservation query; the shared fake otherwise returns an older task's debit.
    f.deps.prisma.usageLedger.findFirst = (async args => {
      const where = (args?.where ?? {}) as Record<string, unknown>;
      return f.db.usageLedger.find(row => ['idempotencyKey', 'userId', 'resource', 'kind', 'period']
        .every(key => where[key] === undefined || row[key] === where[key])) ?? null;
    }) as typeof f.deps.prisma.usageLedger.findFirst;
    const claimed = await claimAgentTask(f.deps as never, child.id), row = f.db.agentTasks.find(item => item.id === child.id)!;
    let turns = 0;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ model: 'MiniMax-M3',
      content: ++turns === 1 ? [{ type: 'tool_use', id: 'r2-skill', name: 'skill_view', input: { name: 'openscience-source-review' } },
        { type: 'tool_use', id: 'r2-image', name: 'paper_image_view', input: {} }]
        : [{ type: 'text', text: JSON.stringify({ decision: 'accepted', summary: 'The approved relation is visible.', repairInstruction: null }) }],
      stop_reason: turns === 1 ? 'tool_use' : 'end_turn', usage: { input_tokens: 20, output_tokens: 20 } })));
    const gateway = new AiGateway({ providers: [new AnthropicCompatProvider('minimax-key-1-model-1',
      { baseUrl: 'https://offline.invalid', apiKey: 'fixture', model: 'MiniMax-M3' }, fetcher)],
      illustrationReviewPolicy: async () => true, authorizeIllustrationReview: input => requireIllustrationReviewSubmission(f.deps.prisma, input) });
    const generate = vi.spyOn(gateway, 'generateImage').mockResolvedValue({ bytes: f.bytes, contentType: 'image/png', provider: 'synclip',
      model: 'gpt-image-2.5', promptHash: 'c'.repeat(64) });
    const noReplan = vi.spyOn(gateway, 'completeStructured');
    const host = vi.spyOn(nativeHost, 'runHostedNativeTask').mockImplementation(async input => {
      const messages: Array<Record<string, unknown>> = [{ role: 'system', content: input.config.instructions }, { role: 'user', content: input.config.goal }];
      const tools = [...['skills_list', 'skill_view'].map(name => ({ name, description: name, parameters: { type: 'object', properties: {} } })),
        ...input.config.sourceTools].map(tool => ({ type: 'function', function: tool }));
      const first = await input.session.complete({ model: input.config.model, max_tokens: 1000, messages, tools });
      messages.push(first.choices[0]!.message as unknown as Record<string, unknown>);
      for (const tool of first.choices[0]!.message.tool_calls ?? []) {
        await input.authorize(); const args = JSON.parse(tool.function.arguments);
        const response = tool.function.name === 'skill_view' ? { success: true, content: 'Check the actual image against its approved scientific relation.' }
          : await input.paper.call(tool.function.name, args, 0, tool.id);
        messages.push({ role: 'tool', tool_call_id: tool.id, content: JSON.stringify(response) });
        if (tool.function.name === 'paper_image_view') messages.push({ role: 'user', content: (await input.paper.images!(args, response)).content });
      }
      const last = await input.session.complete({ model: input.config.model, max_tokens: 1000, messages, tools });
      return { finalResponse: last.choices[0]!.message.content!, observedPassageIds: [] };
    });
    try {
      const handler = createPresentationGenerationHandler({ gateway, nativeAgent: { gateway, inboxRoot: '/unused-test-socket',
        runtime: f.deps.nativeAgentRuntime, renderPages: async () => [] } });
      const result = await handler(f.deps as never, { id: child.id, payload: row.payload, executionAttempt: claimed!.executionAttempt, retryCount: 0 } as never);
      await markTaskProgress(f.deps as never, { taskId: child.id, expectedExecutionAttempt: claimed!.executionAttempt, status: 'succeeded', result });
      expect(result).toMatchObject({ assetId: child.id, contentHash: sha(f.bytes), imageReview: { decision: 'accepted', requestId: child.id } });
      expect(f.db.presentationAssets.find(asset => asset.id === child.id)).toMatchObject({ kind: 'image', status: 'draft',
        contentHash: sha(f.bytes), provenance: { sceneImage: { storyboardAssetId: f.guide.id, sceneIndex: 0 } } });
      expect(generate).toHaveBeenCalledOnce(); expect(noReplan).not.toHaveBeenCalled();
      expect(JSON.stringify(fetcher.mock.calls)).toContain(f.bytes.toString('base64'));
    } finally { host.mockRestore(); }
  });
  it.each(['Why is the left arrow reversed?', 'How should I change this?', 'Do not change the arrow', 'If needed, redraw the arrow',
    '不要修改这张图', '如果需要再生成', '先不生成，只讨论修改方案',
    '请给我解释如何修改图中的箭头', '给我解释如何修改图中的箭头', '请给大家解释如何修改图中的箭头',
    '请为我们解释如何修改图中的箭头', '给我一份修改这张图的方案',
    '请给我说明怎么生成这张图片', '为读者解释修改箭头的方案',
    '给大家一份修改这张图的方案', '给这张图的修改方案提些建议',
    '给这张图的说明标签改细一点', '给大家解释如何修改箭头并解释原因',
    '把修改图的方法告诉我', '修改图的方法告诉我', '把图中左边的箭头改细一点后告诉我原因',
    '给这张图修改左边箭头', '给这张图修改左边箭头并解释原因',
    '请把第二张图换成水彩风格', '修改这张图的右上角', '为我们重画第二张图的右上角',
    '请给我把左边箭头改细一点', '给我示范把箭头改细一点', '请把左边箭头千万别改细',
    '把这句原话“把箭头改细一点', '“把箭头改细一点”', '把箭头改细一点”',
    '将来再把箭头改细一点', '将图中左边的箭头改细一点'])(
    'does not produce from an accepted proposal without imperative authority (including unsupported argument forms): %s', async goal => {
    const f = await completedSelectedEditFixture(goal);
    const before = { tasks: f.db.agentTasks.length, assets: f.db.presentationAssets.length, ledger: structuredClone(f.db.usageLedger), nativeCalls: f.fetcher.mock.calls.length };
    expect(await f.prepare()).toBeUndefined();
    expect(f.db.agentTasks).toHaveLength(before.tasks); expect(f.db.presentationAssets).toHaveLength(before.assets);
    expect(f.db.usageLedger).toEqual(before.ledger); expect(f.generate).not.toHaveBeenCalled();
    expect(f.fetcher).toHaveBeenCalledTimes(before.nativeCalls);
    expect(f.db.agentTasks.find(row => row.id === f.guide.id)!.payload.goal).toBe(goal);
    expect(f.result.selectedImageDraft).toMatchObject({ status: 'private-proposal' });
  });
  it.each(['cp', 'future-attempt', 'request', 'hash', 'tools', 'review-tool', 'missing-review-tool', 'runtime', 'source-image', 'evidence', 'scope', 'actor', 'permission'])(
    'rejects a changed selected source before adoption or charge: %s', async change => {
      const f = await completedSelectedEditFixture(), owner = f.db.agentTasks.find(row => row.id === f.guide.id)!;
      const before = { tasks: f.db.agentTasks.length, assets: f.db.presentationAssets.length, ledger: structuredClone(f.db.usageLedger) };
      if (change === 'cp') delete owner.result.nativeAgentExecution.checkpoint;
      if (change === 'future-attempt') owner.result.nativeAgentExecution.checkpoint.executionAttempt = 99;
      if (change === 'request') owner.result.storyboardReview.requestId = id(99);
      if (change === 'hash') owner.result.storyboardReview.candidateHash = '0'.repeat(64);
      if (change === 'tools') owner.result.nativeAgentExecution.checkpoint.hasToolCalls = true;
      if (change === 'review-tool') owner.result.nativeIllustration.reviewToolCallId = 'not-the-paid-tool';
      if (change === 'missing-review-tool') { delete owner.result.nativeIllustration.reviewToolCallId; delete owner.result.selectedImageReply.reviewToolCallId; }
      if (change === 'runtime') owner.result.nativeIllustration.runtimeId = 'another-runtime';
      if (change === 'source-image') f.image.contentHash = 'f'.repeat(64);
      if (change === 'evidence') f.db.evidenceRecords[0].exactQuote = 'Another scientific claim';
      if (change === 'scope') owner.payload.context.presentation.versionId = id(99);
      if (change === 'actor') f.db.agentSessions.find(row => row.id === owner.sessionId)!.userId = id(99);
      if (change === 'permission') f.db.memberships[0].role = 'viewer';
      await expect(f.prepare()).rejects.toThrow();
      expect(f.db.agentTasks).toHaveLength(before.tasks); expect(f.db.presentationAssets).toHaveLength(before.assets);
      expect(f.db.usageLedger).toEqual(before.ledger); expect(f.generate).not.toHaveBeenCalled();
    });
  it.each(['parent-saved', 'child-dispatch', 'response-lost'])('resumes the same selected operation after %s without another Native charge', async stage => {
    const f = await completedSelectedEditFixture(), calls = f.fetcher.mock.calls.length;
    const before = f.db.usageLedger.filter(row => row.kind === 'consume').length;
    if (stage === 'parent-saved') {
      const update = f.deps.prisma.presentationAsset.updateMany.bind(f.deps.prisma.presentationAsset);
      const spy = vi.spyOn(f.deps.prisma.presentationAsset, 'updateMany').mockImplementationOnce((async args => {
        if (args?.data?.status === 'approved') throw new Error('R2_CRASH_AFTER_PARENT');
        return update(args);
      }) as typeof update);
      try { await expect(f.prepare()).rejects.toThrow('R2_CRASH_AFTER_PARENT'); } finally { spy.mockRestore(); }
      expect(f.db.presentationAssets.find(row => row.id === f.guide.id)?.status).toBe('draft');
    }
    if (stage === 'child-dispatch') {
      f.deps.redis.lpush.mockRejectedValueOnce(new Error('R2_DISPATCH_REPLY_LOST'));
      await f.prepare().catch(() => undefined);
    }
    if (stage === 'response-lost') await f.prepare(); // The first tab never receives this completed response.
    const first = await f.prepare(), second = await f.prepare();
    expect(first?.id).toBe(second?.id); expect(first?.id).toBeTruthy();
    expect(f.db.presentationAssets.filter(row => row.id === f.guide.id)).toHaveLength(1);
    expect(f.db.agentTasks.filter(row => row.payload?.sceneImage?.storyboardAssetId === f.guide.id)).toHaveLength(1);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(before + 1);
    expect(f.fetcher).toHaveBeenCalledTimes(calls);
  });
  it.each([undefined, '请把左边箭头改细一点',
    '把图中左边的箭头改细一点', '把图中左边的箭头改细一点并解释原因', '请把文字“MQED”移到右下角',
    '把文字“不要”移到右下角', '把图中左边的箭头画细一点，不要修改其他内容'])(
    'adopts an accepted selected-image edit into one truthful parent and paid child without changing the guide receipt: %s', async goal => {
    const f = await selectedGuideFixture(goal);
    const result = await f.run();
    await markTaskProgress(f.deps as never, { taskId: f.guide.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
    const stored = f.db.agentTasks.find(row => row.id === f.guide.id)!;
    const receipt = structuredClone(stored.result), original = structuredClone(f.image);
    const calls = f.fetcher.mock.calls.length, debits = f.db.usageLedger.filter(row => row.kind === 'consume').length;
    const deps = { ...f.deps, sceneImageEnabled: true, nativeSceneImageEnabled: true };
    // This existing in-memory adapter lacks findFirst; execute the real common transition query.
    deps.prisma.hermesResearchRun.findFirst = (async args => (await deps.prisma.hermesResearchRun.findMany(args))[0] ?? null) as typeof deps.prisma.hermesResearchRun.findFirst;
    const prepare = (selectedGuideProduction as unknown as { prepareSelectedImageGeneration: (
      deps: unknown, input: { userId: string; guideTaskId: string }) => Promise<{ id: string }> }).prepareSelectedImageGeneration;
    const child = await prepare(deps, { userId: id(1), guideTaskId: f.guide.id });
    expect(child.id).not.toBe(f.guide.id);
    expect(f.db.presentationAssets.find(row => row.id === f.guide.id)).toMatchObject({ status: 'approved', kind: 'interactive_html',
      provenance: { taskId: f.guide.id, subtype: 'sourced_storyboard', storyboardDocument: result.selectedImageDraft!.document } });
    expect(f.db.agentTasks.find(row => row.id === child.id)).toMatchObject({ kind: 'presentation.generate',
      payload: { kind: 'image', sceneImage: { storyboardAssetId: f.guide.id, sceneIndex: 0 } } });
    expect((await prepare(deps, { userId: id(1), guideTaskId: f.guide.id })).id).toBe(child.id);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(debits + 1);
    expect(f.fetcher).toHaveBeenCalledTimes(calls);
    expect(stored.result).toEqual(receipt);
    expect(stored.result.nextSteps).toEqual([]);
    expect(f.image).toEqual(original);
    expect((await getAgentTask(deps as never, { userId: id(1), taskId: f.guide.id })).result?.nextSteps)
      .toEqual(expect.arrayContaining([expect.objectContaining({ intent: 'open-task', targetId: child.id })]));
    const claimed = await claimAgentTask(deps as never, child.id);
    const imageTask = f.db.agentTasks.find(row => row.id === child.id)!;
    f.generate.mockRejectedValue(new Error('R2_REAL_IMAGE_BOUNDARY_CAPTURED'));
    await expect(f.handler(deps as never, { id: child.id, payload: imageTask.payload,
      executionAttempt: claimed!.executionAttempt, retryCount: 0 } as never)).rejects.toThrow('R2_REAL_IMAGE_BOUNDARY_CAPTURED');
    expect(f.generate).toHaveBeenCalledOnce();
    expect(f.generate.mock.calls[0][0]).toMatchObject({ requestId: child.id,
      prompt: expect.stringContaining(result.selectedImageDraft!.document.scenes[0]!.illustration!.message) });
    expect(f.oldPlan).not.toHaveBeenCalled();
  });
  it('uses the actual existing Worker factory Native configuration', async () => {
    const f = await selectedGuideFixture();
    expect(await f.runThroughFactory()).toMatchObject({ selectedImageDraft: { source: { assetId: f.image.id } } });
    expect(f.fetcher).toHaveBeenCalledTimes(6);
  });
  it('reads exact saved PNG and original brief through real Native history and returns a private proposal, not an image', async () => {
    const f = await selectedGuideFixture();
    const result = await f.run();
    expect(result.selectedImageDraft).toMatchObject({ status: 'private-proposal', source: { assetId: f.image.id, contentHash: f.image.contentHash },
      document: { scenes: [{ illustration: { message: 'A supported connection' } }] } });
    const owner = f.db.agentTasks.find(row => row.id === f.guide.id)!;
    expect(readNativeAgentExecution(owner.result)?.checkpoint?.state).toBe('completed');
    expect(owner.result.selectedImageContext.assetId).toBe(f.image.id);
    expect(f.fetcher).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(f.fetcher.mock.calls)).toContain(f.bytes.toString('base64'));
    expect(f.db.presentationAssets).toHaveLength(2);
    expect(f.generate).not.toHaveBeenCalled(); expect(f.oldPlan).not.toHaveBeenCalled();
    const beforeAdoption = await getAgentTask(f.deps as never, { userId: id(1), taskId: owner.id });
    expect(beforeAdoption.result?.selectedImageDraft).toEqual(result.selectedImageDraft);
    expect(beforeAdoption.result).toHaveProperty('selectedImageReference.assetId', f.image.id);
    expect(beforeAdoption.result).not.toHaveProperty('selectedImageContext');
    expect(beforeAdoption.result).not.toHaveProperty('selectedImageReply');
    await markTaskProgress(f.deps as never, { taskId: f.guide.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
    expect(owner.status).toBe('succeeded');
    const adopted = await getAgentTask(f.deps as never, { userId: id(1), taskId: owner.id });
    expect(adopted.result?.selectedImageDraft).toEqual(result.selectedImageDraft);
    expect(adopted.result).not.toHaveProperty('selectedImageContext');
    expect(adopted.result).not.toHaveProperty('selectedImageReply');
  });
  it.each(['deleted', 'content', 'bytes', 'evidence', 'viewer'])('stops changed %s before any new model call', async change => {
    const f = await selectedGuideFixture();
    if (change === 'deleted') f.image.deletedAt = new Date() as never;
    if (change === 'content') f.image.contentHash = 'f'.repeat(64);
    if (change === 'bytes') await f.putObject(f.image.objectKey, Buffer.from('substituted bytes'));
    if (change === 'evidence') f.db.evidenceRecords[0].exactQuote = 'Another source';
    if (change === 'viewer') f.db.memberships[0].role = 'viewer';
    await expect(f.run()).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.db.presentationAssets).toHaveLength(2); expect(f.generate).not.toHaveBeenCalled();
  });
  it.each(['question', 'explanation'] as const)('returns a bounded %s only after real image and original context reads', async kind => {
    const f = await selectedGuideFixture();
    const text = kind === 'question' ? 'Which of the two left-hand connecting lines should change?' : 'The connecting line represents the source-supported relation between the two regions.';
    const steps = [responses[0], ['selected-view', 'paper_image_view', {}], ['reply', 'paper_selected_image_reply', { kind, text }]] as const;
    f.fetcher.mockImplementation(async () => {
      const step = steps[f.fetcher.mock.calls.length - 1];
      return new Response(JSON.stringify({ model: 'MiniMax-M3', content: step ? [{ type: 'tool_use', id: step[0], name: step[1], input: step[2] }]
        : [{ type: 'text', text: '{"replyToolCallId":"reply"}' }], stop_reason: step ? 'tool_use' : 'end_turn', usage: { input_tokens: 20, output_tokens: 20 } }));
    });
    const result = await f.run();
    expect(result).toMatchObject({ summary: text, needsMoreInformation: kind === 'question', nextSteps: [] });
    expect(result.selectedImageDraft).toBeUndefined();
    await markTaskProgress(f.deps as never, { taskId: f.guide.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
    const publicTask = await getAgentTask(f.deps as never, { userId: id(1), taskId: f.guide.id });
    expect(publicTask.result).toMatchObject({ summary: text, selectedImageReference: { assetId: f.image.id } });
    expect(publicTask.result).not.toHaveProperty('selectedImageContext');
    expect(publicTask.result).not.toHaveProperty('selectedImageReply');
    expect(f.fetcher).toHaveBeenCalledTimes(4); expect(f.db.presentationAssets).toHaveLength(2);
  });
  it('refuses a text-only plan that never actually views the selected PNG', async () => {
    const f = await selectedGuideFixture();
    f.fetcher.mockImplementation(async () => {
      const step = responses[f.fetcher.mock.calls.length - 1];
      return new Response(JSON.stringify({ model: 'MiniMax-M3', content: step ? [{ type: 'tool_use', id: step[0], name: step[1], input: step[2] }]
        : [{ type: 'text', text: '{"reviewToolCallId":"review"}' }], stop_reason: step ? 'tool_use' : 'end_turn', usage: { input_tokens: 20, output_tokens: 20 } }));
    });
    await expect(f.run()).rejects.toThrow();
    const owner = f.db.agentTasks.find(row => row.id === f.guide.id)!;
    expect(owner.result.selectedImageDraft).toBeUndefined();
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('allows Native to re-inspect the same exact saved image without losing a valid explanation', async () => {
    const f = await selectedGuideFixture();
    const text = 'The second look confirms that the left-hand line is the connection described by the original brief.';
    const steps = [responses[0], ['selected-view-1', 'paper_image_view', {}], ['selected-view-2', 'paper_image_view', {}],
      ['reply', 'paper_selected_image_reply', { kind: 'explanation', text }]] as const;
    f.fetcher.mockImplementation(async () => {
      const step = steps[f.fetcher.mock.calls.length - 1];
      return new Response(JSON.stringify({ model: 'MiniMax-M3', content: step ? [{ type: 'tool_use', id: step[0], name: step[1], input: step[2] }]
        : [{ type: 'text', text: '{"replyToolCallId":"reply"}' }], stop_reason: step ? 'tool_use' : 'end_turn', usage: { input_tokens: 20, output_tokens: 20 } }));
    });
    expect(await f.run()).toMatchObject({ summary: text, needsMoreInformation: false });
    expect(f.fetcher).toHaveBeenCalledTimes(5); expect(f.db.presentationAssets).toHaveLength(2);
  });
  it.each([1, 2])('refuses a substituted image in OS view %i even when the selected view receipt is correct', async viewNumber => {
    const f = await selectedGuideFixture();
    if (viewNumber === 2) {
      const steps = [responses[0], ['selected-view-1', 'paper_image_view', {}], ['selected-view-2', 'paper_image_view', {}],
        ['reply', 'paper_selected_image_reply', { kind: 'explanation', text: 'A source-grounded connection.' }]] as const;
      f.fetcher.mockImplementation(async () => {
        const step = steps[f.fetcher.mock.calls.length - 1];
        return new Response(JSON.stringify({ model: 'MiniMax-M3', content: step ? [{ type: 'tool_use', id: step[0], name: step[1], input: step[2] }]
          : [{ type: 'text', text: '{"replyToolCallId":"reply"}' }], stop_reason: step ? 'tool_use' : 'end_turn', usage: { input_tokens: 20, output_tokens: 20 } }));
      });
    }
    const original = nativeHost.runHostedNativeTask;
    const replacement = Buffer.from(f.bytes); replacement[replacement.length - 1] ^= 1;
    let views = 0;
    const spy = vi.spyOn(nativeHost, 'runHostedNativeTask').mockImplementationOnce(input => original({ ...input, paper: { ...input.paper,
      images: async (args, receipt) => {
        const result = await input.paper.images!(args, receipt);
        if (++views !== viewNumber) return result;
        return { content: result.content.map(block => block.type === 'image_url'
          ? { ...block, image_url: { url: `data:image/png;base64,${replacement.toString('base64')}` } } : block) };
      } } }));
    try { await expect(f.run()).rejects.toThrow(); } finally { spy.mockRestore(); }
    const owner = f.db.agentTasks.find(row => row.id === f.guide.id)!;
    expect(owner.result.selectedImageDraft).toBeUndefined();
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('retains the paid final history across revoked authority and resumes that same task without another model call', async () => {
    const f = await selectedGuideFixture(); const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (...args) => {
      const response = await original(...args);
      if (f.fetcher.mock.calls.length === 6) f.db.memberships[0].role = 'viewer';
      return response;
    });
    const failure = await f.run().catch(error => error);
    expect(failure).toBeInstanceOf(Error);
    const owner = f.db.agentTasks.find(row => row.id === f.guide.id)!;
    expect(readNativeAgentExecution(owner.result)?.checkpoint?.state).toBe('completed');
    expect(owner.result.selectedImageDraft).toBeUndefined();
    await markTaskProgress(f.deps as never, { taskId: owner.id, expectedExecutionAttempt: 1, status: 'failed', error: failure.message });
    const saved = structuredClone({ payload: owner.payload, sessionId: owner.sessionId, idempotencyKey: owner.idempotencyKey, result: owner.result, ledger: f.db.usageLedger });
    const root = f.deps.prisma, realSource = selectedImageSource.requireSelectedImageSource;
    const binder = vi.spyOn(selectedImageSource, 'requireSelectedImageSource').mockImplementation((...args) => realSource(...args));
    type Tx = Parameters<typeof realSource>[0];
    const transactionClients: Tx[] = [], transact = root.$transaction.bind(root);
    let insideTransaction = false, reads = 0;
    const transactions = vi.spyOn(root, '$transaction').mockImplementation((async (work: (tx: Tx) => Promise<unknown>,
      options?: Parameters<typeof root.$transaction>[1]) => transact(async tx => {
        transactionClients.push(tx); insideTransaction = true;
        try { return await work(tx); } finally { insideTransaction = false; }
      }, options)) as never);
    Object.defineProperty(f.deps, 'prisma', { configurable: true, get: () => {
      reads += 1;
      if (insideTransaction) throw new Error('Selected retry must use its explicit transaction');
      return root;
    } });
    try {
      expect((await getAgentTask(f.deps as never, { userId: id(1), taskId: owner.id })).canRetry).toBe(false);
      expect(reads).toBe(2); expect(binder.mock.calls[0]![0]).toBe(root);
      await expect(retryAgentTask(f.deps as never, { userId: id(1), taskId: owner.id })).rejects.toThrow();
      expect(binder.mock.calls[1]![0]).toBe(transactionClients[0]);
      f.db.memberships[0].role = 'author'; reads = 0;
      expect((await getAgentTask(f.deps as never, { userId: id(1), taskId: owner.id })).canRetry).toBe(true);
      expect(reads).toBe(2); expect(binder.mock.calls[2]![0]).toBe(root); reads = 0;
      expect((await listAgentTasks(f.deps as never, { userId: id(1) })).find(task => task.id === owner.id)?.canRetry).toBe(true);
      expect(reads).toBe(2); expect(binder.mock.calls[3]![0]).toBe(root);
      await retryAgentTask(f.deps as never, { userId: id(1), taskId: owner.id });
      expect(binder.mock.calls[4]![0]).toBe(transactionClients[1]);
      expect(transactionClients).toHaveLength(2);
      expect(transactionClients.every(tx => tx !== root)).toBe(true);
      expect(transactions.mock.calls.map(call => call[1])).toEqual([
        { isolationLevel: 'Serializable' }, { isolationLevel: 'Serializable' },
      ]);
      expect(binder.mock.calls.map(call => call[1])).toEqual(Array.from({ length: 5 }, () => ({
        userId: id(1), researchObjectId: id(3), versionId: id(4), assetId: f.image.id,
      })));
    } finally {
      binder.mockRestore(); transactions.mockRestore();
      Object.defineProperty(f.deps, 'prisma', { configurable: true, writable: true, value: root });
    }
    const claimed = await claimAgentTask(f.deps as never, owner.id);
    expect(claimed!.executionAttempt).toBe(2);
    const resumed = f.db.agentTasks.find(row => row.id === owner.id)!;
    expect({ payload: resumed.payload, sessionId: resumed.sessionId, idempotencyKey: resumed.idempotencyKey, result: resumed.result, ledger: f.db.usageLedger }).toEqual(saved);
    const result = await f.run(claimed!.executionAttempt);
    expect(result).toHaveProperty('selectedImageDraft');
    await markTaskProgress(f.deps as never, { taskId: owner.id, expectedExecutionAttempt: claimed!.executionAttempt, status: 'succeeded', result });
    const publicTask = await getAgentTask(f.deps as never, { userId: id(1), taskId: owner.id });
    expect(publicTask.status).toBe('succeeded');
    expect(publicTask.result?.selectedImageDraft).toEqual(result.selectedImageDraft);
    expect(publicTask.result).toHaveProperty('selectedImageReference.assetId', f.image.id);
    expect(publicTask.result).not.toHaveProperty('selectedImageContext');
    expect(publicTask.result).not.toHaveProperty('selectedImageReply');
    const completed = f.db.agentTasks.find(row => row.id === owner.id)!;
    expect(completed.result.nativeAgentExecution).toEqual(saved.result.nativeAgentExecution);
    expect(completed.result.selectedImageContext).toEqual(saved.result.selectedImageContext);
    expect(f.db.usageLedger).toEqual(saved.ledger);
    expect(f.fetcher).toHaveBeenCalledTimes(6);
    expect(f.db.usageLedger.filter(row => Number(row.delta) === -1)).toHaveLength(2);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it.each(['viewer', 'started', 'no-checkpoint', 'wrong-task', 'wrong-source', 'wrong-target', 'tools-final', 'source-changed', 'ordinary-guide', 'session', 'budget'])(
    'denies paid selected retry with %s without changing the paid history or charging again', async change => {
      const f = await selectedGuideFixture(); const original = f.fetcher.getMockImplementation()!;
      f.fetcher.mockImplementation(async (...args) => {
        const response = await original(...args);
        if (f.fetcher.mock.calls.length === 6) f.db.memberships[0].role = 'viewer';
        return response;
      });
      const failure = await f.run().catch(error => error); expect(failure).toBeInstanceOf(Error);
      const owner = f.db.agentTasks.find(row => row.id === f.guide.id)!;
      await markTaskProgress(f.deps as never, { taskId: owner.id, expectedExecutionAttempt: 1, status: 'failed', error: failure.message });
      if (change !== 'viewer') f.db.memberships[0].role = 'author';
      const cp = owner.result.nativeAgentExecution.checkpoint;
      if (change === 'started') { cp.state = 'started'; delete cp.responseHash; delete cp.finishReason; delete cp.hasToolCalls; }
      if (change === 'no-checkpoint') delete owner.result.nativeAgentExecution.checkpoint;
      if (change === 'wrong-task') cp.taskId = id(99);
      if (change === 'wrong-source') cp.sourceMapHash = 'f'.repeat(64);
      if (change === 'wrong-target') cp.target.model = 'Another model';
      if (change === 'tools-final') cp.hasToolCalls = true;
      if (change === 'source-changed') f.db.presentationAssets.find(row => row.id === f.image.id)!.contentHash = 'f'.repeat(64);
      if (change === 'ordinary-guide') delete owner.payload.context.presentation.selectedImageAssetId;
      if (change === 'session') f.db.agentSessions.find(row => row.id === owner.sessionId)!.kind = 'sdf.extract';
      if (change === 'budget') owner.retryCount = 1;
      const saved = structuredClone({ result: owner.result, payload: owner.payload, ledger: f.db.usageLedger });
      const publicTask = await getAgentTask(f.deps as never, { userId: id(1), taskId: owner.id });
      expect(publicTask.canRetry).toBe(false);
      if (change === 'wrong-target') {
        expect(publicTask.result).not.toHaveProperty('selectedImageReference');
        expect(publicTask.result).not.toHaveProperty('selectedImageContext');
        expect(publicTask.result).not.toHaveProperty('selectedImageReply');
      }
      await expect(retryAgentTask(f.deps as never, { userId: id(1), taskId: owner.id })).rejects.toThrow();
      expect({ result: owner.result, payload: owner.payload, ledger: f.db.usageLedger }).toEqual(saved);
      expect(f.fetcher).toHaveBeenCalledTimes(6); expect(f.generate).not.toHaveBeenCalled();
    });
});

async function failedNativeImage() {
  const f = await fixture(true);
  const result = await f.handler(f.deps as never, f.task() as never);
  await markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
  Object.assign(f.deps, { nativeSceneImageEnabled: true, inspectImageRecoveryState: vi.fn(async () => 'completed') });
  const run = f.db.hermesResearchRuns[0];
  for (let step = 0; step < 3; step++) {
    run.lastReconciledAt = null;
    expect(await reconcileHermesResearchRuns(f.deps as never)).toMatchObject({ errors: 0 });
  }
  const image = f.db.agentTasks.find(row => row.payload?.sceneImage)!;
  expect(image).toBeDefined();
  Object.assign(image, { status: 'failed', executionAttempt: 1, retryCount: 0, error: 'Provider result was not available before worker deadline' });
  Object.assign(run, { status: 'failed', error: image.error });
  Object.assign(f.db.hermesResearchSteps.find(row => row.stage === 'scene_image')!, { status: 'failed', error: image.error });
  return { ...f, run, image, input: { actorId: id(1), researchObjectId: id(3), runId: run.id,
    expectedVersion: run.version, idempotencyKey: 'recover-existing-native-png' } };
}

describe('automatic original paid Native image admission through the existing Worker', () => {
  it('reclaims startup attempt2, then admits one private original PNG through default maintenance, outbox and actual handler', async () => {
    const f = await failedNativeImage();
    Object.assign(f.deps.prisma.usageLedger, { findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
      f.db.usageLedger.find(row => row.idempotencyKey === where.idempotencyKey) ?? null });
    const findLedger = f.deps.prisma.usageLedger.findFirst.bind(f.deps.prisma.usageLedger);
    vi.spyOn(f.deps.prisma.usageLedger, 'findFirst').mockImplementation(async args => args?.where?.idempotencyKey
      ? f.db.usageLedger.find(row => Object.entries(args.where!).every(([key, value]) => row[key] === value)) ?? null
      : findLedger(args));
    Object.assign(f.deps.prisma.presentationAsset, {
      findUniqueOrThrow: async (args: Parameters<typeof f.deps.prisma.presentationAsset.findUnique>[0]) => {
        const row = await f.deps.prisma.presentationAsset.findUnique(args);
        if (!row) throw new Error('Missing fixture presentation asset');
        return row;
      },
      update: async (args: Parameters<typeof f.deps.prisma.presentationAsset.update>[0]) => {
        const changed = await f.deps.prisma.presentationAsset.updateMany({ where: args.where, data: { provenance: args.data.provenance } });
        if (changed.count !== 1) throw new Error('Missing fixture presentation asset');
        return f.deps.prisma.presentationAsset.findUniqueOrThrow({ where: args.where });
      },
    });
    const original = { tasks: f.db.agentTasks.map(task => task.id), ledger: structuredClone(f.db.usageLedger), payload: structuredClone(f.image.payload) };
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/QWQAAAAASUVORK5CYII=', 'base64');
    let current = 0, complete = false, reviewCalls = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => current);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ model: 'MiniMax-M3',
      content: ++reviewCalls === 1 ? [
        { type: 'tool_use', id: 'image-skill', name: 'skill_view', input: { name: 'openscience-source-review' } },
        { type: 'tool_use', id: 'image-view', name: 'paper_image_view', input: {} },
      ] : [{ type: 'text', text: JSON.stringify({ decision: 'accepted', summary: 'The source-supported regions are connected.', repairInstruction: null }) }],
      stop_reason: reviewCalls === 1 ? 'tool_use' : 'end_turn', usage: { input_tokens: 20, output_tokens: 20 } })));
    const gateway = new AiGateway({ providers: [new AnthropicCompatProvider('minimax-key-1-model-1',
      { baseUrl: 'https://offline.invalid', apiKey: 'fixture', model: 'MiniMax-M3' }, fetcher)],
    illustrationReviewPolicy: async () => true, authorizeIllustrationReview: input => requireIllustrationReviewSubmission(f.deps.prisma, input) });
    const generate = vi.spyOn(gateway, 'generateImage'), replan = vi.spyOn(gateway, 'completeStructured');
    const canResume = vi.spyOn(gateway, 'canResumeImageFromCompletedResult').mockImplementation(async requestId => complete && requestId === f.image.id);
    const resume = vi.spyOn(gateway, 'resumeImageFromCompletedResult').mockImplementation(async requestId => {
      expect(requestId).toBe(f.image.id);
      return { bytes: png, contentType: 'image/png', provider: 'synclip', model: 'gpt-image-2.5', promptHash: 'c'.repeat(64) };
    });
    // Replace only the OS process for this new image-role phase. The real SDK history, image view,
    // source/permission checks, review checkpoint, private store and handler terminal CAS are retained.
    const host = vi.spyOn(nativeHost, 'runHostedNativeTask').mockImplementation(async input => {
      expect(input.config.sourceTools.map(tool => tool.name)).toContain('paper_image_view');
      const tools = [...['skills_list', 'skill_view'].map(name => ({ name, description: name, parameters: { type: 'object', properties: {} } })),
        ...input.config.sourceTools].map(tool => ({ type: 'function', function: tool }));
      const messages: Array<Record<string, unknown>> = [{ role: 'system', content: input.config.instructions }, { role: 'user', content: input.config.goal }];
      const first = await input.session.complete({ model: input.config.model, max_tokens: 1000, messages, tools });
      messages.push(first.choices[0]!.message as unknown as Record<string, unknown>);
      for (const tool of first.choices[0]!.message.tool_calls ?? []) {
        const args = JSON.parse(tool.function.arguments);
        await input.authorize();
        const result = tool.function.name === 'skill_view' ? { success: true, content: 'Compare the shown relation to its approved source.' }
          : await input.paper.call(tool.function.name, args, 0, tool.id);
        messages.push({ role: 'tool', tool_call_id: tool.id, content: JSON.stringify(result) });
        if (tool.function.name === 'paper_image_view') {
          if (!input.paper.images) throw new Error('Image view fixture must supply the actual saved PNG');
          const image = await input.paper.images(args, result);
          messages.push({ role: 'user', content: image.content });
        }
      }
      const last = await input.session.complete({ model: input.config.model, max_tokens: 1000, messages, tools });
      return { finalResponse: last.choices[0]!.message.content!, observedPassageIds: [] };
    });
    const lists = new Map<string, string[]>([['agent:queue', []], ['agent:queue:processing', [f.image.id]]]);
    const move = async (from: string, to: string) => {
      const id = lists.get(from)?.pop() ?? null;
      if (id) lists.set(to, [id, ...(lists.get(to) ?? [])]);
      return id;
    };
    const redis = { lrange: async (key: string) => [...(lists.get(key) ?? [])],
      lindex: async (key: string, index: number) => (lists.get(key) ?? []).at(index) ?? null,
      rpoplpush: move, brpoplpush: move,
      lpush: async (key: string, id: string) => { lists.set(key, [id, ...(lists.get(key) ?? [])]); return lists.get(key)!.length; },
      lrem: async (key: string, _count: number, id: string) => { const rows = lists.get(key) ?? [], at = rows.indexOf(id); if (at < 0) return 0; rows.splice(at, 1); return 1; } };
    const deps = { ...f.deps, redis, nativeSceneImageEnabled: true,
      inspectImageRecoveryState: async (requestId: string) => await gateway.canResumeImageFromCompletedResult(requestId) ? 'completed' as const : 'unsafe' as const } as unknown as WorkerDeps;
    const handler = createPresentationGenerationHandler({ gateway, nativeAgent: { gateway, inboxRoot: '/unused-test-socket',
      runtime: f.deps.nativeAgentRuntime, renderPages: async () => [] } });
    Object.assign(f.image, { status: 'running', error: null });
    Object.assign(f.run, { status: 'generating_scene_images', lastReconciledAt: null });
    Object.assign(f.db.hermesResearchSteps.find(step => step.agentTaskId === f.image.id)!, { status: 'running', error: null });
    try {
      expect(await recoverProcessingQueue(deps)).toBe(1);
      const poll = await createPollOnce({ 'presentation.generate': handler });
      expect(await poll(deps)).toBe(true);
      expect(f.image).toMatchObject({ status: 'failed', executionAttempt: 2, retryCount: 0,
        error: '[blocked] Previous paid image attempt has no saved result; explicit new generation is required' });
      expect(resume).not.toHaveBeenCalled();
      complete = true; current = 5_000; f.run.lastReconciledAt = null;
      expect(await poll(deps)).toBe(true);
      const savedTask = await deps.prisma.agentTask.findUniqueOrThrow({ where: { id: f.image.id } });
      expect(savedTask, `${savedTask.error ?? ''}; ${String(f.transactionError() ?? '')}`).toMatchObject({ status: 'succeeded', executionAttempt: 3, retryCount: 1, payload: original.payload,
        result: { assetId: f.image.id, imageReview: { decision: 'accepted' } } });
      const admitted = f.db.presentationAssets.filter(asset => asset.id === f.image.id);
      expect(admitted).toHaveLength(1);
      expect(admitted[0]).toMatchObject({ kind: 'image', status: 'draft', contentHash: sha(png), generatorVersion: 'gpt-image-2.5' });
      expect(f.putObject.mock.calls.filter(([key]) => key.endsWith('.png')).map(([, body]) => Buffer.from(body))).toEqual([png]);
      expect(resume).toHaveBeenCalledTimes(1);
      expect(generate).not.toHaveBeenCalled(); expect(replan).not.toHaveBeenCalled();
      expect(f.db.agentTasks.map(task => task.id)).toEqual(original.tasks);
      expect(f.db.usageLedger).toEqual(original.ledger);
      expect(f.db.researchObjects[0].visibility).toBe('private');
      expect(await recoverCompletedHermesSceneImageResults(deps)).toMatchObject({ resumed: 0 });
      expect(f.db.presentationAssets.filter(asset => asset.id === f.image.id)).toHaveLength(1);
      expect(fetcher).toHaveBeenCalledTimes(2); // remaining scientific review, never a new image generation
    } finally { host.mockRestore(); canResume.mockRestore(); resume.mockRestore(); generate.mockRestore(); replan.mockRestore(); clock.mockRestore(); }
  });
});

describe('ordinary-user native illustration through real task/store/asset boundaries', () => {
  it('passes the actual contradictory art reply to a scripted blocked final reviewer without generating an image', async () => {
    // This proves consumer wiring and a blocked terminal, not LLM semantic detection.
    const f = await fixture();
    const value = structuredClone(science);
    value.scenes[0]!.encoding += ' A comparison of the same relation is described in an inset.';
    let reviewedPrompt = '', reviewGuidanceObserved = false;
    f.fetcher.mockImplementation(async () => {
      const [, request] = f.fetcher.mock.calls.at(-1) as unknown as [unknown, RequestInit];
      const body = JSON.parse(String(request.body)) as {
        tools: Array<{ name: string; description: string }>;
        messages: Array<{ role: string; content: string | Array<{ type: string; tool_use_id?: string; content?: string }> }>;
      };
      const step = f.fetcher.mock.calls.length - 1;
      let scripted: unknown = responses[step]?.[2];
      if (step === 1) scripted = value;
      if (step === 2) scripted = { scienceToolCallId: 'science', scenes: [{
        layout: 'A single panel with label 0 and a separate title at the top.', treatment: 'Ink on white; no inset or data-like marks.' }] };
      if (step === 3) {
        const art = body.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
          .find(block => block.type === 'tool_result' && block.tool_use_id === 'art');
        const reply = JSON.parse(art!.content!) as {
          document: { scenes: Array<{ illustration: { encoding: string; composition: string; treatment: string; labels: string[] } }> };
          prompts: Array<{ prompt: string }>;
        };
        const scene = reply.document.scenes[0]!.illustration;
        reviewedPrompt = reply.prompts[0]!.prompt;
        for (const field of [scene.encoding, scene.composition, scene.treatment, ...scene.labels]) expect(reviewedPrompt).toContain(field);
        expect(scene.encoding).toContain('comparison');
        expect(scene.composition).toContain('separate title');
        expect(scene.labels).toEqual(['Connected regions']);
        reviewGuidanceObserved = body.tools.find(tool => tool.name === 'paper_illustration_review')!.description.includes('all visible text');
        scripted = { planToolCallId: 'art', decision: 'blocked', summary: 'Scripted fixture: inset and title conflict with the approved depiction.',
          corrections: [], issues: [{ sceneIndex: 0, labelIndex: null, kind: 'requires_replan',
            requiredMeaning: 'Resolve the same sourced relation, layout and complete label list before accepting.', sourceIds: ['s0'] }] };
      }
      const call = responses[step];
      return new Response(JSON.stringify({ model: 'MiniMax-M3', content: call
        ? [{ type: 'tool_use', id: call[0], name: call[1], input: scripted }]
        : [{ type: 'text', text: '{"reviewToolCallId":"review"}' }], stop_reason: call ? 'tool_use' : 'end_turn',
      usage: { input_tokens: 20, output_tokens: 20 } }));
    });
    await expect(f.handler(f.deps as never, f.task() as never)).rejects.toThrow(/needs source-grounded revision/u);
    expect(reviewGuidanceObserved).toBe(true);
    expect(f.owner.result.storyboardReview.decision).toBe('blocked');
    expect(f.owner.result.illustrationPrompts[0].prompt).toBe(reviewedPrompt);
    expect(f.db.presentationAssets).toHaveLength(0);
    expect(f.generate).not.toHaveBeenCalled(); expect(f.oldReview).not.toHaveBeenCalled();
    expect(f.db.agentTasks).toHaveLength(2); expect(f.deps.redis.lpush).not.toHaveBeenCalled();
  });
  it('resumes a new guided IMAGE session using the original first-turn system, goal, tools and paid receipts', async () => {
    const f = await fixture();
    const originalHost = nativeHost.runHostedNativeTask;
    let originalGoal = '';
    const host = vi.spyOn(nativeHost, 'runHostedNativeTask').mockImplementation(async input => {
      originalGoal = input.config.goal;
      const complete = input.session.complete;
      input.session.complete = async raw => { await complete(raw); throw new Error('FIXTURE_AFTER_FIRST_COMPLETED_TURN'); };
      return originalHost(input);
    });
    try { await expect(f.handler(f.deps as never, f.task() as never)).rejects.toThrow('FIXTURE_AFTER_FIRST_COMPLETED_TURN'); }
    finally { host.mockRestore(); }
    const cp = readNativeAgentExecution(f.owner.result)!.checkpoint!;
    expect(cp.state).toBe('completed'); expect(f.fetcher).toHaveBeenCalledOnce();
    const [, firstRequest] = f.fetcher.mock.calls[0] as unknown as [unknown, RequestInit];
    const firstBody = JSON.parse(String(firstRequest.body)) as { system: string; tools: Array<{ name: string; description: string }> };
    expect(firstBody.system).toContain('主旨与代表性案例');
    expect(firstBody.tools.find(tool => tool.name === 'paper_illustration_science_repair')!.description).toContain('paper_read/paper_view');
    const completedObjects = [...f.owner.result.nativeAgentObjects];
    Object.assign(f.owner, { executionAttempt: 2, retryCount: 1 });
    const observe = vi.spyOn(nativeHost, 'runHostedNativeTask').mockImplementation(async input => {
      expect(input.config.goal).toBe(originalGoal);
      expect(await input.session.systemPrompt()).toBe(firstBody.system);
      return originalHost(input);
    });
    try { await f.handler(f.deps as never, f.task() as never); } finally { observe.mockRestore(); }
    expect(f.owner.result.nativeAgentObjects.slice(0, completedObjects.length)).toEqual(completedObjects);
    expect(f.owner.result.storyboardReview.decision).toBe('accepted');
    expect(f.fetcher).toHaveBeenCalledTimes(5); // first completed turn is replayed without a second paid publication
    expect(f.db.presentationAssets).toHaveLength(1); expect(f.generate).not.toHaveBeenCalled();
    expect(f.db.usageLedger.filter(row => Number(row.delta) === -1)).toHaveLength(1);
  });
  it.each(['noncommercial', 'timing', 'stale-lease'] as const)('keeps the native video executor and timing receipt bound through the real handler: %s', async mode => {
    const f = await fixture(false, true), planned = await f.handler(f.deps as never, f.task() as never);
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1, status: 'succeeded', result: planned });
    const parent = f.db.presentationAssets.find(row => row.id === f.owner.id)!;
    const parentIdentity = JSON.stringify({ contentHash: parent.contentHash, provenance: parent.provenance, ids: [id(5)] });
    const sourceEvidenceIdentity = parent.provenance.sourceEvidenceIdentity;
    const pixels = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/QWQAAAAASUVORK5CYII=', 'base64');
    f.db.users[0].platformRole = 'platform_admin'; Object.assign(f.deps, { nativeSceneImageEnabled: true });
    const frames: string[] = [];
    for (let sceneIndex = 0; sceneIndex < 3; sceneIndex++) {
      const imagePayload = { schemaVersion: 1, researchObjectId: id(3), versionId: id(4), kind: 'image', sourceClaimIds: [id(5)],
        sceneImage: { storyboardAssetId: parent.id, sceneIndex } };
      const submitted = await submitAgentTask(f.deps as never, { userId: id(1), sessionId: f.owner.sessionId, kind: 'presentation.generate',
        payload: imagePayload, idempotencyKey: 'offline-video-frame-' + sceneIndex, dispatch: false });
      const image = f.db.agentTasks.find(row => row.id === submitted.id)!, contentHash = sha(pixels), objectKey = 'offline-frame-' + sceneIndex + '.png';
      await f.deps.storage.putObject(objectKey, pixels);
      const imageReview = { stage: 'generated-image', requestId: image.id, decision: 'accepted', summary: 'Offline saved-pixel review fixture.',
        repairInstruction: null, contentHash, sourceEvidenceIdentity, parentIdentity, provider: 'minimax-key-1-model-1', model: 'MiniMax-M3',
        promptHash: '4'.repeat(64), responseHash: '5'.repeat(64) };
      Object.assign(image, { status: 'succeeded', result: { assetId: image.id, contentHash, imageReview,
        nativeImageReview: { mode: 'model-native', state: 'completed', executionAttempt: 1, requestId: image.id, contentHash,
          sourceEvidenceIdentity, parentIdentity, provider: imageReview.provider, model: imageReview.model,
          promptHash: imageReview.promptHash, review: imageReview } } });
      f.db.presentationAssets.push({ id: image.id, researchObjectId: id(3), versionId: id(4), kind: 'image', status: 'draft', contentHash, objectKey,
        provenance: { source: 'approved_storyboard_scene', subtype: 'storyboard_scene_image', taskId: image.id,
          sceneImage: imagePayload.sceneImage, contentType: 'image/png', sourceEvidenceIdentity, parentIdentity, imageReview } });
      f.db.presentationAssetClaims.push({ presentationAssetId: image.id, claimId: id(5) }); frames.push(image.id);
    }
    const payload = { schemaVersion: 1, researchObjectId: id(3), versionId: id(4), kind: 'video', sourceClaimIds: [id(5)],
      video: { profile: 'content-driven-v1', storyboardAssetId: parent.id, sceneImageAssetIds: frames } };
    const submitted = await submitAgentTask(f.deps as never, { userId: id(1), sessionId: f.owner.sessionId, kind: 'presentation.generate',
      payload, idempotencyKey: 'offline-native-video', dispatch: false });
    const owner = f.db.agentTasks.find(row => row.id === submitted.id)!; Object.assign(owner, { status: 'running', executionAttempt: 1 });
    const generate = vi.fn(async () => {
      if (mode === 'stale-lease') owner.executionAttempt = 2;
      throw new SynclipVideoTimingError({ inputHash: sha('bound-offline-spool'), voice: 'test-voice', speed: 1, noVideoSubmissions: true,
        scenes: parent.provenance.storyboardDocument.scenes.map((scene: { narration: string; durationSeconds: number }, sceneIndex: number) => ({
          sceneIndex, narration: scene.narration, plannedDurationSeconds: scene.durationSeconds, durationSeconds: sceneIndex === 1 ? 11 : 2,
          taskId: 'tts-' + sceneIndex, contentHash: sha('audio-' + sceneIndex), size: 1024 })) });
    });
    const handler = createPresentationGenerationHandler({ videoSpool: { ...(mode === 'noncommercial' ? {} : { provider: 'synclip' as const }), generate } });
    await expect(handler(f.deps as never, { id: owner.id, payload, executionAttempt: 1, retryCount: 0 } as never)).rejects.toThrow(
      mode === 'noncommercial' ? 'Synclip commercial video executor' : mode === 'timing' ? 'AUDIO_TIMING_REVISION_REQUIRED' : 'Video timing revision authority changed');
    if (mode === 'timing') {
      await markTaskProgress(f.deps as never, { taskId: owner.id, expectedExecutionAttempt: 1, status: 'failed', error: 'AUDIO_TIMING_REVISION_REQUIRED' });
      expect(owner.result.videoAudioTiming).toMatchObject({ schemaVersion: 1, taskId: owner.id, executionAttempt: 1, storyboardAssetId: parent.id,
        sourceEvidenceIdentity, noVideoSubmissions: true, voice: 'test-voice' });
      expect(generate).toHaveBeenCalledWith(expect.objectContaining({ videoPrompts: f.owner.result.illustrationPrompts.map((item: { videoPrompt: string }) => item.videoPrompt) }));
    } else { expect(owner.result?.videoAudioTiming).toBeUndefined(); if (mode === 'noncommercial') expect(generate).not.toHaveBeenCalled(); }
    expect(f.db.presentationAssets.some(row => row.id === owner.id)).toBe(false); expect(f.fetcher).toHaveBeenCalledTimes(5);
  });

  it.each([false, true])('replays the actual accepted private base before a local video revision (tampered prompt=%s)', async tampered => {
    const f = await fixture(false, true), first = await f.handler(f.deps as never, f.task() as never);
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1, status: 'succeeded', result: first });
    const base = structuredClone(f.db.presentationAssets.find(row => row.id === f.owner.id)!);
    const basePrompts = structuredClone(f.owner.result.illustrationPrompts);
    if (tampered) f.owner.result.illustrationPrompts[0].prompt += ' An unreviewed addition.';
    const payload = { ...f.owner.payload, storyboard: { ...f.owner.payload.storyboard, baseAssetId: f.owner.id,
      revisionSceneIndex: 1, instruction: 'Improve only the middle scene composition.' } };
    const submitted = await submitAgentTask(f.deps as never, { userId: id(1), sessionId: f.owner.sessionId,
      kind: 'presentation.generate', payload, idempotencyKey: 'native-video-local-revision', dispatch: false });
    const owner = f.db.agentTasks.find(row => row.id === submitted.id)!;
    Object.assign(owner, { status: 'running', executionAttempt: 1 }); f.fetcher.mockClear(); f.useLocalVideoScene(1);
    const execute = () => f.handler(f.deps as never, { id: owner.id, payload, executionAttempt: 1, retryCount: 0 } as never);
    if (tampered) { await expect(execute()).rejects.toThrow(/history changed/u); expect(f.fetcher).not.toHaveBeenCalled(); return; }
    const result = await execute();
    await markTaskProgress(f.deps as never, { taskId: owner.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
    const revised = f.db.presentationAssets.find(row => row.id === owner.id)!;
    expect(revised.status).toBe('draft'); expect(base.status).toBe('draft');
    for (const index of [0, 2]) {
      expect(revised.provenance.storyboardDocument.scenes[index]).toEqual(base.provenance.storyboardDocument.scenes[index]);
      expect(owner.result.illustrationPrompts[index]).toEqual(basePrompts[index]);
    }
    expect(revised.provenance.storyboardDocument.scenes[1].illustration.composition).toContain('generous negative space');
    expect(f.oldPlan).not.toHaveBeenCalled(); expect(f.oldReview).not.toHaveBeenCalled(); expect(f.generate).not.toHaveBeenCalled();
  });

  it('authorizes a native video plan through the real handler and retains its accepted full video document at adoption', async () => {
    const f = await fixture(false, true);
    const result = await f.handler(f.deps as never, f.task() as never);
    expect(result).toMatchObject({ assetId: f.owner.id, status: 'draft', storyboardReview: { decision: 'accepted' } });
    const asset = f.db.presentationAssets.find(row => row.id === f.owner.id)!;
    expect(asset.provenance.storyboardDocument).toMatchObject({ narrative: science.narrative,
      videoProduction: { audioPolicy: 'external-narration' }, scenes: Array.from({ length: 3 }, () => ({ durationSeconds: 10,
        illustration: { schemaVersion: 2 }, videoDirection: { frameStrategy: 'start-reference' } })) });
    expect(f.owner.result.illustrationPrompts).toHaveLength(3);
    expect(f.owner.result.illustrationPrompts[0].videoPrompt).toContain('Reveal the connection');
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
    expect(f.owner.status).toBe('succeeded');
    expect(f.oldPlan).not.toHaveBeenCalled(); expect(f.oldReview).not.toHaveBeenCalled(); expect(f.generate).not.toHaveBeenCalled();
  });

  it.each(['fresh paired', 'legacy'] as const)('offers completed native image recovery and reuses the same task, review state and reservation across lost-response replay: %s', async role => {
    const f = await failedNativeImage();
    if (role === 'legacy') delete f.image.result.nativeAgentExecution;
    const before = { tasks: f.db.agentTasks.length, ledger: f.db.usageLedger.length, result: structuredClone(f.image.result) };
    expect(await getHermesResearchRun(f.deps as never, f.input)).toMatchObject({ canRetryGeneration: true, chargeableAttempts: 0, generationRecovery: 'image-render' });
    await retryHermesGeneration(f.deps as never, f.input);
    expect(f.image).toMatchObject({ status: 'pending', retryCount: 1 });
    expect(f.image.result).toEqual(before.result);
    expect(f.run).toMatchObject({ status: 'generating_scene_images', maxAgentTasks: 9 });
    await retryHermesGeneration(f.deps as never, f.input);
    expect(f.db.agentTasks).toHaveLength(before.tasks);
    expect(f.db.usageLedger).toHaveLength(before.ledger);
    expect(f.fetcher).toHaveBeenCalledTimes(5);
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.db.auditLogs.filter(row => row.action === 'hermes.research_run.generation_retry')).toHaveLength(1);
  });
  it.each([false, true])('revalidates the saved plan in the resumed worker before reading provider bytes (source changed: %s)', async changed => {
    const f = await failedNativeImage();
    await retryHermesGeneration(f.deps as never, f.input);
    Object.assign(f.image, { status: 'running', executionAttempt: 2 });
    f.canResume.mockResolvedValue(true);
    if (changed) f.db.claimNodes[0].statement = 'A scientific change after the recovery transaction';
    f.resume.mockRejectedValue(new Error('COMPLETED_BYTES_CAPTURED'));
    await expect(f.handler(f.deps as never, { id: f.image.id, payload: f.image.payload, executionAttempt: 2, retryCount: 1 } as never))
      .rejects.toThrow(changed ? 'Saved storyboard inputs changed' : 'COMPLETED_BYTES_CAPTURED');
    expect(f.resume).toHaveBeenCalledTimes(changed ? 0 : 1);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'claim', 'evidence', 'membership', 'review', 'review_started', 'recovered_before'] as const)('refuses completed native image recovery when %s invalidates its existing authority', async change => {
    const f = await failedNativeImage();
    if (change === 'unknown') Object.assign(f.deps, { inspectImageRecoveryState: async () => 'unknown' });
    if (change === 'claim') f.db.claimNodes[0].statement = 'Changed scientific relationship';
    if (change === 'evidence') f.db.evidenceRecords[0].exactQuote = 'Changed evidence';
    if (change === 'membership') f.db.memberships[0].role = 'viewer';
    if (change === 'review') f.owner.result.storyboardReview.decision = 'blocked';
    if (change === 'review_started') f.image.result.nativeImageReview.state = 'started';
    if (change === 'recovered_before') f.image.retryCount = 1;
    const tasks = f.db.agentTasks.length, ledger = f.db.usageLedger.length;
    await expect(retryHermesGeneration(f.deps as never, f.input)).rejects.toThrow();
    expect(f.image.status).toBe('failed');
    expect(f.db.agentTasks).toHaveLength(tasks); expect(f.db.usageLedger).toHaveLength(ledger);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it.each(['null', 'extra-result', 'extra-review', 'malformed-role', 'wrong-profile', 'checkpoint', 'provider-failed', 'provider-throws'] as const)(
    'keeps completed native image recovery closed without writes for %s', async change => {
    const f = await failedNativeImage();
    if (change === 'null') f.image.result = null;
    if (change === 'extra-result') f.image.result.unrelatedResult = true;
    if (change === 'extra-review') f.image.result.nativeImageReview.unrelatedReview = true;
    if (change === 'malformed-role') f.image.result.nativeAgentExecution.kind = 'foreign-agent';
    if (change === 'wrong-profile') f.image.result.nativeAgentExecution.profile = 'paper-author';
    if (change === 'checkpoint') f.image.result.nativeAgentExecution.checkpoint = { state: 'completed' };
    if (change === 'provider-failed') Object.assign(f.deps, { inspectImageRecoveryState: async () => 'failed' });
    if (change === 'provider-throws') Object.assign(f.deps, { inspectImageRecoveryState: async () => { throw new Error('Provider receipt unavailable'); } });
    const before = { task: structuredClone(f.image), run: structuredClone(f.run),
      tasks: f.db.agentTasks.length, ledger: f.db.usageLedger.length, audit: f.db.auditLogs.length };
    expect((await getHermesResearchRun(f.deps as never, f.input)).canRetryGeneration).not.toBe(true);
    await expect(retryHermesGeneration(f.deps as never, f.input)).rejects.toThrow();
    expect(f.image).toEqual(before.task); expect(f.run).toEqual(before.run);
    expect(f.db.agentTasks).toHaveLength(before.tasks); expect(f.db.usageLedger).toHaveLength(before.ledger);
    expect(f.db.auditLogs).toHaveLength(before.audit); expect(f.generate).not.toHaveBeenCalled();
  });
  it.each(['prepared', 'started', 'completed', 'mismatched-pair'] as const)(
    'retains the existing non-fresh native review state without render recovery: %s', async state => {
    const f = await failedNativeImage();
    const identity = { requestId: f.image.id, executionAttempt: 1, contentHash: 'a'.repeat(64),
      sourceEvidenceIdentity: 'b'.repeat(64), parentIdentity: 'bound-parent', provider: 'minimax-key-1-model-1', model: 'MiniMax-M3' };
    if (state === 'prepared' || state === 'mismatched-pair') {
      f.image.result.nativeImageReview = { ...identity, mode: 'agent-native', state: 'prepared',
        preparedAt: 1000, deadlineAt: 301000, ...f.deps.nativeAgentRuntime,
        reservationLedgerId: 'original-reservation', maxTurns: 4, maxOutputTokens: 32768,
        maxTotalOutputTokens: 32768, maxInputBytes: 8_000_000 };
      expect(readNativeAgentExecution(f.image.result)).toEqual(f.image.result.nativeAgentExecution);
      if (state === 'mismatched-pair') f.image.result.nativeAgentExecution.runtimeId = 'foreign-runtime';
    } else {
      delete f.image.result.nativeAgentExecution;
      f.image.result.nativeImageReview = { ...identity, mode: 'model-native', state, promptHash: 'c'.repeat(64),
        ...(state === 'completed' ? { review: { ...identity, promptHash: 'c'.repeat(64), decision: 'accepted' } } : {}) };
    }
    expect(readNativeImageReviewCheckpoint(f.image.result)?.state).toBe(state === 'mismatched-pair' ? 'prepared' : state);
    const before = { task: structuredClone(f.image), run: structuredClone(f.run),
      tasks: f.db.agentTasks.length, ledger: f.db.usageLedger.length, audit: f.db.auditLogs.length };
    expect((await getHermesResearchRun(f.deps as never, f.input)).canRetryGeneration).not.toBe(true);
    await expect(retryHermesGeneration(f.deps as never, f.input)).rejects.toThrow();
    expect(f.image).toEqual(before.task); expect(f.run).toEqual(before.run);
    expect(f.db.agentTasks).toHaveLength(before.tasks); expect(f.db.usageLedger).toHaveLength(before.ledger);
    expect(f.db.auditLogs).toHaveLength(before.audit); expect(f.generate).not.toHaveBeenCalled();
  });
  it('sends the accepted native prompt unchanged without a second model planning request', async () => {
    const f = await fixture();
    const result = await f.handler(f.deps as never, f.task() as never);
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
    const savedPrompt = f.owner.result.illustrationPrompts[0].prompt;
    const recompile = vi.spyOn(scenePlanning, 'planSceneImagePrompt');
    f.db.presentationAssets[0].status = 'approved';
    f.db.users[0].platformRole = 'platform_admin';
    const payload = { schemaVersion: 1, researchObjectId: id(3), versionId: id(4), kind: 'image', sourceClaimIds: [id(5)],
      sceneImage: { storyboardAssetId: f.owner.id, sceneIndex: 0 } };
    const submitted = await submitAgentTask(f.deps as never, { userId: id(1), sessionId: f.owner.sessionId,
      kind: 'presentation.generate', payload, idempotencyKey: 'render-native-prompt', dispatch: false });
    const image = f.db.agentTasks.find(row => row.id === submitted.id)!;
    Object.assign(image, { status: 'running', executionAttempt: 1 });
    f.generate.mockRejectedValue(new Error('IMAGE_REQUEST_CAPTURED'));
    await expect(f.handler(f.deps as never, { id: image.id, payload, executionAttempt: 1, retryCount: 0 } as never)).rejects.toThrow('IMAGE_REQUEST_CAPTURED');
    expect(f.generate).toHaveBeenCalledWith({ requestId: image.id, prompt: savedPrompt }, { primaryProviderOnly: true });
    expect(f.oldPlan).not.toHaveBeenCalled();
    expect(recompile).not.toHaveBeenCalled();
    expect(f.fetcher).toHaveBeenCalledTimes(5);
  });
  it('continues the native private plan through the existing automatic flow only when the replacement renderer is configured', async () => {
    const f = await fixture(true);
    const result = await f.handler(f.deps as never, f.task() as never);
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
    Object.assign(f.deps, { nativeSceneImageEnabled: true });
    const run = f.db.hermesResearchRuns[0];
    for (let step = 0; step < 3; step++) {
      run.lastReconciledAt = null;
      const checked = await reconcileHermesResearchRuns(f.deps as never);
      expect(checked, String(f.transactionError())).toMatchObject({ errors: 0 });
    }
    const images = f.db.agentTasks.filter(row => row.payload?.sceneImage);
    expect(images, JSON.stringify({ run, assets: f.db.presentationAssets.map(row => ({ id: row.id, status: row.status })) })).toHaveLength(1);
    expect(images[0].payload.sceneImage).toEqual({ storyboardAssetId: f.owner.id, sceneIndex: 0 });
    const imageRole = { kind: 'hermes-agent', profile: 'image-review', ...f.deps.nativeAgentRuntime };
    expect(images[0].result).toEqual({ nativeImageReview: { mode: 'model-native', state: 'not_started' }, nativeAgentExecution: imageRole });
    expect(readNativeAgentExecution(images[0].result)).toEqual(imageRole);
    expect(f.fetcher).toHaveBeenCalledTimes(5);
  });
  it('rechecks the original source after a serializable completion conflict without another paid call', async () => {
    const f = await fixture();
    const result = await f.handler(f.deps as never, f.task() as never);
    const paidCalls = f.fetcher.mock.calls.length;
    const transaction = f.deps.prisma.$transaction.bind(f.deps.prisma);
    let attempts = 0;
    f.deps.prisma.$transaction = async (callback, options) => {
      if (attempts >= 2) return transaction(callback, options); // Existing discarded-result bookkeeping.
      expect(options?.isolationLevel).toBe('Serializable');
      if (++attempts === 1) {
        f.db.claimNodes[0].statement = 'A concurrently changed scientific claim.';
        throw Object.assign(new Error('Concurrent transaction'), { code: 'P2034' });
      }
      return transaction(callback, options);
    };
    await expect(markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1,
      status: 'succeeded', result })).rejects.toThrow('binding changed');
    expect(attempts).toBe(2);
    expect(f.owner.status).toBe('running');
    expect(f.fetcher).toHaveBeenCalledTimes(paidCalls);
  });
  it.each(['draft', 'approved'] as const)('automatically plans but holds a %s Native plan before the pending image API', async status => {
    const f = await fixture(true);
    expect(readNativeAgentExecution(f.owner.result)?.profile).toBe('paper-illustration');
    const result = await f.handler(f.deps as never, f.task() as never);
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1, status: 'succeeded', result });
    const run = f.db.hermesResearchRuns[0]; run.lastReconciledAt = null;
    expect(await reconcileHermesResearchRuns(f.deps as never)).toMatchObject({ errors: 0 });
    expect(run.status).toBe('awaiting_storyboard_review');
    f.db.presentationAssets[0].status = status;
    run.lastReconciledAt = null;
    expect(await reconcileHermesResearchRuns(f.deps as never)).toMatchObject({ errors: 0 });
    expect(run.status).toBe('awaiting_storyboard_review');
    expect(f.db.presentationAssets[0].status).toBe(status);
    expect(f.db.agentTasks.filter(row => row.kind === 'presentation.generate')).toHaveLength(1);
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.db.usageLedger.filter(row => Number(row.delta) === -1)).toHaveLength(1);
  });
  it('saves a private reviewed plan, preserves paid history and never enqueues image generation', async () => {
    const f = await fixture(); expect(readNativeAgentExecution(f.owner.result)?.profile).toBe('paper-illustration');
    const result = await f.handler(f.deps as never, f.task() as never);
    expect(result).toMatchObject({ assetId: f.owner.id, status: 'draft' });
    expect(f.db.presentationAssets).toHaveLength(1);
    expect(readNativeAgentExecution(f.owner.result)?.checkpoint?.state).toBe('completed');
    expect(f.owner.result.nativeAgentObjects.length).toBeGreaterThan(0);
    expect(f.owner.result.illustrationPrompts[0].prompt).toContain('Connected regions');
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, executionAttempt: 1, status: 'succeeded', result } as never);
    expect(f.owner.status).toBe('succeeded');
    expect(f.fetcher).toHaveBeenCalledTimes(5);
    expect(f.oldPlan).not.toHaveBeenCalled(); expect(f.oldReview).not.toHaveBeenCalled(); expect(f.generate).not.toHaveBeenCalled();
    expect(f.deps.redis.lpush).not.toHaveBeenCalled();
    f.deps.nativeAgentRuntime.runtimeId = 'new-runtime-must-not-rebind-paid-task';
    expect((await f.submit()).id).toBe(f.owner.id);
    expect(readNativeAgentExecution(f.owner.result)?.runtimeId).toBe('installed-fixture');
    expect(f.db.usageLedger.filter(row => Number(row.delta) === -1)).toHaveLength(1);
  });
  it.each(['membership', 'source', 'lease'] as const)('retains the paid answer but refuses asset write after %s changes', async change => {
    const f = await fixture(); const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async () => {
      const response = await original();
      if (f.fetcher.mock.calls.length === 5) {
        if (change === 'membership') f.db.memberships[0].role = 'viewer';
        if (change === 'source') f.db.evidenceRecords[0].exactQuote = 'A changed source';
        if (change === 'lease') f.owner.executionAttempt = 2;
      }
      return response;
    });
    await expect(f.handler(f.deps as never, f.task() as never)).rejects.toThrow();
    expect(f.db.presentationAssets).toHaveLength(0); expect(f.generate).not.toHaveBeenCalled();
    expect(readNativeAgentExecution(f.owner.result)?.checkpoint?.state).toBe('completed');
  });
  it('does not resubmit an unknown paid attempt on restart', async () => {
    const f = await fixture(); f.fetcher.mockRejectedValue(new Error('lost provider response'));
    await expect(f.handler(f.deps as never, f.task() as never)).rejects.toThrow();
    expect(readNativeAgentExecution(f.owner.result)?.checkpoint?.state).toBe('started');
    f.owner.executionAttempt = 2;
    await expect(f.handler(f.deps as never, f.task() as never)).rejects.toThrow(/unknown|changed|scope/iu);
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.db.presentationAssets).toHaveLength(0);
  });
  it('preserves the paid private plan if failure is recorded after asset persistence, and reuses it without another model call', async () => {
    const f = await fixture(); await f.handler(f.deps as never, f.task() as never);
    const saved = structuredClone(f.owner.result);
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1, status: 'failed', error: 'lost completion acknowledgement' });
    for (const key of ['nativeIllustrationContext', 'storyboardCheckpoint', 'storyboardReview', 'nativeIllustration', 'illustrationPrompts'])
      expect(f.owner.result[key]).toEqual(saved[key]);
    Object.assign(f.owner, { status: 'running', executionAttempt: 2, retryCount: 1 });
    const recovered = await f.handler(f.deps as never, f.task() as never);
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 2, status: 'succeeded', result: recovered });
    expect(f.owner.status).toBe('succeeded'); expect(f.fetcher).toHaveBeenCalledTimes(5);
    expect(f.db.presentationAssets).toHaveLength(1);
  });
  it.each(['claim', 'evidence', 'paper', 'lineage'] as const)('rejects changed %s at the real terminal boundary after the asset is already saved', async change => {
    const f = await fixture(); const result = await f.handler(f.deps as never, f.task() as never);
    if (change === 'claim') f.db.claimNodes[0].statement = 'Changed claim';
    if (change === 'evidence') f.db.evidenceRecords[0].exactQuote = 'Changed evidence';
    if (change === 'paper') f.db.versionManifests[0].coreJson = { ...core, problem: 'Changed understanding' };
    if (change === 'lineage') f.db.claimNodes[0].provenance.sourceTaskId = id(999);
    await expect(markTaskProgress(f.deps as never, { taskId: f.owner.id, expectedExecutionAttempt: 1, status: 'succeeded', result })).rejects.toThrow();
    expect(f.owner.status).toBe('running'); expect(f.db.presentationAssets[0].status).toBe('draft');
  });
});
