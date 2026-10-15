import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AiGateway } from '../src/gateway';
import { AnthropicCompatProvider } from '../src/provider';
import { nativeImageReviewPromptHash } from '../src/native-image-review';
import type { ScienceReviewInput } from '../src/science-review-protocol';
import type { ChatMessage, ProviderResult } from '../src/provider';
import * as imageProtocol from '../src/native-image-review';
import * as bridge from '../src/native-agent-bridge';

const bytes = readFileSync(resolve(__dirname, 'fixtures/minimax-reference.png'));
const hash = createHash('sha256').update(bytes).digest('hex');
const input = (): ScienceReviewInput => ({ requestId: 'image-task', prompt: 'Inspect the actual axes against the approved evidence.',
  authorizationContext: { taskId: 'image-task', actorId: 'actor', workspaceId: 'ws' },
  illustrationContext: { executionAttempt: 1, claimContent: 'claims', baseIdentity: 'parent', imageReviewMode: 'model-native' },
  source: { kind: 'illustration-image', researchObjectId: 'ro', versionId: 'v', candidateHash: hash, sourceEvidenceIdentity: 'b'.repeat(64) },
  attachments: [{ fileName: 'page-1.png', mediaType: 'image/png', bytes, sha256: hash, pageNumber: 1, width: 1, height: 1 }] });
const guard = (value: unknown): value is { decision: string } => Boolean(value && typeof value === 'object' && (value as { decision?: string }).decision === 'accepted');
const imageTools = [{ type: 'function' as const, function: { name: 'paper_image_view', description: 'Read this saved image only.',
  parameters: { type: 'object', properties: {}, additionalProperties: false } } }];

describe('image-review-tool-final-v1 offline transport', () => {
  const policy = 'image-review-tool-final-v1' as const;
  const decision = { decision: 'blocked', summary: '  条件 "A" \\ B\n未证实  ', repairInstruction: null };
  const supplier = (overrides = {}) => ({ model: 'MiniMax-M3', stop_reason: 'tool_use',
    usage: { input_tokens: 17, output_tokens: 8 }, content: [
      { type: 'thinking', thinking: 'private reasoning', signature: 'opaque' },
      { type: 'tool_use', id: 'result-1', name: 'image_review_result', input: decision },
    ], ...overrides });
  function fixture(data: unknown = supplier(), status = 200, logger?: Pick<Console, 'info' | 'warn' | 'error'>) {
    const f = setup(undefined, undefined, logger);
    f.fetcher.mockImplementation(async () => new Response(typeof data === 'string' ? data : JSON.stringify(data), { status }));
    const role = { input: { ...input(), illustrationContext: { ...input().illustrationContext!, imageReviewMode: 'agent-native' as const } },
      target: { provider: f.provider.name, model: f.provider.model } };
    const messages = [{ role: 'user' as const, content: role.input.prompt,
      images: [{ mediaType: 'image/png' as const, data: bytes.toString('base64') }] }];
    const options = { tools: imageTools, maxTokens: 100, thinking: 'adaptive' as const, temperature: 0.2, topP: 0.8,
      timeoutMs: 1234, maxRequestBytes: 64000000 };
    const prepared = f.gateway.prepareNativeImageReviewTurn(messages, options, role);
    const beforeProviderAttempt = vi.fn(async () => undefined);
    const submitProvider = vi.fn(async (_target, submit) => submit());
    const execute = () => f.gateway.executeNativeImageReviewTurn(prepared, { imageReview: role, beforeProviderAttempt, submitProvider });
    return { ...f, role, messages, options, prepared, beforeProviderAttempt, submitProvider, execute };
  }
  it('snapshots the effective descriptor before preflight/start and sends exactly its values', async () => {
    const f = fixture();
    const preflight = vi.spyOn(f.provider, 'preflightNativeImageReview');
    f.submitProvider.mockImplementation(async (target, submit) => {
      expect(preflight).toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
      expect(target).toEqual(f.prepared.target); return submit();
    });
    f.messages[0].content = 'caller mutation'; f.options.maxTokens = 999;
    expect(Object.isFrozen(f.prepared.messages)).toBe(true);
    expect(Object.isFrozen(f.prepared.tools.at(-1)!.function.parameters)).toBe(true);
    const received = await f.execute();
    const body = JSON.parse(String((f.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ model: f.prepared.target.model, tool_choice: f.prepared.toolChoice,
      max_tokens: 100, temperature: 0.2, top_p: 0.8, thinking: { type: 'adaptive' } });
    expect(body.messages[0].content[0].text).toBe(f.prepared.messages[0].content);
    expect(body.tools).toEqual(f.prepared.tools.map(t => ({ name: t.function.name,
      ...(t.function.description === undefined ? {} : { description: t.function.description }), input_schema: t.function.parameters })));
    expect(f.prepared.target.promptHash).toBe(imageProtocol.nativeImageReviewTurnPromptHash(f.prepared));
    expect(received.decoded).toMatchObject({ text: '', finishReason: 'other', providerStopReason: 'tool_use',
      toolCalls: [{ id: 'result-1', function: { name: 'image_review_result' } }] });
    expect(f.beforeProviderAttempt).toHaveBeenCalledOnce(); expect(f.authorize).toHaveBeenCalledOnce();
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it('restores only saved options and rejects changed identities/schema/choice without a call', () => {
    const f = fixture(); const { messages, ...saved } = f.prepared;
    const stored = JSON.parse(JSON.stringify({ ...saved, messagesFrom: 'request.messages' }));
    expect(imageProtocol.restoreNativeImageReviewTurn(stored, messages)).toEqual(f.prepared);
    for (const change of [
      (p: typeof stored) => { p.generation.topP = 0.9; },
      (p: typeof stored) => { p.toolChoice.name = 'skill_view'; },
      (p: typeof stored) => { p.tools.at(-1).function.parameters.additionalProperties = true; },
      (p: typeof stored) => { p.policy = 'unknown'; },
    ]) {
      const changed = structuredClone(stored); change(changed);
      expect(() => imageProtocol.restoreNativeImageReviewTurn(changed, messages)).toThrow();
    }
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('derives exact strings and projects JSON/no-tools/stop with raw usage and no opaque reasoning', async () => {
    const f = fixture(); const received = await f.execute();
    const final = imageProtocol.validateNativeImageReviewFinal(f.prepared, received, { rawCheckpoint: 'a'.repeat(64), turnOrdinal: 2 });
    expect(JSON.parse(final.text)).toEqual(decision); expect(final.text).toBe(JSON.stringify(decision));
    expect(final.responseHash).toBe(createHash('sha256').update(final.text).digest('hex'));
    expect(final).toMatchObject({ policy, rawCheckpoint: 'a'.repeat(64), turnOrdinal: 2, resultToolCallId: 'result-1' });
    const projected = bridge.nativeImageReviewSdkFinalProjection(final, received.decoded!, 'task-turn-2');
    expect(projected.choices).toEqual([{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: final.text } }]);
    expect(projected.usage).toMatchObject({ prompt_tokens: 17, completion_tokens: 8, total_tokens: 25 });
    expect(JSON.stringify(projected)).not.toContain('private reasoning');
    expect(() => imageProtocol.readNativeImageReviewDecision({ ...decision, extra: true })).toThrow();
    expect(imageProtocol.readNativeImageReviewDecision(decision)).toEqual(decision);
  });
  it.each([
    ['invalid JSON', '{', true], ['HTTP failure', supplier(), false, 503],
    ['missing usage', supplier({ usage: undefined }), true], ['missing model', supplier({ model: undefined }), true],
    ['missing content', supplier({ content: undefined }), true],
    ['duplicate calls', supplier({ content: [supplier().content[1], supplier().content[1]] }), false],
    ['unknown call', supplier({ content: [{ ...supplier().content[1], name: 'unknown_tool' }] }), false],
    ['mixed text', supplier({ content: [{ type: 'text', text: 'accepted' }, supplier().content[1]] }), false],
    ['unknown block', supplier({ content: [{ type: 'alien' }, supplier().content[1]] }), false],
    ['truncated', supplier({ stop_reason: 'max_tokens' }), false],
    ['wrong model', supplier({ model: 'MiniMax-M3.1-Flash-Preview' }), false],
    ['over budget', supplier({ usage: { input_tokens: 17, output_tokens: 101 } }), false],
    ['wrong schema', supplier({ content: [{ ...supplier().content[1], input: { ...decision, decision: 'unknown' } }] }), false],
  ])('preserves paid %s receipt and refuses derivation with no retry', async (_name, data, rawOnly, status?: number) => {
    const f = fixture(data, status); const received = await f.execute();
    expect(received.body).toBe(typeof data === 'string' ? data : JSON.stringify(data));
    expect(received.status).toBe(status ?? 200); expect(received.decoded === undefined).toBe(rawOnly);
    expect(() => imageProtocol.validateNativeImageReviewFinal(f.prepared, received, { rawCheckpoint: 'a'.repeat(64), turnOrdinal: 2 })).toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it('rejects decoded/body tampering', async () => {
    const f = fixture(); const received = await f.execute();
    const changed = { ...received, decoded: { ...received.decoded!, text: 'different' } };
    expect(() => imageProtocol.validateNativeImageReviewFinal(f.prepared, changed, { rawCheckpoint: 'a'.repeat(64), turnOrdinal: 2 })).toThrow();
  });
  it.each([
    [{ input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 }, false],
    [{ input_tokens: Number.MAX_SAFE_INTEGER - 1, output_tokens: 1 }, true],
    [{ input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 0 }, true],
    [{ input_tokens: 17, output_tokens: 1, cache_read_input_tokens: Number.MAX_SAFE_INTEGER - 17, cache_creation_input_tokens: 0 }, false],
    [{ input_tokens: 17, output_tokens: 1, cache_read_input_tokens: Number.MAX_SAFE_INTEGER - 18, cache_creation_input_tokens: 0 }, true],
  ])('checks usage projectability before deriving a final for %j', async (usage, accepted) => {
    const data = supplier({ usage }); const f = fixture(data); const received = await f.execute();
    const original = JSON.stringify(received);
    expect(received.body).toBe(JSON.stringify(data));
    expect(received.decoded!.usage).toEqual({ inputTokens: usage.input_tokens, outputTokens: usage.output_tokens });
    let final: imageProtocol.NativeImageReviewValidatedFinal | undefined;
    const derive = () => { final = imageProtocol.validateNativeImageReviewFinal(f.prepared, received,
      { rawCheckpoint: 'a'.repeat(64), turnOrdinal: 0 }); };
    if (accepted) {
      derive();
      const projected = bridge.nativeImageReviewSdkFinalProjection(final!, received.decoded!, 'task-turn-0');
      expect(projected.usage.total_tokens).toBe(Number.MAX_SAFE_INTEGER);
    } else {
      expect(derive).toThrow(); expect(final).toBeUndefined();
    }
    expect(JSON.stringify(received)).toBe(original); expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it('preserves the original executable history and opaque blocks with the fixed terminal definition', async () => {
    const f = fixture();
    const call = { id: 'view-1', type: 'function' as const, function: { name: 'paper_image_view', arguments: '{}' } };
    const history: ChatMessage[] = [{ role: 'user' as const, content: 'Inspect the saved image.' },
      { role: 'assistant' as const, content: '', toolCalls: [call], providerContent: { provider: f.provider.name, model: f.provider.model,
        content: [{ type: 'thinking', thinking: 'historical-private', signature: 'saved-signature' },
          { type: 'tool_use', id: call.id, name: call.function.name, input: {} }] } },
      { role: 'tool' as const, toolCallId: call.id, name: call.function.name, content: 'Read this image only.' }, ...f.messages];
    const prepared = f.gateway.prepareNativeImageReviewTurn(history, f.options, f.role);
    const inconsistent = structuredClone(prepared); inconsistent.messages[1].content = 'invented assistant text';
    inconsistent.target.promptHash = imageProtocol.nativeImageReviewTurnPromptHash(inconsistent);
    const { messages: inconsistentMessages, ...inconsistentSaved } = inconsistent;
    expect(() => imageProtocol.restoreNativeImageReviewTurn({ ...inconsistentSaved, messagesFrom: 'request.messages' }, inconsistentMessages)).toThrow();
    await f.gateway.executeNativeImageReviewTurn(prepared, { imageReview: f.role, beforeProviderAttempt: f.beforeProviderAttempt,
      submitProvider: f.submitProvider });
    const body = JSON.parse(String((f.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.messages[1].content).toEqual(history[1].providerContent!.content);
    expect(body.messages[2].content).toEqual([{ type: 'tool_result', tool_use_id: 'view-1', content: 'Read this image only.' }]);
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual(['paper_image_view', 'image_review_result']);
    expect(JSON.stringify(f.audit.record.mock.calls)).not.toContain('historical-private');
  });
  it('keeps an oversized received body as bounded raw-only evidence without retry', async () => {
    const f = fixture('x'.repeat(2 * 1024 * 1024 + 10));
    const received = await f.execute(); expect(Buffer.byteLength(received.body)).toBe(2 * 1024 * 1024);
    expect(received.decoded).toBeUndefined(); expect(received.status).toBe(200); expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it('retains exactly the bounded original bytes for oversized invalid UTF-8', async () => {
    const f = fixture();
    f.fetcher.mockImplementation(async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1).fill(255)));
    const received = await f.execute();
    expect(received.body).toBe('');
    expect(received).toHaveProperty('rawBodyBase64', Buffer.alloc(2 * 1024 * 1024, 255).toString('base64'));
    expect(received.decoded).toBeUndefined(); expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it.each([[255], [192, 175], [195, 40]])('preserves invalid UTF-8 bytes %j inside a JSON summary as raw-only evidence', async (...invalidBytes) => {
    const marker = 'INVALID_UTF8_MARKER';
    const wire = Buffer.from(JSON.stringify(supplier({ content: [{ type: 'tool_use', id: 'result-1', name: 'image_review_result',
      input: { ...decision, summary: marker } }] })));
    const offset = wire.indexOf(marker);
    const original = Buffer.concat([wire.subarray(0, offset), Buffer.from(invalidBytes), wire.subarray(offset + marker.length)]);
    const f = fixture(); f.fetcher.mockImplementation(async () => new Response(new Uint8Array(original)));
    const received = await f.execute();
    expect(received).toEqual({ policy, provider: f.provider.name, status: 200, body: '', rawBodyBase64: original.toString('base64') });
    expect(() => imageProtocol.validateNativeImageReviewFinal(f.prepared, received,
      { rawCheckpoint: 'a'.repeat(64), turnOrdinal: 0 })).toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it('accepts the literal replacement character when its original bytes are valid UTF-8', async () => {
    const typed = { ...decision, summary: 'Original literal \uFFFD remains unchanged.' };
    const wire = Buffer.from(JSON.stringify(supplier({ content: [{ type: 'tool_use', id: 'result-1', name: 'image_review_result', input: typed }] })));
    const f = fixture(); f.fetcher.mockImplementation(async () => new Response(new Uint8Array(wire)));
    const received = await f.execute();
    expect(received.body).toBe(wire.toString('utf8')); expect(received).not.toHaveProperty('rawBodyBase64');
    const final = imageProtocol.validateNativeImageReviewFinal(f.prepared, received, { rawCheckpoint: 'a'.repeat(64), turnOrdinal: 0 });
    expect(final.text).toBe(JSON.stringify(typed)); expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it.each(['', undefined, '/w=='])('refuses any own rawBodyBase64 presence, including %j, before deriving a final', async rawBodyBase64 => {
    const f = fixture(); const received = await f.execute();
    expect(() => imageProtocol.validateNativeImageReviewFinal(f.prepared, { ...received, rawBodyBase64 },
      { rawCheckpoint: 'a'.repeat(64), turnOrdinal: 0 })).toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it('refuses altered pixels/provider, malformed options and result history before start', async () => {
    const f = fixture();
    for (const options of [{ ...f.options, topP: NaN }, { ...f.options, timeoutMs: 0 },
      { ...f.options, maxTokens: 0 }, { ...f.options, maxRequestBytes: 1 },
      { ...f.options, tools: f.prepared.tools }, { ...f.options, imageResultPolicy: policy }]) {
      expect(() => f.gateway.prepareNativeImageReviewTurn(f.messages, options, f.role)).toThrow();
    }
    const prepared = structuredClone(f.prepared); prepared.target.provider = 'different';
    await expect(f.gateway.executeNativeImageReviewTurn(prepared, { imageReview: f.role, beforeProviderAttempt: f.beforeProviderAttempt,
      submitProvider: f.submitProvider })).rejects.toThrow();
    expect(() => f.gateway.prepareNativeImageReviewTurn([], f.options, f.role)).toThrow();
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.submitProvider).not.toHaveBeenCalled();
  });
  it('does not coerce decision objects into the typed enum', () => {
    expect(() => imageProtocol.readNativeImageReviewDecision({ ...decision, decision: { toString: () => 'accepted' } })).toThrow();
  });
  it('uses zero-based ordinal and the shared 200-character result call ID ceiling', async () => {
    const f = fixture(supplier({ content: [{ ...supplier().content[1], id: 'r'.repeat(200) }] }));
    const received = await f.execute();
    expect(imageProtocol.validateNativeImageReviewFinal(f.prepared, received, { rawCheckpoint: 'a'.repeat(64), turnOrdinal: 0 }).turnOrdinal).toBe(0);
    const oversized = fixture(supplier({ content: [{ ...supplier().content[1], id: 'r'.repeat(201) }] }));
    const oversizedReceived = await oversized.execute();
    expect(oversizedReceived.decoded!.toolCalls![0].id).toHaveLength(201);
    expect(() => imageProtocol.validateNativeImageReviewFinal(oversized.prepared, oversizedReceived,
      { rawCheckpoint: 'a'.repeat(64), turnOrdinal: 0 })).toThrow();
  });
  it('does not turn transport uncertainty into a received reply', async () => {
    const f = fixture(); f.fetcher.mockRejectedValue(Object.assign(new Error('network'), { code: 'ECONNRESET' }));
    await expect(f.execute()).rejects.toThrow(); expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it.each([
    ['info', 'decoded'], ['info', 'raw-only'],
    ['audit-and-error', 'decoded'], ['audit-and-error', 'raw-only'],
  ])('hands the exact %s-logger-failure %s receipt to the publication owner', async (failure, kind) => {
    const logger = { info: vi.fn(() => { throw new Error('logger info failed'); }), warn: vi.fn(),
      error: vi.fn(() => { throw new Error('logger error failed'); }) };
    const body = kind === 'decoded' ? JSON.stringify(supplier()) : ' invalid supplier body \n';
    const f = fixture(body, 200, logger);
    if (failure === 'audit-and-error') f.audit.record.mockRejectedValue(new Error('audit failed'));
    const provider = vi.spyOn(f.provider, 'completeNativeImageReview');
    let published: unknown;
    f.submitProvider.mockImplementation(async (_target, submit) => { published = await submit(); return published; });
    const received = await f.execute();
    expect(received).toBe(await provider.mock.results[0].value);
    expect(published).toBe(received); expect(received.body).toBe(body); expect(received.status).toBe(200);
    expect(received.decoded === undefined).toBe(kind === 'raw-only');
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.audit.record).toHaveBeenCalledOnce();
    expect(failure === 'audit-and-error' ? logger.error : logger.info).toHaveBeenCalledOnce();
  });
  it('retains transport failure rather than manufacturing a receipt when logging also throws', async () => {
    const logger = { info: vi.fn(() => { throw new Error('logger failed'); }), warn: vi.fn(), error: vi.fn() };
    const f = fixture(undefined, 200, logger);
    f.fetcher.mockRejectedValue(Object.assign(new Error('network failed'), { code: 'ECONNRESET' }));
    await expect(f.execute()).rejects.toMatchObject({ code: 'provider_transport', transportCode: 'ECONNRESET' });
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it.each(['disabled', 'authority', 'started', 'preflight'])('refuses %s before sending', async mode => {
    const f = fixture();
    if (mode === 'disabled') vi.spyOn(f.gateway as never, 'providerEnabled').mockResolvedValue({ enabled: false });
    if (mode === 'authority') f.authorize.mockRejectedValue(new Error('revoked'));
    if (mode === 'started') f.submitProvider.mockRejectedValue(new Error('started'));
    if (mode === 'preflight') vi.spyOn(f.provider, 'preflightNativeImageReview').mockImplementation(() => { throw new Error('body too large'); });
    await expect(f.execute()).rejects.toThrow(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('allows a publication closure once and audits the actual receipt even when storage fails', async () => {
    const f = fixture(); f.submitProvider.mockImplementation(async (_target, submit) => { await submit(); return submit(); });
    await expect(f.execute()).rejects.toThrow(); expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.audit.record).toHaveBeenCalledOnce();
  });
  it('ordinary native calls cannot activate the reserved result tool', async () => {
    const f = fixture();
    await expect(f.gateway.nativeAgentComplete(f.messages, { tools: f.prepared.tools }, {
      beforeProviderAttempt: f.beforeProviderAttempt, submitProvider: async (_target, submit) => submit(),
    })).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});
function setup(text = '{"decision":"accepted"}', model = 'MiniMax-M3', logger?: Pick<Console, 'info' | 'warn' | 'error'>) {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ model, content: [{ type: 'text', text }],
    stop_reason: 'end_turn', usage: { input_tokens: 17, output_tokens: 8 } }), { status: 200 }));
  const provider = new AnthropicCompatProvider('minimax-key-1-model-1', { model, apiKey: 'test', baseUrl: 'https://minimax.example' }, fetcher as never);
  const authorize = vi.fn(async () => undefined);
  const checkpoint = vi.fn(async (_input, _target, submit) => submit());
  const audit = { record: vi.fn(async () => undefined) };
  const gateway = new AiGateway({ providers: [provider], illustrationReviewPolicy: async () => true,
    authorizeIllustrationReview: authorize, nativeImageReviewSubmission: checkpoint, audit, logger });
  return { gateway, provider, fetcher, checkpoint, authorize, audit };
}

describe('server-bound Hermes native pixel review', () => {
  it('binds actual Agent SDK turns to the isolated saved-image role without changing the paper primary', async () => {
    const primary = setup(), pixel = setup(undefined, 'MiniMax-M3.1-Flash-Preview');
    const authority = vi.fn(async () => undefined);
    const gateway = new AiGateway({ providers: [primary.provider], nativeImageReviewProvider: pixel.provider,
      illustrationReviewPolicy: async () => true, authorizeIllustrationReview: authority });
    const request = { ...input(), illustrationContext: { ...input().illustrationContext!, imageReviewMode: 'agent-native' as const } };
    const controls = { beforeProviderAttempt: async () => undefined,
      submitProvider: async (_target: unknown, submit: () => Promise<ProviderResult>) => submit(),
      imageReview: { input: request, target: { provider: pixel.provider.name, model: pixel.provider.model } } };
    const result = await gateway.nativeAgentComplete([{ role: 'user', content: 'Inspect the saved image.',
      images: [{ mediaType: 'image/png', data: bytes.toString('base64') }] }], { maxTokens: 100, tools: imageTools }, controls);
    expect(result.model).toBe(pixel.provider.model);
    expect(pixel.fetcher).toHaveBeenCalledOnce(); expect(primary.fetcher).not.toHaveBeenCalled();
    expect(authority).toHaveBeenCalledOnce();
    await gateway.nativeAgentComplete([{ role: 'user', content: 'The original paper task.' }], { maxTokens: 100 }, {
      beforeProviderAttempt: async () => undefined, submitProvider: async (_target, submit) => submit(),
    });
    expect(primary.fetcher).toHaveBeenCalledOnce(); expect(pixel.fetcher).toHaveBeenCalledOnce();
  });

  it.each(['changed-target', 'changed-pixels', 'repeated-pixels'])('rejects an Agent image role %s before any checkpoint or provider', async change => {
    const primary = setup(), pixel = setup(undefined, 'MiniMax-M3.1-Flash-Preview');
    const gateway = new AiGateway({ providers: [primary.provider], nativeImageReviewProvider: pixel.provider,
      illustrationReviewPolicy: async () => true, authorizeIllustrationReview: async () => undefined });
    const request = { ...input(), illustrationContext: { ...input().illustrationContext!, imageReviewMode: 'agent-native' as const } };
    const submitProvider = vi.fn(async (_target, submit) => submit());
    const controls = { beforeProviderAttempt: async () => undefined, submitProvider,
      imageReview: { input: request, target: { provider: pixel.provider.name,
        model: change === 'changed-target' ? 'MiniMax-M3' : pixel.provider.model } } };
    const changed = Buffer.from(bytes); if (change === 'changed-pixels') changed[changed.length - 1] ^= 1;
    await expect(gateway.nativeAgentComplete([{ role: 'user', content: 'Inspect.', images: [
      { mediaType: 'image/png', data: changed.toString('base64') },
      ...(change === 'repeated-pixels' ? [{ mediaType: 'image/png' as const, data: bytes.toString('base64') }] : []),
    ] }], { maxTokens: 100, tools: imageTools }, controls)).rejects.toThrow();
    expect(submitProvider).not.toHaveBeenCalled(); expect(primary.fetcher).not.toHaveBeenCalled(); expect(pixel.fetcher).not.toHaveBeenCalled();
  });

  it('uses a configured pixel model while the primary Native Agent model remains M3', async () => {
    const primary = setup(), vision = setup(undefined, 'MiniMax-M3.1-Flash-Preview');
    const checkpoint = vi.fn(async (_input, _target, submit) => submit());
    const gateway = new AiGateway({ providers: [primary.provider], nativeImageReviewProvider: vision.provider,
      illustrationReviewPolicy: async () => true, authorizeIllustrationReview: async () => undefined,
      nativeImageReviewSubmission: checkpoint });
    const request = input();
    expect(await gateway.reviewScientific(request, guard)).toMatchObject({ model: 'MiniMax-M3.1-Flash-Preview',
      promptHash: nativeImageReviewPromptHash(request) });
    expect(vision.fetcher).toHaveBeenCalledOnce(); expect(primary.fetcher).not.toHaveBeenCalled();
    expect(checkpoint.mock.calls[0]?.[1]).toEqual({ provider: vision.provider.name,
      model: 'MiniMax-M3.1-Flash-Preview', promptHash: nativeImageReviewPromptHash(request) });
    expect(await gateway.nativeAgentComplete([{ role: 'user', content: 'Continue the original paper task.' }], { maxTokens: 100 }, {
      beforeProviderAttempt: async () => undefined, submitProvider: async (target, submit) => {
        expect(target.model).toBe('MiniMax-M3'); return submit();
      },
    })).toMatchObject({ model: 'MiniMax-M3' });
    expect(primary.fetcher).toHaveBeenCalledOnce(); expect(vision.fetcher).toHaveBeenCalledOnce();
  });
  it('keeps an overlapping Native Agent request on M3 while pixel HTTP is pending', async () => {
    const primary = setup(), vision = setup(undefined, 'MiniMax-M3.1-Flash-Preview');
    let release!: (response: Response) => void, entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    vision.fetcher.mockImplementation(() => { entered(); return new Promise<Response>(resolve => { release = resolve; }); });
    const gateway = new AiGateway({ providers: [primary.provider], nativeImageReviewProvider: vision.provider,
      illustrationReviewPolicy: async () => true, authorizeIllustrationReview: async () => undefined,
      nativeImageReviewSubmission: async (_input, _target, submit) => submit() });
    const pixel = gateway.reviewScientific(input(), guard);
    await started;
    try {
      expect(await gateway.nativeAgentComplete([{ role: 'user', content: 'Keep the bound original model.' }], {}, {
        beforeProviderAttempt: async () => undefined, submitProvider: async (target, submit) => {
          expect(target.model).toBe('MiniMax-M3'); return submit();
        },
      })).toMatchObject({ model: 'MiniMax-M3' });
    } finally {
      release(new Response(JSON.stringify({ model: 'MiniMax-M3.1-Flash-Preview', content: [{ type: 'text', text: '{"decision":"accepted"}' }],
        stop_reason: 'end_turn', usage: { input_tokens: 17, output_tokens: 8 } }), { status: 200 }));
      await pixel;
    }
    expect(primary.fetcher).toHaveBeenCalledOnce(); expect(vision.fetcher).toHaveBeenCalledOnce();
  });
  it.each(['denied', 'started', 'disabled', 'unsupported', 'http-failed'])('does not fall back from the explicit pixel role: %s', async mode => {
    const primary = setup(), vision = setup(undefined, mode === 'unsupported' ? 'MiniMax-M2.7' : 'MiniMax-M3.1-Flash-Preview');
    const authorize = vi.fn(async () => { if (mode === 'denied') throw new Error('Revoked'); });
    const checkpoint = vi.fn(async (_input, _target, submit) => { if (mode === 'started') throw new Error('Already started'); return submit(); });
    if (mode === 'http-failed') vision.fetcher.mockResolvedValue(new Response('{}', { status: 503 }));
    const gateway = new AiGateway({ providers: [primary.provider], nativeImageReviewProvider: vision.provider,
      illustrationReviewPolicy: async () => true, authorizeIllustrationReview: authorize,
      nativeImageReviewSubmission: checkpoint,
      killSwitch: { isEnabled: async () => ({ enabled: mode !== 'disabled' }) } });
    await expect(gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(primary.fetcher).not.toHaveBeenCalled();
    expect(vision.fetcher).toHaveBeenCalledTimes(mode === 'http-failed' ? 1 : 0);
    expect(checkpoint).toHaveBeenCalledTimes(mode === 'http-failed' || mode === 'started' ? 1 : 0);
  });
  it('does not spend another request when the explicit pixel role returns malformed JSON', async () => {
    const primary = setup(), vision = setup('{"decision":', 'MiniMax-M3.1-Flash-Preview');
    const gateway = new AiGateway({ providers: [primary.provider], nativeImageReviewProvider: vision.provider,
      illustrationReviewPolicy: async () => true, authorizeIllustrationReview: async () => undefined,
      nativeImageReviewSubmission: async (_input, _target, submit) => submit() });
    await expect(gateway.reviewScientific(input(), guard)).rejects.toThrow('Native image review response invalid JSON; explicit review retry required');
    expect(primary.fetcher).not.toHaveBeenCalled(); expect(vision.fetcher).toHaveBeenCalledOnce();
  });
  it.each([100000, 100001])('uses the existing native model budget at %i characters without changing the browser protocol', async length => {
    const f = setup(); const request = input(); request.prompt = 'x'.repeat(length);
    if (length === 100000) { await f.gateway.reviewScientific(request, guard); expect(f.fetcher).toHaveBeenCalledOnce(); }
    else {
      await expect(f.gateway.reviewScientific(request, guard)).rejects.toThrow();
      expect(f.authorize).not.toHaveBeenCalled(); expect(f.checkpoint).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
    }
  });
  it('uses real native pixels, the actual primary model and an exact durable target before HTTP', async () => {
    const f = setup();
    f.checkpoint.mockImplementation(async (request, target, submit) => {
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(target).toEqual({ provider: f.provider.name, model: f.provider.model, promptHash: nativeImageReviewPromptHash(request) });
      return submit();
    });
    const request = input();
    expect(await f.gateway.reviewScientific(request, guard)).toMatchObject({ provider: f.provider.name, model: 'MiniMax-M3', promptHash: nativeImageReviewPromptHash(request) });
    const body = JSON.parse(String((f.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.max_tokens).toBe(32768);
    expect(body.messages[0].content[1].source.data).toBe(bytes.toString('base64'));
    expect(f.authorize).toHaveBeenCalledOnce(); expect(f.checkpoint).toHaveBeenCalledOnce();
    const log = f.audit.record.mock.calls[0][0] as unknown as { metadata: Record<string, unknown> };
    expect(log.metadata).toMatchObject({ operation: 'scientific_review', inputTokens: 17, pageCount: 1, pricingVersion: null, actualCostUsdMicros: null });
  });

  it('does not mark a call started when deterministic native preflight fails', async () => {
    const f = setup(); vi.spyOn(f.provider, 'preflightNativeImages').mockImplementation(() => { throw new Error('Body too large'); });
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.authorize).not.toHaveBeenCalled(); expect(f.checkpoint).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('does not send without fresh authorization or without the private submission owner', async () => {
    const f = setup(); f.authorize.mockRejectedValue(new Error('Revoked'));
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.checkpoint).not.toHaveBeenCalled();
    const noOwner = new AiGateway({ providers: [f.provider], illustrationReviewPolicy: async () => true, authorizeIllustrationReview: async () => undefined });
    await expect(noOwner.reviewScientific(input(), guard)).rejects.toThrow(); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('never makes a second paid call for malformed output', async () => {
    const f = setup('{"decision":"unknown"}');
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.checkpoint).toHaveBeenCalledOnce();
  });
  it('classifies malformed native JSON as an explicit review-only recovery', async () => {
    const f = setup('{"decision":"accepted"');
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow('Native image review response invalid JSON; explicit review retry required');
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.checkpoint).toHaveBeenCalledOnce();
  });

  it('never accepts valid-looking JSON from an output cut off at the thinking/output ceiling', async () => {
    const f = setup(); f.fetcher.mockImplementation(async () => new Response(JSON.stringify({ model: 'MiniMax-M3',
      content: [{ type: 'text', text: '{"decision":"accepted"}' }], stop_reason: 'max_tokens', usage: { input_tokens: 17, output_tokens: 32768 } }), { status: 200 }));
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.checkpoint).toHaveBeenCalledOnce();
  });

  it('blocks another submission when the durable owner reports an uncertain prior call', async () => {
    const f = setup(); f.checkpoint.mockRejectedValue(new Error('Already started'));
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow(); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('does not audit a saved response as a new provider call', async () => {
    const f = setup(); f.checkpoint.mockImplementation(async () => ({ text: '{"decision":"accepted"}',
      model: 'MiniMax-M3', finishReason: 'stop', usage: { inputTokens: 17, outputTokens: 8 } }));
    await f.gateway.reviewScientific(input(), guard);
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.audit.record).not.toHaveBeenCalled();
  });

  it('does not audit a checkpoint denial before actual submission', async () => {
    const f = setup(); f.checkpoint.mockRejectedValue(new Error('Already started'));
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.audit.record).not.toHaveBeenCalled();
  });

  it('audits the actual completed call even if saving its response fails', async () => {
    const f = setup(); f.checkpoint.mockImplementation(async (_input, _target, submit) => {
      await submit(); throw new Error('Completion transaction failed');
    });
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.audit.record).toHaveBeenCalledOnce();
    expect((f.audit.record.mock.calls[0][0] as unknown as { metadata: object }).metadata).toMatchObject({ outcome: 'succeeded' });
  });

  it('allows only one invocation of an owned submission closure', async () => {
    const f = setup(); f.checkpoint.mockImplementation(async (_input, _target, submit) => { await submit(); return submit(); });
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.audit.record).toHaveBeenCalledOnce();
  });

  it('does not select a text-only primary or fall back to another native model', async () => {
    const f = setup(undefined, 'MiniMax-M2.7');
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.checkpoint).not.toHaveBeenCalled();
  });

  it('cannot turn completed-only historical recovery into a fresh native request', async () => {
    const f = setup(); await expect(f.gateway.resumeScientificReviewFromCompletedResult(input(), guard)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});
