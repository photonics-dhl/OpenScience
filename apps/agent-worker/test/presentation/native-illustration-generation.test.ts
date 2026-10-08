import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../../../../packages/domain/test/helpers/fakes';
import { createAgentSession, submitAgentTask, markTaskProgress } from '../../../../packages/domain/src/agent/agent';
import { getHermesResearchRun, reconcileHermesResearchRuns, retryHermesGeneration } from '../../../../packages/domain/src/agent/research-run';
import { serializeDocumentSourceMap, createBlockSourceLocator, readNativeAgentExecution } from '@openscience/domain';
import { AiGateway, AnthropicCompatProvider } from '@openscience/ai-gateway';
import { createPresentationGenerationHandler } from '../../src/presentation/handler';
import * as scenePlanning from '../../src/presentation/scene-image';
import type { runHostedNativeTask } from '../../src/native-agent/host-task';

// Only the operating-system Agent process is replaced. The actual gateway, private store,
// task CAS, source resolution, materializers, handler and asset transaction run below.
vi.mock('../../src/native-agent/host-task', () => ({ runHostedNativeTask: async (input: Parameters<typeof runHostedNativeTask>[0]) => {
  const tools = [...['skills_list', 'skill_view'].map(name => ({ name, description: name, parameters: { type: 'object', properties: {} } })), ...input.config.sourceTools];
  const messages: Array<Record<string, unknown>> = [{ role: 'system', content: input.config.instructions }, { role: 'user', content: input.config.goal }];
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

async function fixture(automaticRun = false, nativeVideo = false) {
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
  const putObject = vi.fn(async (key: string, body: Uint8Array) => { const data = Buffer.from(body); objects.set(key, data); return { key, size: data.length }; });
  const deps = { prisma, redis: { lpush: vi.fn(async () => 1) }, mailer: {} as never,
    audit: { record: async (event: Record<string, unknown>) => void await prisma.auditLog.create({ data: event }) },
    nativeAgentRuntime: { runtimeId: 'installed-fixture', skillCatalogueId: 'fixture-catalogue', model: 'MiniMax-M3' },
    storage: { putObject, headObject: async (key: string) => objects.has(key) ? { key, size: objects.get(key)!.length } : null,
      getObject: async (key: string) => { const data = objects.get(key); if (!data) throw new Error('Missing fixture object'); return { body: Readable.from([data]), size: data.length }; } } };
  const session = await createAgentSession(deps as never, { userId: id(1), researchObjectId: id(3), kind: 'visualization' });
  let payload = { schemaVersion: 1, researchObjectId: id(3), versionId: id(4), kind: 'interactive_html', sourceClaimIds: [id(5)],
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
      scenes: Array.from({ length: 3 }, () => ({ layout: 'Place label 0 above subject 0.', treatment: 'Crisp ink on plain white paper.' })) };
    return new Response(JSON.stringify({ model: 'MiniMax-M3', content: step ? [{ type: 'tool_use', id: step[0], name: step[1], input }]
      : [{ type: 'text', text: '{"reviewToolCallId":"review"}' }], stop_reason: step ? 'tool_use' : 'end_turn', usage: { input_tokens: 20, output_tokens: 20 } }));
  });
  const gateway = new AiGateway({ providers: [new AnthropicCompatProvider('minimax-key-1-model-1', { baseUrl: 'https://offline.invalid', apiKey: 'fixture', model: 'MiniMax-M3' }, fetcher)] });
  const oldPlan = vi.spyOn(gateway, 'completeStructured'), oldReview = vi.spyOn(gateway, 'reviewScientific'), generate = vi.spyOn(gateway, 'generateImage');
  const handler = createPresentationGenerationHandler({ gateway, nativeAgent: { gateway, inboxRoot: '/unused-test-socket', renderPages: async () => [] } });
  const task = () => ({ id: owner.id, payload, executionAttempt: owner.executionAttempt, retryCount: 0 });
  const resume = vi.spyOn(gateway, 'resumeImageFromCompletedResult');
  const canResume = vi.spyOn(gateway, 'canResumeImageFromCompletedResult');
  return { deps, db, owner, task, handler, fetcher, oldPlan, oldReview, generate, resume, canResume, submit, putObject, transactionError: () => transactionError };
}

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

describe('ordinary-user native illustration through real task/store/asset boundaries', () => {
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

  it('offers completed native image recovery and reuses the same task, review state and reservation across lost-response replay', async () => {
    const f = await failedNativeImage();
    const before = { tasks: f.db.agentTasks.length, ledger: f.db.usageLedger.length, result: structuredClone(f.image.result) };
    expect(await getHermesResearchRun(f.deps as never, f.input)).toMatchObject({ canRetryGeneration: true, chargeableAttempts: 0, generationRecovery: 'image-render' });
    await retryHermesGeneration(f.deps as never, f.input);
    expect(f.image).toMatchObject({ status: 'pending', retryCount: 1, result: before.result });
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
    expect(images[0].result).toEqual({ nativeImageReview: { mode: 'model-native', state: 'not_started' } });
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
