import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiGateway, AnthropicCompatProvider, type ScienceReviewInput } from '@openscience/ai-gateway';
import type { AgentNativeImageReviewPrepared, NativeAgentImageCheckpointReference } from '@openscience/domain';
import { createNativeAgentSession, finalizeNativeImageReviewState, nativeImageReviewFinal,
  type NativeAgentSessionState } from '../src/native-agent/session';
import { NATIVE_IMAGE_REVIEW_TOOLS, runNativeImageReviewTask, validateNativeImageReviewHistory } from '../src/native-agent/illustration-task';
import { runHostedNativeTask } from '../src/native-agent/host-task';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const pixels = readFileSync(resolve(__dirname, '../../../packages/ai-gateway/test/fixtures/minimax-reference.png'));
const taskId = 'fd319e9b-071f-4adb-a45f-25ebdbd47674';
const tools = [{ name: 'skills_list', description: 'List methods.', parameters: { type: 'object', properties: {} } },
  { name: 'skill_view', description: 'Read a method.', parameters: { type: 'object', properties: {} } }, ...NATIVE_IMAGE_REVIEW_TOOLS];

async function fixture(options: { initialOnly?: boolean; deferInitial?: boolean; firstOutput?: number; firstStatus?: 529;
  doubleView?: boolean; toolsAfterView?: boolean; skillName?: string; skillSuccess?: boolean; runtimeId?: string;
  toolFinal?: boolean; terminalContent?: unknown[]; terminalStop?: string; terminalWire?: string } = {}) {
  const preparedAt = Date.now();
  const envelope: AgentNativeImageReviewPrepared = { mode: 'agent-native', state: 'prepared', preparedAt, deadlineAt: preparedAt + 300000,
    requestId: taskId, contentHash: sha(pixels), sourceEvidenceIdentity: 'b'.repeat(64), parentIdentity: 'approved-parent', executionAttempt: 1,
    runtimeId: options.runtimeId ?? 'installed', skillCatalogueId: 'catalogue', provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', reservationLedgerId: 'original-task-charge',
    maxTurns: 4, maxOutputTokens: 32768, maxTotalOutputTokens: 32768, maxInputBytes: 64000000,
    ...(options.toolFinal ? { imageResultPolicy: 'image-review-tool-final-v1' as const } : {}) };
  const request: ScienceReviewInput = { requestId: taskId, prompt: 'Check the approved direction against the source.',
    authorizationContext: { taskId, actorId: 'actor', workspaceId: 'ws' },
    illustrationContext: { executionAttempt: 1, claimContent: 'same-claims', baseIdentity: envelope.parentIdentity, imageReviewMode: 'agent-native' },
    source: { kind: 'illustration-image', researchObjectId: 'ro', versionId: 'version', candidateHash: envelope.contentHash,
      sourceEvidenceIdentity: envelope.sourceEvidenceIdentity },
    attachments: [{ bytes: pixels, fileName: 'page-1.png', pageNumber: 1, mediaType: 'image/png', width: 1, height: 1, sha256: envelope.contentHash }] };
  let state: NativeAgentSessionState | null = null;
  const answer = JSON.stringify({ decision: 'accepted', summary: 'The shown direction agrees with the approved source.', repairInstruction: null });
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => {
    void _url; void _init;
    if (options.firstStatus && fetcher.mock.calls.length === 1) return new Response('overloaded', { status: options.firstStatus });
    if (options.terminalWire !== undefined && fetcher.mock.calls.length > 1) return new Response(options.terminalWire, { status: 200 });
    return new Response(JSON.stringify({ model: envelope.model, content: fetcher.mock.calls.length === 1
      ? [{ type: 'tool_use', id: 'skill-1', name: 'skill_view', input: { name: options.skillName ?? 'openscience-source-review' } },
        { type: 'tool_use', id: 'view-1', name: 'paper_image_view', input: {} },
        ...(options.doubleView ? [{ type: 'tool_use', id: 'view-2', name: 'paper_image_view', input: {} }] : [])]
      : options.toolsAfterView ? [{ type: 'tool_use', id: 'skill-2', name: 'skill_view', input: { name: 'openscience-source-review' } }]
        : options.terminalContent ?? (options.toolFinal ? [{ type: 'tool_use', id: 'result-1', name: 'image_review_result',
          input: JSON.parse(answer) }] : [{ type: 'text', text: answer }]),
      stop_reason: fetcher.mock.calls.length === 1 || options.toolsAfterView ? 'tool_use' : options.terminalStop ?? (options.toolFinal ? 'tool_use' : 'end_turn'),
      usage: { input_tokens: 20, output_tokens: fetcher.mock.calls.length === 1 ? options.firstOutput ?? 20 : 8 } }));
  });
  const gateway = new AiGateway({ providers: [new AnthropicCompatProvider(envelope.provider,
    { baseUrl: 'https://offline.invalid', apiKey: 'fixture', model: envelope.model }, fetcher)],
    illustrationReviewPolicy: async () => true, authorizeIllustrationReview: async () => undefined });
  const binding = { taskId, sourceKind: 'illustration-image' as const, imageReview: envelope, runtimeId: envelope.runtimeId,
    skillCatalogueId: envelope.skillCatalogueId, model: envelope.model, allowedTools: ['skills_list', 'skill_view', 'paper_image_view'],
    maxTurns: 4, maxOutputTokens: 32768, maxTotalOutputTokens: 32768, maxInputBytes: 64000000, deadlineAt: envelope.deadlineAt,
    contextWindowTokens: 512000, generation: { thinking: 'adaptive' as const, temperature: 0.1 } };
  const memoryStore = { read: async () => state,
    compareAndSet: async (_old: unknown, next: NativeAgentSessionState) => { state = structuredClone(next); },
    complete: async (_old: unknown, next: NativeAgentSessionState) => { state = structuredClone(next); },
    finalize: async (_old: unknown, next: NativeAgentSessionState) => { state = structuredClone(next); },
    publish: async <T>(_state: unknown, submit: () => Promise<T>) => submit() };
  const imageIdentity = { requestId: taskId, contentHash: envelope.contentHash,
    sourceEvidenceIdentity: envelope.sourceEvidenceIdentity, parentIdentity: envelope.parentIdentity };
  const newSession = () => createNativeAgentSession({ gateway, binding, store: memoryStore, authorize: async () => undefined, imageReviewInput: request,
    validateImageHistory: (messages, final) => validateNativeImageReviewHistory(messages, imageIdentity, final) });
  const session = newSession();
  const sdk = { model: envelope.model, max_tokens: 32768, tools: tools.map(tool => ({ type: 'function', function: tool })),
    messages: [{ role: 'system', content: 'Read-only image review.' }, { role: 'user', content: request.prompt }] };
  const first = options.deferInitial ? undefined : await session.complete(sdk) as { choices: Array<{ message: Record<string, unknown> }> };
  const continuation = (message: unknown) => ({ ...sdk, messages: [...sdk.messages, message,
    { role: 'tool', tool_call_id: 'skill-1', content: JSON.stringify({ success: options.skillSuccess ?? true, content: 'Fixed source-review method.' }) },
    { role: 'tool', tool_call_id: 'view-1', content: JSON.stringify({ status: 'image_view_ready', ...imageIdentity }) },
    { role: 'user', content: [{ type: 'text', text: 'Actual saved image.' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${pixels.toString('base64')}` } }] }] });
  if (first && !options.initialOnly) await session.complete(continuation(first.choices[0]!.message));
  const row = { id: taskId, kind: 'presentation.generate', status: 'running', deletedAt: null, executionAttempt: 2,
    result: { nativeImageReview: envelope, nativeAgentExecution: { kind: 'hermes-agent', profile: 'image-review',
      runtimeId: envelope.runtimeId, skillCatalogueId: envelope.skillCatalogueId, model: envelope.model, checkpoint: {} as NativeAgentImageCheckpointReference } } };
  let stored = Buffer.alloc(0);
  const persist = (next: NativeAgentSessionState) => {
    state = next; stored = Buffer.from(JSON.stringify(next)); const last = next.turns.at(-1)!;
    row.result.nativeAgentExecution.checkpoint = { taskId, objectKey: `derived/native-agent/${sha(stored)}.json`, serializedSha256: sha(stored), size: stored.length,
      sourceKind: 'illustration-image', imageIdentity, executionAttempt: 1, turnCount: next.turns.length,
      state: last.state === 'received' ? 'completed' : last.state, target: last.target,
      ...(last.state === 'completed' ? { responseHash: sha(last.response.text), finishReason: last.response.finishReason,
        hasToolCalls: Boolean(last.response.toolCalls?.length) } : {}) };
  };
  if (state) persist(state);
  const prisma = { agentTask: { findUnique: async () => structuredClone(row), findUniqueOrThrow: async () => structuredClone(row) },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma) };
  const storage = { getObject: async () => ({ size: stored.length, body: Readable.from([stored]) }) };
  const authority = vi.fn(async () => undefined);
  const input = () => ({ deps: { prisma, storage } as never, task: { id: taskId, executionAttempt: row.executionAttempt, result: row.result },
    request, envelope, authorize: authority });
  return { envelope, request, row, get state() { return state!; }, persist, authority, gateway, fetcher, input,
    session, newSession, sdk, continuation, binding, store: memoryStore, answer };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('actual image Agent final checkpoint consumer', () => {
  it.each([false, true])('only the persisted tool-final policy reads terminal state before SDK decoding: %s', async toolFinal => {
    const f = await fixture({ toolFinal, deferInitial: true });
    const read = vi.spyOn(f.store, 'read');
    await expect(f.session.complete({})).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(toolFinal ? 1 : 0);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('saves the raw tool-use receipt and projects a separate JSON final without executing the result tool', async () => {
    const f = await fixture({ toolFinal: true, initialOnly: true });
    const state = f.state;
    const first = state.turns[0];
    if (first?.state !== 'completed') throw new Error('initial tool receipt missing');
    const firstMessage = { role: 'assistant', content: first.response.text, tool_calls: first.response.toolCalls,
      reasoning_details: [{ type: 'openscience-provider-content', provider_content: first.response.providerContent }] };
    const response = await f.session.complete(f.continuation(firstMessage));
    expect(response.choices[0]!.finish_reason).toBe('stop');
    expect(response.choices[0]!.message.content).toBe(f.answer);
    expect(response.choices[0]!.message.tool_calls).toBeUndefined();
    expect(response.choices[0]!.message).not.toHaveProperty('reasoning_details');
    const saved = f.state as NativeAgentSessionState & { validatedFinal?: { text: string; responseHash: string } };
    expect(saved.validatedFinal).toMatchObject({ text: f.answer, responseHash: sha(f.answer) });
    expect(saved.turns.at(-1)).toMatchObject({ state: 'completed', received: { status: 200,
      decoded: { finishReason: 'other', providerStopReason: 'tool_use', text: '' } } });
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    await expect(f.session.complete(f.sdk)).rejects.toThrow(/terminal|final|consumed/);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('preserves model-supplied quoted, multiline and padded strings in the structured result', async () => {
    const decision = { decision: 'blocked', summary: '  Source "A"\\B\nneeds a qualifier.  ', repairInstruction: null };
    const f = await fixture({ toolFinal: true, initialOnly: true,
      terminalContent: [{ type: 'tool_use', id: 'result-quoted', name: 'image_review_result', input: decision }] });
    const first = f.state.turns[0];
    if (first?.state !== 'completed') throw new Error('initial receipt missing');
    const response = await f.session.complete(f.continuation({ role: 'assistant', content: first.response.text,
      tool_calls: first.response.toolCalls,
      reasoning_details: [{ type: 'openscience-provider-content', provider_content: first.response.providerContent }] }));
    expect(response.choices[0]!.message.content).toBe(JSON.stringify(decision));
    expect(JSON.parse(response.choices[0]!.message.content)).toEqual(decision);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['wrong tool', [{ type: 'tool_use', id: 'r', name: 'unadvertised', input: {} }]],
    ['duplicate tool', ['a', 'a'].map(id => ({ type: 'tool_use', id, name: 'image_review_result',
      input: { decision: 'accepted', summary: 'Same.', repairInstruction: null } }))],
    ['invalid accepted repair', [{ type: 'tool_use', id: 'r', name: 'image_review_result',
      input: { decision: 'accepted', summary: 'Same.', repairInstruction: 'Change science.' } }]],
    ['mixed text', [{ type: 'text', text: 'Also accept this.' }, { type: 'tool_use', id: 'r', name: 'image_review_result',
      input: { decision: 'blocked', summary: 'Mismatch.', repairInstruction: null } }]],
    ['missing result', [{ type: 'thinking', thinking: 'No conclusion.' }]],
  ] as const)('durably retains %s and never continues or projects it', async (_name, terminalContent) => {
    const f = await fixture({ toolFinal: true, initialOnly: true, terminalContent: [...terminalContent] });
    const first = f.state.turns[0];
    if (first?.state !== 'completed') throw new Error('initial receipt missing');
    await expect(f.session.complete(f.continuation({ role: 'assistant', content: first.response.text,
      tool_calls: first.response.toolCalls,
      reasoning_details: [{ type: 'openscience-provider-content', provider_content: first.response.providerContent }] }))).rejects.toThrow();
    expect(f.state.turns.at(-1)).toHaveProperty('received.body');
    expect(JSON.parse((f.state.turns.at(-1) as { received: { body: string } }).received.body).content).toEqual(terminalContent);
    expect(f.state).not.toHaveProperty('validatedFinal');
    await expect(f.newSession().complete(f.sdk)).rejects.toThrow(/terminal/);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('retains a definitely received undecodable body without fabricating a completion or repeating HTTP', async () => {
    const f = await fixture({ toolFinal: true, initialOnly: true, terminalWire: '{invalid paid body' });
    const first = f.state.turns[0];
    if (first?.state !== 'completed') throw new Error('initial receipt missing');
    await expect(f.session.complete(f.continuation({ role: 'assistant', content: first.response.text,
      tool_calls: first.response.toolCalls,
      reasoning_details: [{ type: 'openscience-provider-content', provider_content: first.response.providerContent }] }))).rejects.toThrow();
    expect(f.state.turns.at(-1)).toMatchObject({ state: 'received', received: { status: 200, body: '{invalid paid body' } });
    expect(f.state.turns.at(-1)).not.toHaveProperty('response');
    await expect(finalizeNativeImageReviewState(f.store, f.state)).rejects.toThrow();
    await expect(f.newSession().complete(f.sdk)).rejects.toThrow(/terminal/);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('recovers a crash after raw receipt persistence by pure finalization only, even after the model deadline', async () => {
    const f = await fixture({ toolFinal: true, initialOnly: true });
    const finalize = vi.spyOn(f.store, 'finalize').mockRejectedValueOnce(new Error('finalization CAS conflict'));
    const first = f.state.turns[0];
    if (first?.state !== 'completed') throw new Error('initial receipt missing');
    await expect(f.session.complete(f.continuation({ role: 'assistant', content: first.response.text,
      tool_calls: first.response.toolCalls,
      reasoning_details: [{ type: 'openscience-provider-content', provider_content: first.response.providerContent }] }))).rejects.toThrow('CAS conflict');
    expect(f.state).not.toHaveProperty('validatedFinal');
    vi.spyOn(Date, 'now').mockReturnValue(f.envelope.deadlineAt + 1);
    const result = await finalizeNativeImageReviewState(f.store, f.state);
    expect(result.validatedFinal?.text).toBe(f.answer);
    expect(finalize).toHaveBeenCalledTimes(2);
    expect(await finalizeNativeImageReviewState(f.store, result)).toEqual(result);
    expect(finalize).toHaveBeenCalledTimes(2); expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['body', 'message', 'target', 'policy', 'derived-text', 'derived-hash', 'raw-link'])('rejects changed %s in a saved derived final', async change => {
    const f = await fixture({ toolFinal: true, initialOnly: true });
    const first = f.state.turns[0];
    if (first?.state !== 'completed') throw new Error('initial receipt missing');
    await f.session.complete(f.continuation({ role: 'assistant', content: first.response.text,
      tool_calls: first.response.toolCalls,
      reasoning_details: [{ type: 'openscience-provider-content', provider_content: first.response.providerContent }] }));
    const state = structuredClone(f.state); const last = state.turns.at(-1)!;
    if (last.state !== 'completed' || !last.received || !state.validatedFinal) throw new Error('final receipt missing');
    if (change === 'body') last.received.body += ' ';
    if (change === 'message') last.request.messages[0]!.content += ' ';
    if (change === 'target') last.target.promptHash = 'f'.repeat(64);
    if (change === 'policy') last.imageResultPolicy = 'invented' as never;
    if (change === 'derived-text') state.validatedFinal.text += ' ';
    if (change === 'derived-hash') state.validatedFinal.responseHash = 'f'.repeat(64);
    if (change === 'raw-link') state.validatedFinal.rawCheckpoint = 'f'.repeat(64);
    expect(() => nativeImageReviewFinal(state)).toThrow(); expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('materializes a paid final after the original deadline and reclaimed lease without a Host or provider', async () => {
    const f = await fixture(); const calls = f.fetcher.mock.calls.length;
    vi.spyOn(Date, 'now').mockReturnValue(f.envelope.deadlineAt + 1);
    const last = f.state.turns.at(-1)!;
    if (last.state !== 'completed') throw new Error('fixture final is incomplete');
    expect(await runNativeImageReviewTask(f.input())).toMatchObject({ model: f.envelope.model, responseHash: sha(last.response.text) });
    expect(f.fetcher).toHaveBeenCalledTimes(calls); expect(f.authority).toHaveBeenCalled();
  });
  it('does not consume a final paid reply after live authority is revoked', async () => {
    const f = await fixture(); f.authority.mockRejectedValue(new Error('Revoked'));
    await expect(runNativeImageReviewTask(f.input())).rejects.toThrow('Revoked');
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not reissue any persisted started turn', async () => {
    const f = await fixture(); const next = structuredClone(f.state);
    const last = next.turns.at(-1)!; delete (last as { response?: unknown }).response; last.state = 'started';
    f.persist(next); f.row.executionAttempt = 1;
    await expect(runNativeImageReviewTask({ ...f.input(), gateway: f.gateway })).rejects.toThrow(/unknown/);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects a fabricated final which never viewed the saved pixels', async () => {
    const f = await fixture(); const next = structuredClone(f.state);
    next.turns.at(-1)!.request.messages = next.turns.at(-1)!.request.messages.filter(message => message.role !== 'tool');
    f.persist(next);
    await expect(runNativeImageReviewTask(f.input())).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['provider', 'prompt-hash', 'over-budget', 'earlier-started', 'rejected-allowance', 'physical-calls'])('rejects unsafe final provenance: %s', async change => {
    const f = await fixture(); const next = structuredClone(f.state);
    const last = next.turns.at(-1)!;
    if (last.state !== 'completed') throw new Error('fixture final is not completed');
    if (change === 'provider') last.response.provider = 'foreign';
    if (change === 'prompt-hash') last.response.promptHash = 'f'.repeat(64);
    if (change === 'over-budget') last.response.usage.outputTokens = 40000;
    if (change === 'earlier-started') {
      const first = next.turns[0]!; delete (first as { response?: unknown }).response; first.state = 'started';
    }
    if (change === 'rejected-allowance') next.turns[0]!.rejectedAttempt = { httpStatus: 529, maxOutputTokens: 32768 };
    if (change === 'physical-calls') {
      const first = structuredClone(next.turns[0]!); first.rejectedAttempt = { httpStatus: 529, maxOutputTokens: 100 };
      next.turns = [first, structuredClone(first), last];
    }
    f.persist(next);
    await expect(runNativeImageReviewTask(f.input())).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['missing-skill', 'failed-skill', 'unrelated-skill', 'duplicate-view', 'repeated-pixels', 'tools-after-view', 'earlier-visual-turn'])(
    'rejects unsafe visual history with no additional provider: %s', async change => {
    const f = await fixture(); const next = structuredClone(f.state); const last = next.turns.at(-1)!;
    const messages = last.request.messages;
    const skill = messages.find(message => message.role === 'tool' && message.toolCallId === 'skill-1')!;
    if (change === 'missing-skill') skill.content = '{}';
    if (change === 'failed-skill') skill.content = JSON.stringify({ success: false });
    if (change === 'unrelated-skill') messages.flatMap(message => message.toolCalls ?? [])
      .find(call => call.function.name === 'skill_view')!.function.arguments = JSON.stringify({ name: 'unrelated' });
    if (change === 'duplicate-view') {
      const assistant = messages.find(message => message.toolCalls?.some(call => call.function.name === 'paper_image_view'))!;
      assistant.toolCalls!.push(structuredClone(assistant.toolCalls!.find(call => call.function.name === 'paper_image_view')!));
    }
    if (change === 'repeated-pixels') {
      const message = messages.find(message => message.images?.length)!; message.images!.push(structuredClone(message.images![0]!));
    }
    if (change === 'tools-after-view') messages.push({ role: 'assistant', content: '', toolCalls: [{ id: 'late-skill', type: 'function',
      function: { name: 'skill_view', arguments: JSON.stringify({ name: 'openscience-source-review' }) } }] });
    if (change === 'earlier-visual-turn') next.turns[0]!.request.messages.push(structuredClone(messages.find(message => message.images?.length)!));
    f.persist(next);
    await expect(runNativeImageReviewTask(f.input())).rejects.toThrow(); expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['requestId', 'contentHash', 'sourceEvidenceIdentity', 'parentIdentity'] as const)('rejects a changed %s before any new provider', async field => {
    const f = await fixture(); const changed = { ...f.envelope, [field]: field.endsWith('Hash') || field === 'sourceEvidenceIdentity' ? 'f'.repeat(64) : 'foreign' };
    await expect(runNativeImageReviewTask({ ...f.input(), envelope: changed })).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('image Agent original conversation allowance', () => {
  it('refuses two view calls from one paid reply and never pays another request for them', async () => {
    const f = await fixture({ deferInitial: true, doubleView: true });
    await expect(f.session.complete(f.sdk)).rejects.toThrow('only one');
    await expect(f.newSession().complete(f.sdk)).rejects.toThrow('only one');
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it('stops at tools returned by its sole visual call and cannot pay a later tool stage', async () => {
    const f = await fixture({ initialOnly: true, toolsAfterView: true });
    const first = f.state.turns[0]!;
    if (first.state !== 'completed') throw new Error('fixture first turn incomplete');
    const initial = await f.newSession().complete(f.sdk) as { choices: Array<{ message: unknown }> };
    const next = f.continuation(initial.choices[0]!.message);
    await expect(f.session.complete(next)).rejects.toThrow('without more tools');
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not turn a thinking-only visual reply into a second image request', async () => {
    const f = await fixture({ initialOnly: true, runtimeId: `installed-native-continuation-${'a'.repeat(40)}` });
    f.fetcher.mockImplementation(async () => new Response(JSON.stringify({ model: f.envelope.model,
      content: [{ type: 'thinking', thinking: 'Unfinished reasoning.', signature: 'original' }], stop_reason: 'end_turn',
      usage: { input_tokens: 20, output_tokens: 8 } })));
    const first = await f.newSession().complete(f.sdk) as { choices: Array<{ message: unknown }> };
    await expect(f.session.complete(f.continuation(first.choices[0]!.message))).rejects.toThrow('without more tools');
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([{ skillName: 'unrelated-method', skillSuccess: true }, { skillName: 'openscience-source-review', skillSuccess: false }])(
    'rejects missing fixed successful Skill before paying the image request: $skillName/$skillSuccess', async options => {
    const f = await fixture({ ...options, initialOnly: true });
    const first = await f.newSession().complete(f.sdk) as { choices: Array<{ message: unknown }> };
    await expect(f.session.complete(f.continuation(first.choices[0]!.message))).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it('continues a completed image-tool turn after restart using only the remaining original output allowance', async () => {
    const f = await fixture({ initialOnly: true, firstOutput: 32760 });
    const restarted = f.newSession();
    const first = await restarted.complete(f.sdk) as { choices: Array<{ message: unknown }> };
    expect(f.fetcher).toHaveBeenCalledOnce();
    await restarted.complete(f.continuation(first.choices[0]!.message));
    const httpBody = JSON.parse(String(f.fetcher.mock.calls[1]![1].body));
    expect(httpBody.max_tokens).toBe(8); expect(f.state.binding).toEqual(f.binding);
    expect(f.state.turns).toHaveLength(2);
  });
  it('does not reset an exhausted total output allowance on restart', async () => {
    const f = await fixture({ initialOnly: true, firstOutput: 32768 });
    const restarted = f.newSession();
    const first = await restarted.complete(f.sdk) as { choices: Array<{ message: unknown }> };
    await expect(restarted.complete(f.continuation(first.choices[0]!.message))).rejects.toThrow('output budget');
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it('does not give a completed tool turn a new five-minute deadline', async () => {
    const f = await fixture({ initialOnly: true }); const before = structuredClone(f.state);
    vi.spyOn(Date, 'now').mockReturnValue(f.envelope.deadlineAt);
    await expect(f.newSession().complete(f.sdk)).rejects.toThrow('deadline');
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.state).toEqual(before);
  });
  it('cannot retry 529 when its original full output reservation consumes the remaining allowance', async () => {
    const f = await fixture({ deferInitial: true, firstStatus: 529 });
    await expect(f.session.complete(f.sdk)).rejects.toThrow();
    expect(f.state.turns[0]?.state).toBe('started');
    await expect(f.newSession().complete(f.sdk)).rejects.toThrow('unknown');
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
});

function post(socketPath: string, path: string, value: unknown) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const request = httpRequest({ socketPath, path, method: 'POST', headers: { 'content-type': 'application/json' } }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode!, body: JSON.parse(text) }));
    });
    request.on('error', reject); request.end(JSON.stringify(value));
  });
}
async function imageHost() {
  const f = await fixture({ deferInitial: true });
  const root = await mkdtemp(resolve(tmpdir(), 'xgs-img-')); let allowed = true;
  const receipt = { status: 'image_view_ready', requestId: taskId, contentHash: f.envelope.contentHash,
    sourceEvidenceIdentity: f.envelope.sourceEvidenceIdentity, parentIdentity: f.envelope.parentIdentity };
  const content = [{ type: 'image_url' as const, image_url: { url: `data:image/png;base64,${pixels.toString('base64')}` } }];
  const imageRead = vi.fn(async () => ({ content }));
  const final = runHostedNativeTask({ inboxRoot: root, executionAttempt: 1,
    config: { ...f.binding, goal: f.request.prompt, instructions: 'View this saved image.', sourceTools: NATIVE_IMAGE_REVIEW_TOOLS },
    deadlineAt: f.envelope.deadlineAt, maxInputBytes: f.envelope.maxInputBytes, session: f.session, store: f.store,
    authorize: async () => { if (!allowed) throw new Error('[blocked] revoked'); },
    paper: { observedPassageIds: [], call: async () => receipt, images: imageRead,
      withAuthorizedToolCall: async run => { if (!allowed) throw new Error('[blocked] revoked'); return run(); } } });
  let initializationError: unknown;
  let ended = false;
  void final.then(() => { ended = true; }, error => { initializationError = error; ended = true; });
  const socketPath = resolve(root, `${taskId}-1/worker.sock`);
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (initializationError) throw initializationError;
      try { await access(resolve(root, `${taskId}-1/request.json`)); ready = true; break; } catch { await new Promise(r => setTimeout(r, 10)); }
    }
    if (initializationError) throw initializationError;
    if (!ready) throw new Error('Host fixture did not publish its request after listening');
    const first = await post(socketPath, '/v1/chat/completions', f.sdk); expect(first.status).toBe(200);
    expect((await post(socketPath, '/task/tools/authorize', { name: 'skill_view', arguments: { name: 'openscience-source-review' } })).status).toBe(200);
    expect((await post(socketPath, '/task/tools/authorize', { name: 'paper_image_view', arguments: {} })).status).toBe(200);
    const view = await post(socketPath, '/task/tools/call', { name: 'paper_image_view', arguments: {} }); expect(view.status).toBe(200);
    const firstMessage = (first.body.choices as Array<{ message: unknown }>)[0]!.message;
    return { ...f, final, socketPath, receipt, imageRead, firstMessage, revoke: () => { allowed = false; }, cleanup: () => rm(root, { recursive: true, force: true }) };
  } catch (error) {
    const originalError = initializationError ?? error;
    let stopped = ended;
    if (!stopped) {
      try { stopped = (await post(socketPath, '/task/finish', { status: 'stopped' })).status === 200; } catch { /* Keep the original failure and live socket. */ }
    }
    if (stopped) {
      await final.catch(() => undefined);
      try { await rm(root, { recursive: true, force: true }); } catch { /* Preserve the original failure and remaining evidence. */ }
    }
    throw originalError;
  }
}

it('reports the actual Host guard for the overlong CI socket path before any provider request', async () => {
  const f = await fixture({ deferInitial: true });
  const inboxRoot = '/home/runner/work/OpenScience/OpenScience/tmp/native-pixel-review/host-HR0A9b';
  expect(Buffer.byteLength(`${inboxRoot}/${taskId}-1/worker.sock`, 'utf8')).toBe(128);
  await expect(runHostedNativeTask({ inboxRoot, executionAttempt: 1,
    config: { ...f.binding, goal: f.request.prompt, instructions: 'View this saved image.', sourceTools: NATIVE_IMAGE_REVIEW_TOOLS },
    deadlineAt: f.envelope.deadlineAt, maxInputBytes: f.envelope.maxInputBytes, session: f.session, store: f.store,
    authorize: f.authority, paper: { observedPassageIds: [], call: async () => ({}), images: async () => ({ content: [] }) },
  })).rejects.toThrow('[blocked] Native Unix socket path exceeds the kernel limit');
  expect(f.fetcher).not.toHaveBeenCalled();
});

describe.skipIf(process.platform === 'win32')('actual saved-image Host endpoint', () => {
  it('delivers bound pixels through paper_image_view and closes from the same actual SDK final', async () => {
    const f = await imageHost();
    try {
      const view = await post(f.socketPath, '/task/tools/images', { callId: 'view-1', arguments: {}, result: f.receipt });
      expect(view.status).toBe(200); expect(f.imageRead).toHaveBeenCalledOnce();
      const continuation = f.continuation(f.firstMessage);
      continuation.messages[continuation.messages.length - 1] = { role: 'user', content: view.body.content };
      expect((await post(f.socketPath, '/v1/chat/completions', continuation)).status).toBe(200);
      expect((await post(f.socketPath, '/task/finish', { status: 'completed', finalResponse: f.answer })).status).toBe(200);
      expect(await f.final).toMatchObject({ finalResponse: f.answer }); expect(f.fetcher).toHaveBeenCalledTimes(2);
    } finally { await f.cleanup(); }
  });
  it.each(['requestId', 'contentHash', 'sourceEvidenceIdentity', 'parentIdentity'] as const)('refuses pixels for a changed %s receipt', async field => {
    const f = await imageHost();
    try {
      const response = await post(f.socketPath, '/task/tools/images', { callId: 'view-1', arguments: {}, result: { ...f.receipt, [field]: 'foreign' } });
      expect(response.status).toBe(409); expect(f.imageRead).not.toHaveBeenCalled();
      await expect(f.final).rejects.toThrow(); expect(f.fetcher).toHaveBeenCalledOnce();
    } finally { await f.cleanup(); }
  });
  it('refuses the saved pixels after live authority is revoked', async () => {
    const f = await imageHost();
    try {
      f.revoke(); const response = await post(f.socketPath, '/task/tools/images', { callId: 'view-1', arguments: {}, result: f.receipt });
      expect(response.status).toBe(409); expect(JSON.stringify(response.body)).not.toContain(pixels.toString('base64'));
      await expect(f.final).rejects.toThrow(); expect(f.fetcher).toHaveBeenCalledOnce();
    } finally { await f.cleanup(); }
  });
});
