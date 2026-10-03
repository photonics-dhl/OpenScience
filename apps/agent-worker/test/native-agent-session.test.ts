import { describe, expect, it } from 'vitest';
import { createNativeAgentSession, type NativeAgentSessionState, type NativeAgentSessionBinding } from '../src/native-agent/session';
import { AiGateway, AnthropicCompatProvider, nativeAgentSdkRequest, type GatewayCompletion, type TextProvider } from '@openscience/ai-gateway';
import { nativePaperToolProfile, NATIVE_PAPER_NOTE_DRAFT_TOOL, NATIVE_PAPER_FIELD_TOOL, NATIVE_PAPER_CLAIM_TOOL, NATIVE_PAPER_REVIEW_TOOL, NATIVE_PAPER_COMMITTED_REVIEW_TOOL } from '../src/native-agent/paper-task';
import { createNativeScientificMaterializer } from '../src/extractor';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import type { DocumentSourceMap } from '@openscience/domain';

const binding = { taskId: 'task', artifactId: 'artifact', documentSha256: 'document', sourceMapHash: 'map',
  runtimeId: 'fixed-installed-runtime', skillCatalogueId: 'fixed-catalogue', model: 'MiniMax-M3', allowedTools: ['paper_read'],
  maxTurns: 3, maxOutputTokens: 100, maxTotalOutputTokens: 1000, maxInputBytes: 10_000, deadlineAt: 10_000 };
const request = { model: 'MiniMax-M3', messages: [{ role: 'system', content: 'fixed system' }, { role: 'user', content: 'Read the paper.' }],
  max_tokens: 100, tools: [{ type: 'function', function: { name: 'paper_read', description: 'Read this paper', parameters: { type: 'object' } } }] };
const completion: Omit<GatewayCompletion, 'provider' | 'promptHash'> = { model: 'MiniMax-M3', text: 'source checked', finishReason: 'stop',
  usage: { inputTokens: 20, outputTokens: 10 }, providerContent: { provider: 'minimax', model: 'MiniMax-M3',
    content: [{ type: 'thinking', thinking: 'opaque', signature: 'private' }, { type: 'text', text: 'source checked' }] } };
function fixture(firstTool: boolean | number = false, toolInput: Record<string, unknown> = {}, toolName = 'paper_read') {
  let state: NativeAgentSessionState | null = null;
  let calls = 0; let authorized = true; let loseAnswer = false; let lease = true; let loseLeaseAfterStart = false; let revokeAfterHTTP = false; let reportedModel = completion.model;
  let outputTokens = completion.usage.outputTokens; const requestedAllowances: (number | undefined)[] = [];
  let finishReason = completion.finishReason;
  let providerStopReason: GatewayCompletion['providerStopReason'];
  const preflight = new AnthropicCompatProvider('minimax', { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: 'MiniMax-M3' }, async () => { throw new Error('Preflight sent HTTP'); });
  const provider: TextProvider = { name: 'minimax', model: 'MiniMax-M3', preflightNativeTools: opts => preflight.preflightNativeTools(opts), async complete(options) {
    calls++; if (loseAnswer) throw new Error('unknown transport outcome');
    requestedAllowances.push(options?.maxTokens);
    const output = { ...structuredClone(completion), usage: { ...completion.usage, outputTokens } };
    if (revokeAfterHTTP) authorized = false;
    if (calls <= Number(firstTool)) return { ...output, text: '', finishReason: 'tool_calls',
      toolCalls: [{ id: `read-${calls}`, type: 'function', function: { name: toolName, arguments: JSON.stringify(toolInput) } }],
      providerContent: { provider: 'minimax', model: 'MiniMax-M3', content: [
        { type: 'thinking', thinking: 'opaque', signature: 'private' }, { type: 'tool_use', id: `read-${calls}`, name: toolName, input: toolInput }] } };
    return { ...output, model: reportedModel, finishReason, ...(providerStopReason ? { providerStopReason } : {}) };
  } };
  const gateway = new AiGateway({ providers: [provider] });
  const store = { async read() { return structuredClone(state); }, async compareAndSet(expected: NativeAgentSessionState | null, next: NativeAgentSessionState) {
    if (!lease || JSON.stringify(state) !== JSON.stringify(expected)) throw new Error('lease or CAS changed');
    state = structuredClone(next);
    if (loseLeaseAfterStart && next.turns.at(-1)?.state === 'started') lease = false;
  }, async complete(started: NativeAgentSessionState, completed: NativeAgentSessionState) {
    if (JSON.stringify(state) !== JSON.stringify(started)) throw new Error('paid receipt changed');
    state = structuredClone(completed);
  }, async publish<T>(started: NativeAgentSessionState, submit: () => Promise<T>) {
    if (!lease || !authorized || JSON.stringify(state) !== JSON.stringify(started)) throw new Error('publication authority changed');
    return submit();
  } };
  const create = (limits: Partial<NativeAgentSessionBinding> = {}) => createNativeAgentSession({ gateway, binding: { ...binding, ...limits }, store, now: () => 100,
    authorize: async () => { if (!authorized || !lease) throw new Error('authority revoked'); } });
  return { create, get calls() { return calls; }, get state() { return state; }, get requestedAllowances() { return requestedAllowances; },
    reportOutputTokens: (tokens: number) => { outputTokens = tokens; },
    reportFinishReason: (value: GatewayCompletion['finishReason']) => { finishReason = value; },
    reportProviderStopReason: (value: GatewayCompletion['providerStopReason']) => { providerStopReason = value; },
    revoke: () => { authorized = false; }, changeLease: () => { lease = false; },
    loseLeaseAfterStart: () => { loseLeaseAfterStart = true; },
    revokeAfterHTTP: () => { revokeAfterHTTP = true; },
    loseAnswer: () => { loseAnswer = true; }, reportModel: (model: string) => { reportedModel = model; },
    corrupt: (mutate: (s: NativeAgentSessionState) => void) => { mutate(state!); } };
}
describe('native Agent durable SDK turns', () => {
  it.each(['historical-json', 'tool-submitted'] as const)('replays the %s review receipt through actual Session without another provider submission', async mode => {
    const text = 'The source describes a simulation, its comparison and the conditions under which its result holds.';
    const parser = { name: 'fixture', version: '1' };
    const map: DocumentSourceMap = { artifactId: 'paper', contentHash: 'b'.repeat(64), parser,
      pages: [{ page: 1, width: 100, height: 100, blocks: [{ id: 'p1', kind: 'paragraph', text,
        boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] }] };
    const submitted = { draftToolCallId: 'draft-a', fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { verdict: 'accepted' }])),
      needsMoreEvidence: [], claimSuggestions: 'unchanged' };
    const materializer = (reviewToolCompletion: boolean) => {
      const worker = createNativeScientificMaterializer(map, () => ['P00001'], { reviewToolCompletion });
      worker.draft({ fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { summary: text, sourcePassageIds: ['P00001'] }])),
        needsMoreEvidence: [], draftClaims: [{ clientKey: 'core', kind: 'core', sourceField: 'insight', statement: text,
          conditions: [], limitations: [], sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] }, 0, 'draft-a');
      return worker;
    };
    const original = { ...request, tools: [{ type: 'function', function: structuredClone(mode === 'tool-submitted'
      ? NATIVE_PAPER_COMMITTED_REVIEW_TOOL : NATIVE_PAPER_REVIEW_TOOL) }] };
    const limits = { allowedTools: ['paper_review'], maxInputBytes: 40_000 };
    const f = fixture(1, submitted, 'paper_review'); const session = f.create(limits);
    const first = await session.complete(original);
    const feedback = materializer(mode === 'tool-submitted').review(submitted, 'read-1');
    expect(feedback).toMatchObject({ status: 'review_ready', reviewToolCallId: 'read-1' });
    const next = { ...original, messages: [...original.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(feedback) }] };
    const last = await session.complete(next);
    const profile = nativePaperToolProfile(f.state);
    expect(profile.reviewToolCompletion).toBe(mode === 'tool-submitted');
    if (mode === 'historical-json') {
      expect(profile.goal).toBe('向未读过论文的人准确解释核心贡献、科学机制、代表结果及必要条件，并为后续配图保存简洁、有原文依据的六维和核心主张。');
      expect(profile.instructions).toContain('完成科学复核后直接返回完整JSON终稿');
      expect(feedback.guidance).toBe('Structure checked, not scientific approval. Correct any scientific problem through the bound source tools and another explicit review. When ready, copy the returned reviewToolCallId into the final {"reviewToolCallId":"..."}; draftToolCallId identifies the draft, not this review. Do not regenerate the full review.');
    } else {
      expect(profile.instructions).not.toContain('完成科学复核后直接返回完整JSON终稿');
      expect(profile.instructions).toContain('用paper_review提交完整终审对象');
    }
    const replayed = materializer(profile.reviewToolCompletion).review(submitted, 'read-1');
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(feedback));
    const restored = f.create({ ...limits, allowedTools: profile.allowedTools });
    const tools = profile.sourceTools.map(tool => ({ type: 'function', function: tool }));
    expect(await restored.complete({ ...original, tools })).toEqual(first);
    expect(await restored.complete({ ...next, tools, messages: [...original.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(replayed) }] })).toEqual(last);
    expect(f.calls).toBe(2);
  });
  it.each(['paid-source-only', 'candidate-and-source'])('replays the %s draft comparison receipt through actual Session identity without another model submission', async format => {
    const text = 'The source describes a simulation, its comparison and the conditions under which its result holds.';
    const parser = { name: 'fixture', version: '1' };
    const map: DocumentSourceMap = { artifactId: 'paper', contentHash: 'b'.repeat(64), parser,
      pages: [{ page: 1, width: 100, height: 100, blocks: [{ id: 'p1', kind: 'paragraph', text,
        boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] }] };
    const selection = { fieldToolCallIds: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, `field-${field}`])), claimToolCallIds: ['claim-core'], needsMoreEvidence: [] };
    const materializer = (profile: { reviewContext?: boolean; reviewCandidate?: boolean }) => {
      const worker = createNativeScientificMaterializer(map, () => ['P00001'], profile);
      SDF_CORE_FIELDS.forEach((field, order) => worker.field({ field, summary: text, sourcePassageIds: ['P00001'] }, order, `field-${field}`));
      worker.claim({ clientKey: 'core', kind: 'core', sourceField: 'insight', statement: text, conditions: [], limitations: [],
        sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }, 6, 'claim-core');
      return worker;
    };
    const paidDescription = 'Select exact successful paper_field and paper_claim calls to compose the private draft. No text regeneration: fieldToolCallIds maps each of the six fields to its own returned ID; claimToolCallIds selects required Claims. Use [] when no evidence request is needed. The existing complete science/source/Claim checks apply; this is not scientific approval. The returned reviewContext pairs this call with its complete selected source passages. Compare your saved statements, quantities, cases and conditions against them before deciding paper_review; use source tools for missing definitions, restrictions and counterexamples.';
    const original = { ...request, tools: [
      { type: 'function', function: structuredClone(NATIVE_PAPER_FIELD_TOOL) },
      { type: 'function', function: structuredClone(NATIVE_PAPER_CLAIM_TOOL) },
      { type: 'function', function: { ...structuredClone(NATIVE_PAPER_NOTE_DRAFT_TOOL),
        description: format === 'paid-source-only' ? paidDescription : NATIVE_PAPER_NOTE_DRAFT_TOOL.description } },
    ] };
    const limits = { allowedTools: ['paper_field', 'paper_claim', 'paper_draft'] };
    const f = fixture(1, selection, 'paper_draft'); const session = f.create(limits);
    const first = await session.complete(original);
    const feedback = materializer({ reviewContext: true, reviewCandidate: format === 'candidate-and-source' }).draft(selection, 7, 'read-1');
    expect(feedback.status).toBe('draft_ready');
    const next = { ...original, messages: [...original.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(feedback) }] };
    const last = await session.complete(next);
    const profile = nativePaperToolProfile(f.state);
    const replayedFeedback = materializer(profile).draft(selection, 7, 'read-1');
    expect(JSON.stringify(replayedFeedback)).toBe(JSON.stringify(feedback));
    const restored = f.create({ allowedTools: profile.allowedTools });
    const tools = profile.sourceTools.map(tool => ({ type: 'function', function: tool }));
    expect(await restored.complete({ ...original, tools })).toEqual(first);
    expect(await restored.complete({ ...next, tools, messages: [...original.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(replayedFeedback) }] })).toEqual(last);
    expect(f.calls).toBe(2);
  });
  it('replays a known missing call unchanged and continues the same paid history without repeating the original submission', async () => {
    const f = fixture(); f.reportFinishReason('other'); f.reportProviderStopReason('tool_use');
    const first = await f.create().complete(request);
    expect(first.choices[0].finish_reason).toBe('tool_calls');
    expect(first.choices[0].message.tool_calls).toBeUndefined();
    expect(f.state?.turns[0]).toMatchObject({ state: 'completed', response: { finishReason: 'other', providerStopReason: 'tool_use' } });
    const restored = f.create(); expect(await restored.complete(request)).toEqual(first); expect(f.calls).toBe(1);
    f.reportFinishReason('stop'); f.reportProviderStopReason('end_turn');
    const next = { ...request, messages: [...request.messages, first.choices[0].message,
      { role: 'user', content: 'Issue the intended tool call without repeating saved work.' }] };
    expect((await restored.complete(next)).choices[0].finish_reason).toBe('stop');
    expect(f.calls).toBe(2);
    expect(f.state?.turns[1]?.request.messages[2]?.providerContent).toEqual(completion.providerContent);
  });
  it('retains a second paid missing call but refuses another correction, including after process restart', async () => {
    const f = fixture(); f.reportFinishReason('other'); f.reportProviderStopReason('tool_use');
    const session = f.create(); const first = await session.complete(request);
    const next = { ...request, messages: [...request.messages, first.choices[0].message,
      { role: 'user', content: 'Issue the intended tool call.' }] };
    await expect(session.complete(next)).rejects.toThrow('omitted a tool call again');
    expect(f.state?.turns.at(-1)?.state).toBe('completed');
    const restored = f.create(); await restored.complete(request);
    await expect(restored.complete(next)).rejects.toThrow('omitted a tool call again');
    expect(f.calls).toBe(2);
  });
  it.each(['authority', 'turn-budget'] as const)('does not grant a missing-call continuation past the original %s', async boundary => {
    const f = fixture(); f.reportFinishReason('other'); f.reportProviderStopReason('tool_use');
    const session = f.create(boundary === 'turn-budget' ? { maxTurns: 1 } : {});
    const first = await session.complete(request);
    if (boundary === 'authority') f.revoke();
    await expect(session.complete({ ...request, messages: [...request.messages, first.choices[0].message,
      { role: 'user', content: 'Issue the intended tool call.' }] })).rejects.toThrow();
    expect(f.calls).toBe(1);
  });
  it.each(['other', 'unknown', undefined] as const)('preserves a paid unsupported stop (%s), gives an accurate response error and never resubmits it', async reason => {
    const f = fixture(); f.reportFinishReason(reason);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(f.create().complete(request)).rejects.toThrow('provider response has no valid completion or tool call');
      expect(f.state?.turns.at(-1)).toMatchObject({ state: 'completed', response: { text: completion.text } });
      expect(f.calls).toBe(1);
    }
  });
  it('replays an original paid session when its permission order differs from SDK tool order without another submission', async () => {
    const f = fixture();
    const originalPermissions = ['skills_list', 'skill_view', 'paper_read', 'paper_review'];
    const reordered = { ...request, tools: [...originalPermissions].reverse().map(name => ({ type: 'function',
      function: { name, description: `Original ${name}`, parameters: { type: 'object' } } })) };
    const original = await f.create({ allowedTools: originalPermissions }).complete(reordered);
    const profile = nativePaperToolProfile(f.state);
    const restored = f.create({ allowedTools: profile.allowedTools });
    expect(await restored.complete(reordered)).toEqual(original);
    expect(profile.allowedTools).toEqual(originalPermissions);
    profile.allowedTools.reverse();
    expect(f.state!.binding.allowedTools).toEqual(originalPermissions);
    expect(f.calls).toBe(1);
  });
  it('uses the real remaining 32139-token allowance and replays exact receipts without a new call', async () => {
    const f = fixture(3); f.reportOutputTokens(22_055);
    const limits = { maxTurns: 4, maxOutputTokens: 32_768, maxTotalOutputTokens: 98_304 };
    const session = f.create(limits);
    const calls: Array<Omit<typeof request, 'messages'> & { messages: unknown[] }> = []; const responses = [];
    let next: (typeof calls)[number] = { ...request, max_tokens: 32_768 };
    for (let index = 0; index < 3; index++) {
      calls.push(structuredClone(next));
      const response = await session.complete(next); responses.push(response);
      next = { ...next, messages: [...next.messages, response.choices[0]!.message,
        { role: 'tool', tool_call_id: `read-${index + 1}`, content: 'Original bound source' }] };
    }
    f.reportOutputTokens(10); calls.push(structuredClone(next)); responses.push(await session.complete(next));
    expect(f.requestedAllowances).toEqual([32_768, 32_768, 32_768, 32_139]);
    expect(f.state?.turns.at(-1)?.request.options.maxTokens).toBe(32_768);
    expect(f.state?.turns.at(-1)?.effectiveOptions.maxTokens).toBe(32_139);
    const restored = f.create(limits);
    for (let index = 0; index < calls.length; index++) expect(await restored.complete(calls[index])).toEqual(responses[index]);
    expect(f.calls).toBe(4);
  });
  it('retains earlier request identity without copying the same long source into every private turn', async () => {
    const f = fixture(2); const session = f.create({ maxInputBytes: 64_000_000 });
    const first = await session.complete(request);
    const unique = 'ORIGINAL_SOURCE_EVIDENCE_' + 'x'.repeat(100_000);
    const second = { ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: unique }] };
    const response = await session.complete(second);
    const third = { ...request, messages: [...second.messages, response.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-2', content: 'Next source.' }] };
    await session.complete(third);
    expect(JSON.stringify(f.state).split(unique)).toHaveLength(2);
    const restored = f.create({ maxInputBytes: 64_000_000 }); await restored.complete(request);
    const changed = structuredClone(second); changed.messages.at(-1)!.content = 'Altered original source';
    await expect(restored.complete(changed)).rejects.toThrow('changed'); expect(f.calls).toBe(3);
    const exact = f.create({ maxInputBytes: 64_000_000 }); await exact.complete(request);
    await exact.complete(second); await exact.complete(third); expect(f.calls).toBe(3);
  });
  it('uses trusted adaptive scientific settings and refuses a different replay profile before spending', async () => {
    const f = fixture(); const generation = { thinking: 'adaptive' as const, temperature: 1, topP: 0.95 };
    await f.create({ generation }).complete(request);
    expect(f.state?.turns[0]?.effectiveOptions).toMatchObject(generation);
    await expect(f.create({ generation: { ...generation, thinking: 'off' } }).complete(request)).rejects.toThrow('identity');
    expect(f.calls).toBe(1);
  });
  it('preserves a paid wrong-model response but refuses consumption and replay without resubmitting', async () => {
    const f = fixture(); f.reportModel('wrong-model');
    await expect(f.create().complete(request)).rejects.toThrow('model');
    expect(f.state?.turns.at(-1)).toMatchObject({ state: 'completed', response: { model: 'wrong-model' } });
    await expect(f.create().complete(request)).rejects.toThrow('model'); expect(f.calls).toBe(1);
  });
  it('replays a completed exact request across a fresh session without provider usage', async () => {
    const f = fixture(); const first = await f.create().complete(request);
    expect(f.calls).toBe(1); expect(f.state?.turns[0]?.state).toBe('completed');
    const restored = f.create(); expect(await restored.systemPrompt()).toBe('fixed system');
    expect(await restored.complete(request)).toEqual(first); expect(f.calls).toBe(1);
  });
  it('never reissues a started turn after a transport failure and process restart', async () => {
    const f = fixture(); f.loseAnswer(); await expect(f.create().complete(request)).rejects.toThrow();
    expect(f.state?.turns[0]?.state).toBe('started');
    await expect(f.create().complete(request)).rejects.toThrow('unknown'); expect(f.calls).toBe(1);
  });
  it('checks fresh authority before replaying a completed answer', async () => {
    const f = fixture(); await f.create().complete(request); f.revoke();
    await expect(f.create().complete(request)).rejects.toThrow('revoked'); expect(f.calls).toBe(1);
  });
  it.each(['messages', 'tools', 'max_tokens'] as const)('does not replay or spend for changed %s', async key => {
    const f = fixture(); await f.create().complete(request); const changed = structuredClone(request);
    if (key === 'messages') changed.messages[1]!.content = 'Different goal';
    else if (key === 'tools') changed.tools[0]!.function.description = 'Different tool';
    else changed.max_tokens++;
    await expect(f.create().complete(changed)).rejects.toThrow('changed'); expect(f.calls).toBe(1);
  });
  it('rejects changed source/runtime/budget identity before provider or replay', async () => {
    const f = fixture(); await f.create().complete(request); f.corrupt(s => { s.binding.sourceMapHash = 'different'; });
    await expect(f.create().complete(request)).rejects.toThrow('identity'); expect(f.calls).toBe(1);
  });
  it('fences simultaneous runners before the one paid submission', async () => {
    const f = fixture(); const results = await Promise.allSettled([f.create().complete(request), f.create().complete(request)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(f.calls).toBe(1);
  });
  it('does not publish after the owning execution lease changes', async () => {
    const f = fixture(); f.changeLease(); await expect(f.create().complete(request)).rejects.toThrow(); expect(f.calls).toBe(0);
  });
  it('does not publish if lease changed after the started receipt committed', async () => {
    const f = fixture(); f.loseLeaseAfterStart(); await expect(f.create().complete(request)).rejects.toThrow(); expect(f.calls).toBe(0);
    expect(f.state?.turns[0]?.state).toBe('started');
  });
  it('replays actual tool history across restart and then continues only the next turn', async () => {
    const f = fixture(true); const first = await f.create().complete(request);
    const second = { ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'bound source' }] };
    const restored = f.create(); expect(await restored.complete(request)).toEqual(first);
    await restored.complete(second); expect(f.calls).toBe(2);
  });
  it('rejects changed private provider blocks before a new paid turn', async () => {
    const f = fixture(true); const session = f.create(); const first = await session.complete(request);
    first.choices[0]!.message.reasoning_details![0]!.provider_content.content = [{ type: 'thinking', thinking: 'different', signature: 'forged' }];
    await expect(session.complete({ ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'bound source' }] })).rejects.toThrow('private response');
    expect(f.calls).toBe(1);
  });
  it('rejects advertising an unavailable tool before provider submission', async () => {
    const f = fixture(); const changed = structuredClone(request); changed.tools[0]!.function.name = 'terminal';
    await expect(f.create().complete(changed)).rejects.toThrow('advertised'); expect(f.calls).toBe(0);
  });
  it('refuses simultaneous replays on the same native instance without advancing twice', async () => {
    const f = fixture(); await f.create().complete(request); const restored = f.create();
    const results = await Promise.allSettled([restored.complete(request), restored.complete(request)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('retains a paid response when authority is revoked during its HTTP request', async () => {
    const f = fixture(); f.revokeAfterHTTP(); await expect(f.create().complete(request)).rejects.toThrow();
    expect(f.calls).toBe(1); expect(f.state?.turns[0]?.state).toBe('completed');
  });
  it.each(['tool', 'user'])('rejects rewritten earlier %s evidence before a third paid turn', async role => {
    const f = fixture(2); const session = f.create(); const first = await session.complete(request);
    const secondRequest = { ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'original source' }, { role: 'user', content: 'original page caption' }] };
    const second = await session.complete(secondRequest);
    const changed = structuredClone(secondRequest);
    const entry = changed.messages.find((m, index) => index > 1 && m.role === role)!;
    entry.content = 'rewritten evidence';
    await expect(session.complete({ ...changed, messages: [...changed.messages, second.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-2', content: 'second read' }] })).rejects.toThrow('history');
    expect(f.calls).toBe(2);
  });
  it('reserves the next output allowance against remaining cumulative output', async () => {
    const f = fixture(true); const session = f.create({ maxOutputTokens: 10, maxTotalOutputTokens: 10 });
    const small = { ...request, max_tokens: 10 }; const first = await session.complete(small);
    await expect(session.complete({ ...small, messages: [...small.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'source' }] })).rejects.toThrow('output budget'); expect(f.calls).toBe(1);
    const replay = f.create({ maxOutputTokens: 10, maxTotalOutputTokens: 10 });
    expect(await replay.complete(small)).toEqual(first); expect(f.calls).toBe(1);
  });
  it('retains a paid overrun but refuses consumption beyond the actual remaining allowance', async () => {
    const f = fixture(true); const session = f.create({ maxOutputTokens: 10, maxTotalOutputTokens: 15 });
    const small = { ...request, max_tokens: 10 }; const first = await session.complete(small);
    await expect(session.complete({ ...small, messages: [...small.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'source' }] })).rejects.toThrow('exceeded reserved');
    expect(f.requestedAllowances).toEqual([10, 5]);
    expect(f.state?.turns.at(-1)?.state).toBe('completed'); expect(f.calls).toBe(2);
  });
  it('rejects oversized input before persisting started or submitting', async () => {
    const f = fixture(); await expect(f.create({ maxInputBytes: 20 }).complete(request)).rejects.toThrow('byte budget');
    expect(f.state).toBeNull(); expect(f.calls).toBe(0);
  });
  it('retains but does not consume an output that exceeded its reserved limit', async () => {
    const f = fixture(); await expect(f.create().complete({ ...request, max_tokens: 5 })).rejects.toThrow('exceeded reserved');
    expect(f.state?.turns[0]?.state).toBe('completed'); expect(f.calls).toBe(1);
    await expect(f.create().complete({ ...request, max_tokens: 5 })).rejects.toThrow('exceeded reserved'); expect(f.calls).toBe(1);
  });
  it('budgets actual provider body rather than duplicated private normalized fields', async () => {
    const seed = fixture(true); const first = await seed.create().complete(request);
    const second = { ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'bound source' }] };
    const normalized = nativeAgentSdkRequest(second, binding.model);
    let actualBody = '';
    const baseline = new AnthropicCompatProvider('minimax', { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: binding.model }, async (_url, opts) => {
      actualBody = String(opts?.body); return new Response(JSON.stringify({ model: binding.model, content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
    });
    await baseline.complete({ model: binding.model, ...normalized.options, messages: normalized.messages });
    const limit = Buffer.byteLength(actualBody, 'utf8');
    expect(Buffer.byteLength(JSON.stringify(normalized), 'utf8')).toBeGreaterThan(limit);
    const f = fixture(true); const session = f.create({ maxInputBytes: limit }); await session.complete(request);
    await session.complete(second); expect(f.calls).toBe(2);
  });
  it('accepts native JSON argument key sorting while keeping complete provider blocks exact', async () => {
    const f = fixture(true, { name: 'paper-method', file_path: 'references/geometry.md' });
    const session = f.create(); const first = await session.complete(request);
    first.choices[0]!.message.tool_calls![0]!.function.arguments = '{"file_path":"references/geometry.md","name":"paper-method"}';
    await session.complete({ ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'full source reference' }] });
    expect(f.calls).toBe(2);
  });
});
