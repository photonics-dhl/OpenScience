import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../../../../packages/domain/test/helpers/fakes';
import { createAgentSession, submitAgentTask } from '../../../../packages/domain/src/agent/agent';
import { requireSceneImageParent, prepareAgentNativeImageReview } from '@openscience/domain';
import { AiGateway, AnthropicCompatProvider, NATIVE_IMAGE_REQUEST_MAX_BYTES, type ScienceReviewInput } from '@openscience/ai-gateway';
import { createNativeAgentSession, type NativeAgentSessionState } from '../../src/native-agent/session';
import { NATIVE_IMAGE_REVIEW_TOOLS } from '../../src/native-agent/illustration-task';
import { createNativeImageReviewSubmission } from '../../src/index';
import { createPresentationGenerationHandler, requireIllustrationReviewSubmission } from '../../src/presentation/handler';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/QWQAAAAASUVORK5CYII=', 'base64');
afterEach(() => vi.restoreAllMocks());

async function fixture(native = false) {
  const { prisma, db } = createFakePrisma();
  seedUser(db, { id: id(1), platformRole: 'platform_admin' });
  db.workspaces.push({ id: id(2), status: 'active' });
  db.memberships.push({ id: 'membership', userId: id(1), workspaceId: id(2), role: 'owner' });
  db.researchObjects.push({ id: id(3), workspaceId: id(2), createdBy: id(1), status: 'draft', visibility: 'private' });
  db.commits.push({ id: id(9), branchId: id(10) });
  db.versions.push({ id: id(4), researchObjectId: id(3), status: 'draft', versionNo: 1, commitId: id(9), publicVersionId: null, createdAt: new Date() });
  db.claimNodes.push({ id: id(5), researchObjectId: id(3), versionId: id(4), kind: 'core', statement: 'The field points along x.',
    assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded' });
  const evidence = { id: id(6), claimId: id(5), researchObjectId: id(3), versionId: id(4), artifactId: id(7), contentHash: 'a'.repeat(64),
    exactQuote: 'The field points along x.', relation: 'supports', locator: { page: 1 }, extractionStatus: 'succeeded', updatedAt: new Date(), provenance: {} };
  db.evidenceRecords.push(evidence);
  db.artifacts.push({ id: id(7), workspaceId: id(2), blobSha256: 'a'.repeat(64), deletedAt: null, bytesPurgedAt: null });
  const { id: evidenceId, claimId, artifactId, contentHash, exactQuote, relation, locator, extractionStatus, updatedAt, provenance } = evidence;
  const evidenceIdentity = sha(JSON.stringify([{ id: evidenceId, claimId, artifactId, contentHash, exactQuote, relation, locator, extractionStatus, updatedAt, provenance }]));
  const parent = { id: id(8), researchObjectId: id(3), versionId: id(4), kind: 'interactive_html', status: 'approved', contentHash: 'c'.repeat(64),
    provenance: { subtype: 'sourced_storyboard', sourceEvidenceIdentity: evidenceIdentity,
      storyboardSettings: { locale: 'en', style: 'ink', instruction: 'Explain the field.', output: 'image' },
      storyboardDocument: { schemaVersion: 1, title: 'Field', scenes: [{ title: 'Field direction', narration: 'The field points along x.',
        visualAction: 'One arrow along x.', sourceClaimIds: [id(5)] }] } } };
  db.presentationAssets.push(parent); db.presentationAssetClaims.push({ presentationAssetId: id(8), claimId: id(5) });
  const runtime = { runtimeId: 'native-installed', skillCatalogueId: 'catalogue-installed', model: 'MiniMax-M3' };
  const deps = { prisma, redis: { lpush: async () => 1 }, mailer: {} as never,
    ...(native ? { nativeAgentRuntime: runtime } : {}),
    storage: { getObject: async () => ({ body: Readable.from([bytes]), size: bytes.length }) } };
  const session = await createAgentSession(deps as never, { userId: id(1), researchObjectId: id(3), kind: 'visualization' });
  const payload = { schemaVersion: 1, researchObjectId: id(3), versionId: id(4), kind: 'image', sourceClaimIds: [id(5)],
    sceneImage: { storyboardAssetId: id(8), sceneIndex: 0 } };
  const submitted = await submitAgentTask(deps as never, { userId: id(1), sessionId: session.id, kind: 'presentation.generate', payload,
    idempotencyKey: 'native-review', dispatch: false });
  const owner = db.agentTasks.find(task => task.id === submitted.id)!; Object.assign(owner, { status: 'running', executionAttempt: 1 });
  const approvedParent = (await requireSceneImageParent(prisma, payload as never))!;
  const asset = { id: owner.id, researchObjectId: id(3), versionId: id(4), kind: 'image', status: 'draft', objectKey: 'saved.png', contentHash: sha(bytes),
    provenance: { source: 'approved_storyboard_scene', subtype: 'storyboard_scene_image', taskId: owner.id, contentType: 'image/png',
      sceneImage: payload.sceneImage, sourceEvidenceIdentity: evidenceIdentity, parentIdentity: approvedParent.identity } };
  db.presentationAssets.push(asset); db.presentationAssetClaims.push({ presentationAssetId: owner.id, claimId: id(5) });
  // Add only Prisma methods that the shared fake does not provide, retaining its real transaction rollback and CAS.
  prisma.trashEntry = { findFirst: async () => null } as never;
  prisma.agentTask.findUniqueOrThrow = async args => (await prisma.agentTask.findUnique(args))!;
  prisma.presentationAsset.findUniqueOrThrow = async args => (await prisma.presentationAsset.findUnique(args))!;
  prisma.presentationAsset.update = async ({ where, data }) => {
    const row = db.presentationAssets.find(value => value.id === where.id)!; Object.assign(row, data); return row;
  };
  let activeTransactions = 0;
  const transact = prisma.$transaction.bind(prisma);
  prisma.$transaction = (async (...args: Parameters<typeof prisma.$transaction>) => {
    activeTransactions += 1;
    try { return await transact(...args); } finally { activeTransactions -= 1; }
  }) as typeof prisma.$transaction;
  const fetcher = vi.fn(async () => {
    expect(activeTransactions).toBe(0);
    return new Response(JSON.stringify({ model: 'MiniMax-M3', content: [{ type: 'text', text: JSON.stringify({
    decision: 'accepted', summary: 'The actual field arrow points along x.', repairInstruction: null }) }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 });
  });
  const provider = new AnthropicCompatProvider('minimax-key-1-model-1', { apiKey: 'test', baseUrl: 'https://minimax.example', model: 'MiniMax-M3' }, fetcher as never);
  const gateway = new AiGateway({ providers: [provider], illustrationReviewPolicy: async () => true,
    authorizeIllustrationReview: input => requireIllustrationReviewSubmission(prisma, input),
    nativeImageReviewSubmission: createNativeImageReviewSubmission(prisma, () => ({ taskId: owner.id, executionAttempt: owner.executionAttempt })) });
  const generateImage = vi.fn(); Object.assign(gateway, { generateImage });
  const handler = createPresentationGenerationHandler({ gateway });
  const task = () => ({ id: owner.id, executionAttempt: db.agentTasks.find(value => value.id === owner.id)!.executionAttempt,
    retryCount: 0, payload }) as never;
  return { prisma, db, deps, handler, task, owner, fetcher, generateImage, parent, asset, runtime, gateway, evidenceIdentity, approvedParent };
}

// Persist a real two-turn image-role SDK history; only the remote HTTP boundary is mocked.
async function paidAgentFinal() {
  const f = await fixture(true);
  const identity = { requestId: f.owner.id, contentHash: sha(bytes), sourceEvidenceIdentity: f.evidenceIdentity, parentIdentity: f.approvedParent.identity };
  const envelope = await f.prisma.$transaction(tx => prepareAgentNativeImageReview(tx, { taskId: f.owner.id, executionAttempt: 1,
    identity, runtime: f.runtime, target: f.gateway.resolveNativeImageReviewTarget(), maxInputBytes: NATIVE_IMAGE_REQUEST_MAX_BYTES }));
  const request: ScienceReviewInput = { requestId: f.owner.id, prompt: 'Check the shown field direction against its approved source.',
    authorizationContext: { taskId: f.owner.id, actorId: id(1), workspaceId: id(2) },
    illustrationContext: { imageReviewMode: 'agent-native', executionAttempt: 1, baseIdentity: identity.parentIdentity },
    source: { kind: 'illustration-image', researchObjectId: id(3), versionId: id(4), candidateHash: identity.contentHash,
      sourceEvidenceIdentity: identity.sourceEvidenceIdentity },
    attachments: [{ bytes, fileName: 'saved.png', mediaType: 'image/png', pageNumber: 1, width: 1, height: 1, sha256: identity.contentHash }] };
  let state: NativeAgentSessionState | null = null; let calls = 0;
  const answer = JSON.stringify({ decision: 'accepted', summary: 'The actual field arrow points along x.', repairInstruction: null });
  const provider = new AnthropicCompatProvider(envelope.provider, { apiKey: 'fixture', baseUrl: 'https://offline.invalid', model: envelope.model },
    async () => { calls++; return new Response(JSON.stringify({ model: envelope.model,
      content: calls === 1 ? [{ type: 'tool_use', id: 'view-1', name: 'paper_image_view', input: {} }] : [{ type: 'text', text: answer }],
      stop_reason: calls === 1 ? 'tool_use' : 'end_turn', usage: { input_tokens: 10, output_tokens: 10 } })); });
  const store = { read: async () => state, compareAndSet: async (_old: unknown, next: NativeAgentSessionState) => { state = structuredClone(next); },
    complete: async (_old: unknown, next: NativeAgentSessionState) => { state = structuredClone(next); }, publish: async <T>(_old: unknown, submit: () => Promise<T>) => submit() };
  const binding = { taskId: f.owner.id, sourceKind: 'illustration-image' as const, imageReview: envelope, runtimeId: envelope.runtimeId,
    skillCatalogueId: envelope.skillCatalogueId, model: envelope.model, allowedTools: ['skills_list', 'skill_view', 'paper_image_view'],
    maxTurns: envelope.maxTurns, maxOutputTokens: envelope.maxOutputTokens, maxTotalOutputTokens: envelope.maxTotalOutputTokens,
    maxInputBytes: envelope.maxInputBytes, deadlineAt: envelope.deadlineAt, contextWindowTokens: 512000,
    generation: { thinking: 'adaptive' as const, temperature: 0.1 } };
  const session = createNativeAgentSession({ gateway: new AiGateway({ providers: [provider], illustrationReviewPolicy: async () => true,
    authorizeIllustrationReview: async () => undefined }), binding, store, authorize: async () => undefined, imageReviewInput: request });
  const tools = [{ name: 'skills_list', description: 'List methods.', parameters: { type: 'object', properties: {} } },
    { name: 'skill_view', description: 'Read a method.', parameters: { type: 'object', properties: {} } }, ...NATIVE_IMAGE_REVIEW_TOOLS];
  const sdk = { model: envelope.model, max_tokens: 32768, tools: tools.map(tool => ({ type: 'function', function: tool })),
    messages: [{ role: 'system', content: 'Read-only check.' }, { role: 'user', content: request.prompt }] };
  const first = await session.complete(sdk) as { choices: Array<{ message: unknown }> };
  await session.complete({ ...sdk, messages: [...sdk.messages, first.choices[0]!.message,
    { role: 'tool', tool_call_id: 'view-1', content: JSON.stringify({ status: 'image_view_ready', ...identity }) },
    { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` } }] }] });
  const history = await store.read(); const last = history!.turns.at(-1)!;
  if (last.state !== 'completed') throw new Error('fixture must contain a final paid turn');
  const serialized = Buffer.from(JSON.stringify(history)); const hash = sha(serialized); const objectKey = `derived/native-agent/${hash}.json`;
  f.owner.result.nativeAgentExecution.checkpoint = { taskId: f.owner.id, sourceKind: 'illustration-image', imageIdentity: identity,
    objectKey, serializedSha256: hash, size: serialized.length, executionAttempt: 1, turnCount: history!.turns.length,
    state: 'completed', target: last.target, responseHash: sha(last.response.text), finishReason: last.response.finishReason, hasToolCalls: false };
  f.deps.storage.getObject = async (key?: string) => { const body = key === objectKey ? serialized : bytes; return { body: Readable.from([body]), size: body.length }; };
  return { ...f, envelope, calls: () => calls };
}

describe('real Worker native image review persistence and replay', () => {
  it('consumes the actual Agent final with no Host, new provider or extra charge, and replays it', async () => {
    const f = await paidAgentFinal(); const ledgerBefore = structuredClone(f.db.usageLedger);
    expect(f.envelope.parentIdentity.length).toBeGreaterThan(200);
    f.owner.executionAttempt = 2;
    vi.spyOn(Date, 'now').mockReturnValue(f.envelope.deadlineAt + 1);
    const result = await f.handler(f.deps as never, f.task());
    expect(result).toMatchObject({ imageReview: { decision: 'accepted' } });
    const row = f.db.agentTasks.find(value => value.id === f.owner.id)!;
    expect(row.result.nativeImageReview.state).toBe('completed');
    expect(row.result.nativeImageReview.review).toEqual(f.db.presentationAssets.find(value => value.id === f.owner.id)!.provenance.imageReview);
    expect(await f.handler(f.deps as never, f.task())).toEqual(result);
    expect(f.db.usageLedger).toEqual(ledgerBefore); expect(f.calls()).toBe(2);
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
  });

  it('rolls back image adoption together with the Agent completion marker if its final CAS loses', async () => {
    const f = await paidAgentFinal(); const updateMany = f.prisma.agentTask.updateMany;
    f.prisma.agentTask.updateMany = async args => {
      if ((args.data?.result as { nativeImageReview?: { state?: string } })?.nativeImageReview?.state === 'completed') return { count: 0 };
      return updateMany(args);
    };
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow();
    expect(f.db.agentTasks.find(value => value.id === f.owner.id)!.result.nativeImageReview.state).toBe('prepared');
    expect(f.db.presentationAssets.find(value => value.id === f.owner.id)!.provenance.imageReview).toBeUndefined();
    f.prisma.agentTask.updateMany = updateMany;
    expect(await f.handler(f.deps as never, f.task())).toMatchObject({ imageReview: { decision: 'accepted' } });
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('saves the native review with its completed task checkpoint and replays without either paid call', async () => {
    const f = await fixture(); const first = await f.handler(f.deps as never, f.task());
    expect(first).toMatchObject({ imageReview: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', decision: 'accepted' } });
    expect(f.db.agentTasks[0].result.nativeImageReview.state).toBe('completed');
    expect(f.db.agentTasks[0].result.nativeImageReview.review).toEqual(f.asset.provenance.imageReview);
    f.db.agentTasks[0].executionAttempt = 2;
    expect(await f.handler(f.deps as never, f.task())).toEqual(first);
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.generateImage).not.toHaveBeenCalled();
  });

  it('keeps an uncertain started call and refuses resubmission after a Worker crash', async () => {
    const f = await fixture(); f.fetcher.mockRejectedValue(new Error('connection closed after acceptance'));
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow();
    expect(f.db.agentTasks[0].result.nativeImageReview.state).toBe('started');
    f.db.agentTasks[0].executionAttempt = 2;
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow(/another submission is forbidden/);
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.generateImage).not.toHaveBeenCalled();
  });

  it.each(['membership', 'parent', 'source', 'lease'])('stops completion if %s changes while the model runs', async change => {
    const f = await fixture(); const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async () => {
      if (change === 'membership') f.db.memberships[0].role = 'viewer';
      if (change === 'parent') f.parent.contentHash = 'e'.repeat(64);
      if (change === 'source') f.db.evidenceRecords[0].exactQuote = 'Changed evidence';
      if (change === 'lease') f.db.agentTasks[0].executionAttempt = 2;
      return original();
    });
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow();
    expect(f.db.presentationAssets.find(row => row.id === f.owner.id)!.provenance.imageReview).toBeUndefined();
    expect(f.db.agentTasks[0].result.nativeImageReview.state).toBe('started');
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
});
