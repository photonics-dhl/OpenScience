import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../../../../packages/domain/test/helpers/fakes';
import { claimAgentTask, createAgentSession, getAgentTask, markTaskProgress, retryAgentTask, submitAgentTask } from '../../../../packages/domain/src/agent/agent';
import { requireSceneImageParent, prepareAgentNativeImageReview, readNativeAgentExecution, presentationClaimContent } from '@openscience/domain';
import { AiGateway, AnthropicCompatProvider, NATIVE_IMAGE_REQUEST_MAX_BYTES, type ScienceReviewInput } from '@openscience/ai-gateway';
import { createNativeAgentSession, type NativeAgentSessionState, type NativeAgentSessionStore } from '../../src/native-agent/session';
import { createNativeTaskStore } from '../../src/native-agent/task-store';
import * as nativeHost from '../../src/native-agent/host-task';
import { NATIVE_IMAGE_REVIEW_TOOLS, validateNativeImageReviewHistory } from '../../src/native-agent/illustration-task';
import { createNativeImageReviewSubmission } from '../../src/index';
import { createPresentationGenerationHandler, requireIllustrationReviewSubmission } from '../../src/presentation/handler';
import { generatedImageReviewAttachment } from '../../src/presentation/generated-image-review';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/QWQAAAAASUVORK5CYII=', 'base64');
// Exact untagged final text only: no private thinking or task identity.
const LEGACY_INVALID_FINAL = "{\"decision\":\"accepted\",\"summary\":\"图像忠实地对应已批准分镜：单一暖白纸面（one ground）、水平单行贯通布局，中心波形以同一条暗靛蓝正弦曲线作为唯一焦点贯通左右两侧，明示同一类光子准粒子同时承担两端过程，符合\"禁止两侧使用不同物理对象\"的约束。左端\"自由电子 e⁻\"带方向箭头轨迹，下方次级标注\"PINEM · 切伦科夫 · EELS\"；右端\"束缚电子\"以双能级（两横线+纵向双箭头）置于金纳米立方体-金膜轮廓之间，下方次级标注\"自发辐射 · 强耦合\"与\"金纳米立方/金膜间隙\"；中线下方准确写出算符 f, f† 与响应 ε, μ。9 个批准标签字符级核对全部一致：f 后为正确 † 剑号、ε 与 μ 为斜体希腊字母、e⁻ 含上标负号、MQED / PINEM / EELS 拉丁字母顺序正确。颜色仅用作单一语义（波形深靛），金色仅赋予金纳米腔，背景纯白无面板/框线，符合 article:minimal 与\"one focal point\"。无定量曲线、无自由电子-新极化激元等未经原文报告的物理关系；\"金纳米立方/金膜间隙\"仅以一行文字标注代表算例，未添加额外数值或图。可选改进：右上角有一个微小的孤立墨渍，不在任何标签或关系路径上，不影响阅读，留作下次清理。\",\"summary\":\"本图像通过像素级核对：单一焦点波形贯通左右、9 个批准标签字符全部正确、双能级与金纳米立方/膜间隙几何一致、颜色单一语义、无定量曲线或新增物理关系，约束与原作主张忠实。无阻塞缺陷。右上角有微小孤立墨渍，不在阅读路径上，不构成阻塞，仅作可选清理建议。\",\"repairInstruction\":null}";
afterEach(() => vi.restoreAllMocks());

async function fixture(native = false, toolFinal = false) {
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
  // These existing controls represent already-created legacy tasks, not new-policy producer defaults.
  if (native && !toolFinal) delete owner.result.nativeAgentExecution.imageResultPolicy;
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
    retryCount: db.agentTasks.find(value => value.id === owner.id)!.retryCount, payload }) as never;
  return { prisma, db, deps, handler, task, owner, fetcher, generateImage, parent, asset, runtime, gateway, evidenceIdentity, approvedParent };
}

// Persist a real two-turn image-role SDK history; only the remote HTTP boundary is mocked.
async function paidAgentFinal(options: { toolFinal?: boolean; crashBeforeFinal?: boolean; decision?: 'accepted' | 'blocked';
  revokeBeforeFinal?: 'membership' | 'parent' | 'source' | 'lease'; loggerFailure?: 'info' | 'audit-error';
  wireResponse?: Buffer; expectInvalid?: boolean; legacyText?: string } = {}) {
  const f = await fixture(true, options.toolFinal);
  const identity = { requestId: f.owner.id, contentHash: sha(bytes), sourceEvidenceIdentity: f.evidenceIdentity, parentIdentity: f.approvedParent.identity };
  const envelope = await f.prisma.$transaction(tx => prepareAgentNativeImageReview(tx, { taskId: f.owner.id, executionAttempt: 1,
    identity, runtime: f.runtime, target: f.gateway.resolveNativeImageReviewTarget(), maxInputBytes: NATIVE_IMAGE_REQUEST_MAX_BYTES }));
  const request: ScienceReviewInput = { requestId: f.owner.id, prompt: 'Check the shown field direction against its approved source.',
    authorizationContext: { taskId: f.owner.id, actorId: id(1), workspaceId: id(2) },
    illustrationContext: { imageReviewMode: 'agent-native', executionAttempt: 1, baseIdentity: identity.parentIdentity,
      claimContent: presentationClaimContent(f.db.claimNodes as never) },
    source: { kind: 'illustration-image', researchObjectId: id(3), versionId: id(4), candidateHash: identity.contentHash,
      sourceEvidenceIdentity: identity.sourceEvidenceIdentity },
    attachments: [generatedImageReviewAttachment(bytes, identity.contentHash, 'image/png')] };
  let state: NativeAgentSessionState | null = null; let calls = 0;
  const answer = options.legacyText ?? JSON.stringify({ decision: options.decision ?? 'accepted', summary: 'The actual field arrow points along x.', repairInstruction: null });
  const provider = new AnthropicCompatProvider(envelope.provider, { apiKey: 'fixture', baseUrl: 'https://offline.invalid', model: envelope.model },
    async () => { calls++;
      if (calls === 2) {
        if (options.revokeBeforeFinal === 'membership') f.db.memberships[0].role = 'viewer';
        if (options.revokeBeforeFinal === 'parent') f.parent.contentHash = 'e'.repeat(64);
        if (options.revokeBeforeFinal === 'source') f.db.evidenceRecords[0].exactQuote = 'Changed while model ran';
        if (options.revokeBeforeFinal === 'lease') f.db.agentTasks[0].executionAttempt = 2;
        if (options.wireResponse) return new Response(options.wireResponse, { status: 200 });
      }
      return new Response(JSON.stringify({ model: envelope.model,
      content: calls === 1 ? [{ type: 'tool_use', id: 'skill-1', name: 'skill_view', input: { name: 'openscience-source-review' } },
        { type: 'tool_use', id: 'view-1', name: 'paper_image_view', input: {} }] : options.toolFinal
        ? [{ type: 'tool_use', id: 'result-1', name: 'image_review_result', input: JSON.parse(answer) }] : [{ type: 'text', text: answer }],
      stop_reason: calls === 1 || options.toolFinal ? 'tool_use' : 'end_turn', usage: { input_tokens: 10, output_tokens: 10 } })); });
  const memoryStore = { read: async () => state, compareAndSet: async (_old: unknown, next: NativeAgentSessionState) => { state = structuredClone(next); },
    complete: async (_old: unknown, next: NativeAgentSessionState) => { state = structuredClone(next); }, publish: async <T>(_old: unknown, submit: () => Promise<T>) => submit() };
  const objects = new Map<string, Buffer>();
  if (options.toolFinal) Object.assign(f.deps.storage, {
    getObject: async (key: string) => { const body = objects.get(key) ?? bytes; return { size: body.length, body: Readable.from([body]) }; },
    headObject: async (key: string) => objects.has(key) ? { size: objects.get(key)!.length } : null,
    putObject: async (key: string, body: Uint8Array) => { objects.set(key, Buffer.from(body)); },
  });
  const authorize = (tx: Parameters<typeof requireIllustrationReviewSubmission>[0]) => requireIllustrationReviewSubmission(tx, request);
  const store: NativeAgentSessionStore = options.toolFinal ? createNativeTaskStore({ ...f.deps, taskId: f.owner.id, executionAttempt: 1,
    execution: readNativeAgentExecution(f.owner.result)!, storage: f.deps.storage as never, authorize, authorizeFinal: authorize }) : memoryStore;
  if (options.crashBeforeFinal) {
    const finalize = store.finalize;
    if (!finalize) throw new Error('Fixture requires the real pure-final store');
    let failOnce = true;
    store.finalize = async (previous, next) => {
      if (failOnce) { failOnce = false; throw new Error('Temporary database write conflict'); }
      return finalize(previous, next);
    };
  }
  const binding = { taskId: f.owner.id, sourceKind: 'illustration-image' as const, imageReview: envelope, runtimeId: envelope.runtimeId,
    skillCatalogueId: envelope.skillCatalogueId, model: envelope.model, allowedTools: ['skills_list', 'skill_view', 'paper_image_view'],
    maxTurns: envelope.maxTurns, maxOutputTokens: envelope.maxOutputTokens, maxTotalOutputTokens: envelope.maxTotalOutputTokens,
    maxInputBytes: envelope.maxInputBytes, deadlineAt: envelope.deadlineAt, contextWindowTokens: 512000,
    generation: { thinking: 'adaptive' as const, temperature: 0.1 } };
  const session = createNativeAgentSession({ gateway: new AiGateway({ providers: [provider], illustrationReviewPolicy: async () => true,
    authorizeIllustrationReview: async () => undefined,
    ...(options.loggerFailure ? {
      audit: { record: async () => { if (calls === 2 && options.loggerFailure === 'audit-error') throw new Error('Audit failed'); } },
      logger: { warn: () => undefined, info: () => { if (calls === 2 && options.loggerFailure === 'info') throw new Error('Logger info failed'); },
        error: () => { if (calls === 2 && options.loggerFailure === 'audit-error') throw new Error('Logger error failed'); } },
    } : {}),
  }), binding, store, authorize: async () => undefined, imageReviewInput: request,
    validateImageHistory: (messages, final) => validateNativeImageReviewHistory(messages, identity, final) });
  const tools = [{ name: 'skills_list', description: 'List methods.', parameters: { type: 'object', properties: {} } },
    { name: 'skill_view', description: 'Read a method.', parameters: { type: 'object', properties: {} } }, ...NATIVE_IMAGE_REVIEW_TOOLS];
  const sdk = { model: envelope.model, max_tokens: 32768, tools: tools.map(tool => ({ type: 'function', function: tool })),
    messages: [{ role: 'system', content: 'Read-only check.' }, { role: 'user', content: request.prompt }] };
  const first = await session.complete(sdk) as { choices: Array<{ message: unknown }> };
  const finish = session.complete({ ...sdk, messages: [...sdk.messages, first.choices[0]!.message,
    { role: 'tool', tool_call_id: 'skill-1', content: JSON.stringify({ success: true, content: 'Fixed source-review method.' }) },
    { role: 'tool', tool_call_id: 'view-1', content: JSON.stringify({ status: 'image_view_ready', ...identity }) },
    { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` } }] }] });
  if (options.crashBeforeFinal) await expect(finish).rejects.toThrow('Temporary database write conflict');
  else if (options.revokeBeforeFinal || options.expectInvalid) await expect(finish).rejects.toThrow();
  else await finish;
  const history = await store.read(); const last = history!.turns.at(-1)!;
  if (last.state !== 'completed' && !(options.expectInvalid && last.state === 'received')) throw new Error('fixture must contain a final paid turn');
  if (options.toolFinal) return { ...f, envelope, calls: () => calls, objects };
  if (last.state !== 'completed') throw new Error('legacy fixture requires a decoded final');
  const serialized = Buffer.from(JSON.stringify(history)); const hash = sha(serialized); const objectKey = `derived/native-agent/${hash}.json`;
  f.owner.result.nativeAgentExecution.checkpoint = { taskId: f.owner.id, sourceKind: 'illustration-image', imageIdentity: identity,
    objectKey, serializedSha256: hash, size: serialized.length, executionAttempt: 1, turnCount: history!.turns.length,
    state: 'completed', target: last.target, responseHash: sha(last.response.text), finishReason: last.response.finishReason, hasToolCalls: false };
  f.deps.storage.getObject = async (key?: string) => { const body = key === objectKey ? serialized : bytes; return { body: Readable.from([body]), size: body.length }; };
  return { ...f, envelope, calls: () => calls, objects };
}

describe('real Worker native image review persistence and replay', () => {
  it('keeps the exact historical716 invalid final untagged, invalid and ineligible without another paid call', async () => {
    expect(LEGACY_INVALID_FINAL.length).toBe(716);
    expect(sha(LEGACY_INVALID_FINAL)).toBe('b10688c0b13ac2a0359e9b204b464af601eeb17ccc515434b5e7e54ce4e8d895');
    const f = await paidAgentFinal({ legacyText: LEGACY_INVALID_FINAL });
    const original = structuredClone(f.db.agentTasks[0].result.nativeAgentExecution);
    const ledger = structuredClone(f.db.usageLedger);
    let failure: unknown;
    try { await f.handler(f.deps as never, f.task()); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(SyntaxError);
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, status: 'failed', error: (failure as Error).message });
    expect((await getAgentTask(f.deps as never, { userId: id(1), taskId: f.owner.id })).canRetry).toBe(false);
    const retained = f.db.agentTasks[0].result.nativeAgentExecution;
    expect(retained).toEqual(original); expect(retained.imageResultPolicy).toBeUndefined();
    expect(retained.checkpoint.responseHash).toBe(sha(LEGACY_INVALID_FINAL));
    expect(f.db.presentationAssets.find(row => row.id === f.owner.id)!.provenance.imageReview).toBeUndefined();
    expect(f.db.usageLedger).toEqual(ledger); expect(f.calls()).toBe(2);
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
  });
  it('retains unsafe aggregate token usage as raw paid evidence without deriving or adopting a final', async () => {
    const body = Buffer.from(JSON.stringify({ model: 'MiniMax-M3', content: [{ type: 'tool_use', id: 'r1', name: 'image_review_result',
      input: { decision: 'accepted', summary: 'Fixture only.', repairInstruction: null } }], stop_reason: 'tool_use',
      usage: { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 } }));
    const f = await paidAgentFinal({ toolFinal: true, wireResponse: body, expectInvalid: true });
    const cp = f.db.agentTasks[0].result.nativeAgentExecution.checkpoint;
    expect(cp).toMatchObject({ received: 'decoded', finishReason: 'other', hasToolCalls: true });
    expect(cp.validatedFinal).toBeUndefined();
    const raw = JSON.parse(f.objects.get(cp.objectKey)!.toString('utf8'));
    expect(raw.turns.at(-1).received.body).toBe(body.toString('utf8'));
    expect(raw.turns.at(-1).response.usage).toEqual({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1 });
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow(/terminal image result/);
    expect(f.db.presentationAssets.find(row => row.id === f.owner.id)!.provenance.imageReview).toBeUndefined();
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
  });
  it('saves original invalid UTF-8 bytes as raw-only and never turns replacement text into an accepted review', async () => {
    const body = Buffer.concat([Buffer.from('{"model":"MiniMax-M3","content":[{"type":"tool_use","id":"r1","name":"image_review_result","input":{"decision":"accepted","summary":"'),
      Buffer.from([0xff]), Buffer.from('","repairInstruction":null}}],"stop_reason":"tool_use","usage":{"input_tokens":1,"output_tokens":1}}')]);
    const f = await paidAgentFinal({ toolFinal: true, wireResponse: body, expectInvalid: true });
    const cp = f.db.agentTasks[0].result.nativeAgentExecution.checkpoint;
    expect(cp).toMatchObject({ state: 'completed', received: 'raw-only' });
    expect(cp.validatedFinal).toBeUndefined(); expect(cp.responseHash).toBeUndefined();
    const raw = JSON.parse(f.objects.get(cp.objectKey)!.toString('utf8'));
    expect(raw.turns.at(-1)).toMatchObject({ state: 'received', received: { body: '', rawBodyBase64: body.toString('base64') } });
    expect(raw.turns.at(-1)).not.toHaveProperty('response');
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow(/terminal image receipt/);
    expect(f.db.presentationAssets.find(row => row.id === f.owner.id)!.provenance.imageReview).toBeUndefined();
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
  });
  it('preserves an explicitly encoded legitimate U+FFFD character through raw receipt, derived JSON and adoption', async () => {
    const summary = 'A legitimate \uFFFD character supplied by the fixture.';
    const body = Buffer.from(JSON.stringify({ model: 'MiniMax-M3', content: [{ type: 'tool_use', id: 'r1', name: 'image_review_result',
      input: { decision: 'accepted', summary, repairInstruction: null } }], stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1 } }));
    const f = await paidAgentFinal({ toolFinal: true, wireResponse: body });
    const result = await f.handler(f.deps as never, f.task());
    expect(result).toMatchObject({ imageReview: { decision: 'accepted', summary } });
    const cp = f.db.agentTasks[0].result.nativeAgentExecution.checkpoint;
    const raw = JSON.parse(f.objects.get(`derived/native-agent/${cp.validatedFinal.rawCheckpoint}.json`)!.toString('utf8'));
    expect(raw.turns.at(-1).received.body).toBe(body.toString('utf8'));
    expect(raw.turns.at(-1).received).not.toHaveProperty('rawBodyBase64');
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
  });
  it.each(['info', 'audit-error'] as const)('durably saves paid raw bytes through real Worker store despite %s observability failure', async loggerFailure => {
    const f = await paidAgentFinal({ toolFinal: true, loggerFailure });
    const cp = f.db.agentTasks[0].result.nativeAgentExecution.checkpoint;
    expect(cp).toMatchObject({ received: 'decoded', finishReason: 'other', responseHash: sha(''), hasToolCalls: true });
    expect(f.objects.has(`derived/native-agent/${cp.validatedFinal.rawCheckpoint}.json`)).toBe(true);
    const raw = JSON.parse(f.objects.get(`derived/native-agent/${cp.validatedFinal.rawCheckpoint}.json`)!.toString('utf8'));
    expect(raw.turns.at(-1).received.body).toContain('image_review_result');
    expect(raw.turns.at(-1).received.decoded.providerStopReason).toBe('tool_use');
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
  });
  it.each(['accepted', 'blocked'] as const)('adopts a tagged %s final through the real store, handler and Domain CAS with no new model/image', async decision => {
    const f = await paidAgentFinal({ toolFinal: true, decision });
    const ledger = structuredClone(f.db.usageLedger);
    const cp = f.db.agentTasks.find(row => row.id === f.owner.id)!.result.nativeAgentExecution.checkpoint;
    expect(cp).toMatchObject({ received: 'decoded', finishReason: 'other', hasToolCalls: true,
      responseHash: sha(''), validatedFinal: { policy: 'image-review-tool-final-v1', turnOrdinal: 1 } });
    expect(f.objects.has(`derived/native-agent/${cp.validatedFinal.rawCheckpoint}.json`)).toBe(true);
    vi.spyOn(Date, 'now').mockReturnValue(f.envelope.deadlineAt + 1);
    const result = await f.handler(f.deps as never, f.task());
    expect(result).toMatchObject({ imageReview: { decision, responseHash: cp.validatedFinal.responseHash } });
    expect(f.db.presentationAssets.find(row => row.id === f.owner.id)!.provenance.imageReview.decision).toBe(decision);
    expect(await f.handler(f.deps as never, f.task())).toEqual(result);
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
    expect(f.db.usageLedger).toEqual(ledger);
  });
  it('recovers CP-R after a failed pure-final CAS through retry, handler and original task after deadline', async () => {
    const f = await paidAgentFinal({ toolFinal: true, crashBeforeFinal: true });
    const ledger = structuredClone(f.db.usageLedger);
    expect(f.db.agentTasks[0].result.nativeAgentExecution.checkpoint.validatedFinal).toBeUndefined();
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, status: 'failed', error: 'Temporary database write conflict' });
    expect((await getAgentTask(f.deps as never, { userId: id(1), taskId: f.owner.id })).canRetry).toBe(true);
    await retryAgentTask(f.deps as never, { userId: id(1), taskId: f.owner.id }); await claimAgentTask(f.deps as never, f.owner.id);
    vi.spyOn(Date, 'now').mockReturnValue(f.envelope.deadlineAt + 1);
    const result = await f.handler(f.deps as never, f.task());
    expect(result).toMatchObject({ imageReview: { decision: 'accepted' } });
    expect(f.db.agentTasks[0].result.nativeAgentExecution.checkpoint.validatedFinal).toBeDefined();
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
    expect(f.db.usageLedger).toEqual(ledger);
  });
  it.each(['missing-reference', 'missing-object'] as const)('hard-stops a rearmed tagged task with %s before a fully configured Host or Gateway', async change => {
    const f = await paidAgentFinal({ toolFinal: true });
    f.db.agentTasks[0].executionAttempt = 2;
    if (change === 'missing-reference') delete f.db.agentTasks[0].result.nativeAgentExecution.checkpoint;
    else f.objects.clear();
    const host = vi.spyOn(nativeHost, 'runHostedNativeTask').mockRejectedValue(new Error('HOST MUST NOT START'));
    const handler = createPresentationGenerationHandler({ gateway: f.gateway,
      nativeAgent: { gateway: f.gateway, runtime: f.runtime, inboxRoot: 'tmp/first-image/never-open-host',
        renderPages: async () => { throw new Error('PDF renderer must not run for image recovery'); } } });
    await expect(handler(f.deps as never, f.task())).rejects.toThrow(change === 'missing-reference' ? /deterministic/ : /checkpoint/);
    expect(host).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
    expect(f.calls()).toBe(2);
  });
  it.each(['membership', 'parent', 'source'] as const)('refuses pure CP-R recovery after %s changes, preserving raw evidence', async change => {
    const f = await paidAgentFinal({ toolFinal: true, crashBeforeFinal: true });
    const before = structuredClone(f.db.agentTasks[0].result.nativeAgentExecution.checkpoint);
    if (change === 'membership') f.db.memberships[0].role = 'viewer';
    if (change === 'parent') f.parent.contentHash = 'e'.repeat(64);
    if (change === 'source') f.db.evidenceRecords[0].exactQuote = 'Changed evidence';
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow();
    expect(f.db.agentTasks[0].result.nativeAgentExecution.checkpoint).toEqual(before);
    expect(f.db.presentationAssets.find(row => row.id === f.owner.id)!.provenance.imageReview).toBeUndefined();
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
  });
  it('rolls back tagged image adoption and replays the same derived proof after a lost final CAS', async () => {
    const f = await paidAgentFinal({ toolFinal: true });
    const checkpoint = structuredClone(f.db.agentTasks[0].result.nativeAgentExecution.checkpoint);
    const updateMany = vi.spyOn(f.prisma.agentTask, 'updateMany').mockResolvedValueOnce({ count: 0 });
    await expect(f.handler(f.deps as never, f.task())).rejects.toThrow();
    expect(f.db.presentationAssets.find(row => row.id === f.owner.id)!.provenance.imageReview).toBeUndefined();
    expect(f.db.agentTasks[0].result.nativeAgentExecution.checkpoint).toEqual(checkpoint);
    updateMany.mockRestore();
    expect(await f.handler(f.deps as never, f.task())).toMatchObject({ imageReview: { decision: 'accepted' } });
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
  });
  it.each(['membership', 'parent', 'source', 'lease'] as const)('keeps paid CP-R but refuses finalization when %s changes during HTTP', async change => {
    const f = await paidAgentFinal({ toolFinal: true, revokeBeforeFinal: change });
    const cp = f.db.agentTasks[0].result.nativeAgentExecution.checkpoint;
    expect(cp).toMatchObject({ state: 'completed', received: 'decoded', finishReason: 'other', hasToolCalls: true });
    expect(cp.validatedFinal).toBeUndefined(); expect(f.objects.has(cp.objectKey)).toBe(true);
    expect(f.db.presentationAssets.find(row => row.id === f.owner.id)!.provenance.imageReview).toBeUndefined();
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
  });
  it('retries a failed paid final through the public API and actually materializes it with zero additional provider calls', async () => {
    const f = await paidAgentFinal(); const ledger = structuredClone(f.db.usageLedger);
    await markTaskProgress(f.deps as never, { taskId: f.owner.id, status: 'failed', error: 'Temporary database write conflict' });
    expect((await getAgentTask(f.deps as never, { userId: id(1), taskId: f.owner.id })).canRetry).toBe(true);
    await retryAgentTask(f.deps as never, { userId: id(1), taskId: f.owner.id }); await claimAgentTask(f.deps as never, f.owner.id);
    const result = await f.handler(f.deps as never, f.task());
    await expect(markTaskProgress(f.deps as never, { taskId: f.owner.id, status: 'succeeded',
      expectedExecutionAttempt: f.db.agentTasks.find(value => value.id === f.owner.id)!.executionAttempt, result })).resolves.toMatchObject({ status: 'succeeded' });
    expect(f.calls()).toBe(2); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.generateImage).not.toHaveBeenCalled();
    expect(f.db.usageLedger).toEqual(ledger);
  });
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
