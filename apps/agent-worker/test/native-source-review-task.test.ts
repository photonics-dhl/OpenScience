import { describe, expect, it, vi } from 'vitest';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { AiGateway, AnthropicCompatProvider, type ChatMessage, type TextProvider } from '@openscience/ai-gateway';
import type { DocumentSourceMap } from '@openscience/domain';
import { createNativeScientificMaterializer } from '../src/extractor';
import { createNativeSourceReviewTools, LEGACY_NATIVE_SOURCE_REVIEW_TOOLS, NATIVE_SOURCE_REVIEW_TOOLS,
  nativeSourceReviewToolProfile, runNativeSourceReviewTask } from '../src/native-agent/source-review-task';
import { createNativeAgentSession, type NativeAgentSessionState } from '../src/native-agent/session';
import type { runHostedNativeTask } from '../src/native-agent/host-task';

const seam = vi.hoisted(() => ({ host: vi.fn(), store: vi.fn() }));
vi.mock('../src/native-agent/host-task', () => ({ runHostedNativeTask: seam.host }));
vi.mock('../src/native-agent/task-store', () => ({ createNativeTaskStore: seam.store }));

const parser = { name: 'fixture', version: '1' };
const text = 'The numerical model predicts coherent radiation from electrons passing through a bounded optical field under the stated geometry.';
const map: DocumentSourceMap = { artifactId: 'paper', contentHash: 'a'.repeat(64), parser, pages: [{ page: 1, width: 100, height: 100,
  blocks: [{ id: 'body', kind: 'paragraph', text, boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] }] };
const sourceAgentTaskId = 'author-task';
const decision = () => ({ sourceAgentTaskId, fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { verdict: 'accepted' }])),
  needsMoreEvidence: [], claimSuggestions: 'unchanged' });
const replacementClaims = () => [
  { clientKey: 'reviewed-core', kind: 'core', sourceField: 'insight',
    statement: 'The numerical model predicts coherent radiation under the stated optical geometry.',
    conditions: ['The stated geometry is assumed.'], limitations: ['This is a numerical prediction.'],
    sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] },
  { clientKey: 'reviewed-support', parentClientKey: 'reviewed-core', kind: 'supporting', sourceField: 'results',
    statement: text, conditions: [], limitations: [], sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] },
];
function authorResult(sourceMap: DocumentSourceMap = map) {
  const draft = { fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { summary: text, sourcePassageIds: ['P00001'] }])),
    needsMoreEvidence: [], draftClaims: [{ clientKey: 'core', sourceField: 'insight', kind: 'core', statement: text,
      conditions: [], limitations: [], sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] };
  const materializer = createNativeScientificMaterializer(sourceMap, () => ['P00001']);
  expect(materializer.draft(draft, 0, 'actual-author-draft').status).toBe('draft_ready');
  const { nativeScientificFields, nativeDraftClaims, nativeNeedsMoreEvidence: _evidence, nativeReviewedCandidateHash: _hash, ...result } = materializer.finish(JSON.stringify({
    draftToolCallId: 'actual-author-draft', fields: decision().fields, needsMoreEvidence: [], claimSuggestions: 'unchanged' }));
  void _evidence; void _hash;
  return { ...result, scientificReview: { kind: 'hermes_agent_review', contractVersion: '5', status: 'review_received',
    fieldReviews: nativeScientificFields, draftClaims: nativeDraftClaims } };
}
const tools = (sourceResult: unknown = authorResult()) => createNativeSourceReviewTools({ sourceMap: map, sourceAgentTaskId, sourceResult, renderPages: async () => [] });
const pair = (id: string, name: string, args: unknown, result: unknown): ChatMessage[] => [
  { role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
  { role: 'tool', toolCallId: id, content: JSON.stringify(result) },
];
async function reviewed() {
  const worker = tools();
  const candidate = await worker.call('paper_candidate', {}, 0, 'read-candidate');
  const review = await worker.call('paper_review', decision(), 1, 'review');
  expect(review.status).toBe('review_ready');
  return { worker, candidate, review, messages: [...pair('read-candidate', 'paper_candidate', {}, candidate), ...pair('review', 'paper_review', decision(), review)] };
}

describe('independent native source review using the existing scientific materializer', () => {
  it.each([
    { mode: 'new', legacyClaimsReview: false, choice: 'unchanged' },
    { mode: 'new', legacyClaimsReview: false, choice: 'array' },
    { mode: 'legacy', legacyClaimsReview: true, choice: 'unchanged' },
    { mode: 'legacy', legacyClaimsReview: true, choice: 'array' },
  ] as const)('keeps $mode $choice valid receipt guidance consistent with its actual review tools', async ({ legacyClaimsReview, choice }) => {
    const worker = createNativeSourceReviewTools({ sourceMap: map, sourceAgentTaskId, sourceResult: authorResult(),
      renderPages: async () => [], legacyClaimsReview });
    const candidate = await worker.call('paper_candidate', {}, 0, 'candidate');
    const name = !legacyClaimsReview && choice === 'array' ? 'paper_review_claims' : 'paper_review';
    const submitted = { ...decision(), claimSuggestions: choice === 'array' ? replacementClaims() : 'unchanged' };
    const baseline = createNativeScientificMaterializer(map, () => ['P00001'], {
      boundDraft: { sourceAgentTaskId, draft: worker.boundDraft }, reviewToolCompletion: true,
    });
    const { sourceAgentTaskId: _author, ...body } = submitted; void _author;
    const original: Record<string, unknown> = { ...baseline.review({ ...body, draftToolCallId: sourceAgentTaskId }, 'review'), sourceAgentTaskId };
    const receipt = await worker.call(name, submitted, 1, 'review');
    expect(receipt.status).toBe('review_ready');
    const expectedClaims = choice === 'array' ? replacementClaims() : authorResult().scientificReview.draftClaims;
    expect(receipt).toMatchObject({ reviewedCandidate: { claimSuggestions: expectedClaims } });
    expect(worker.finish([...pair('candidate', 'paper_candidate', {}, candidate),
      ...pair('review', name, submitted, receipt)]).nativeDraftClaims).toEqual(expectedClaims);
    if (legacyClaimsReview) {
      expect(JSON.stringify(receipt)).toBe(JSON.stringify(original));
    } else {
      const { guidance: originalGuidance, ...originalPayload } = original;
      const { guidance, ...payload } = receipt;
      expect(payload).toEqual(originalPayload);
      expect(guidance).toContain('paper_review_claims');
      expect(guidance).toMatch(/paper_review\b/);
      expect(guidance).toContain('ORIGINAL');
      expect(guidance).not.toContain('through this same tool');
      const scienceGuidance = String(originalGuidance).split(' If a contradiction remains,')[0]!;
      expect(guidance).toContain(scienceGuidance);
      if (choice === 'unchanged') {
        const description = NATIVE_SOURCE_REVIEW_TOOLS.find(tool => tool.name === name)!.description;
        expect(description).toContain('ORIGINAL');
        expect(description).toContain('paper_review_claims');
        expect(description).not.toContain('Explicitly choose Claims unchanged or supply full replacements.');
        expect(description).not.toContain('correct through this tool if needed');
      }
    }
  });

  it.each([
    { mode: 'new', legacyClaimsReview: false, choice: 'unchanged' },
    { mode: 'new', legacyClaimsReview: false, choice: 'array' },
    { mode: 'legacy', legacyClaimsReview: true, choice: 'unchanged' },
    { mode: 'legacy', legacyClaimsReview: true, choice: 'array' },
  ] as const)('retains scientific diagnostics in the $mode $choice invalid receipt with the correct retry interface', async ({ legacyClaimsReview, choice }) => {
    const worker = createNativeSourceReviewTools({ sourceMap: map, sourceAgentTaskId, sourceResult: authorResult(),
      renderPages: async () => [], legacyClaimsReview });
    const candidate = await worker.call('paper_candidate', {}, 0, 'candidate');
    const name = !legacyClaimsReview && choice === 'array' ? 'paper_review_claims' : 'paper_review';
    const submitted = { ...decision(), claimSuggestions: choice === 'array' ? replacementClaims() : 'unchanged',
      fields: { ...decision().fields, results: { verdict: 'revised', summary: 'This is a numerical prediction under the stated geometry.', sourcePassageIds: ['P99999'],
        issues: [{ code: 'QUALIFIER_LOSS', problem: 'Retain the numerical model qualification.', sourcePassageIds: ['P99999'] }] } } };
    const baseline = createNativeScientificMaterializer(map, () => ['P00001'], {
      boundDraft: { sourceAgentTaskId, draft: worker.boundDraft }, reviewToolCompletion: true,
    });
    const { sourceAgentTaskId: _author, ...body } = submitted; void _author;
    const original: Record<string, unknown> = { ...baseline.review({ ...body, draftToolCallId: sourceAgentTaskId }, 'invalid'), sourceAgentTaskId };
    const receipt = await worker.call(name, submitted, 1, 'invalid');
    expect(receipt.status).toBe('invalid_review');
    expect(receipt.feedback).toContain('[blocked] Native science contract:');
    expect(() => worker.finish([...pair('candidate', 'paper_candidate', {}, candidate),
      ...pair('invalid', name, submitted, receipt)])).toThrow();
    const corrected = structuredClone(body);
    corrected.fields.results.sourcePassageIds = ['P00001'];
    corrected.fields.results.issues[0]!.sourcePassageIds = ['P00001'];
    expect(baseline.review({ ...corrected, draftToolCallId: sourceAgentTaskId }, 'corrected').status).toBe('review_ready');
    if (legacyClaimsReview) {
      expect(JSON.stringify(receipt)).toBe(JSON.stringify(original));
    } else {
      expect(receipt.feedback).not.toContain('draftToolCallId');
      expect(receipt.feedback).toContain('sourceAgentTaskId');
      expect(receipt.feedback).toContain('paper_review_claims');
      expect(receipt.feedback).toMatch(/paper_review\b/);
      expect(receipt.feedback).not.toContain('claimSuggestions明确选unchanged或完整数组');
      const diagnostics = String(original.feedback).split('\n').slice(0, -1).join('\n');
      expect(diagnostics).toContain('结构诊断不是科学通过');
      expect(receipt.feedback).toContain(diagnostics.replaceAll('draftToolCallId', 'sourceAgentTaskId'));
    }
  });

  it('saves complete replacement Claims through the explicit paper_review_claims tool and returns the merged candidate', async () => {
    const worker = tools();
    const candidate = await worker.call('paper_candidate', {}, 0, 'candidate');
    const claimSuggestions = replacementClaims();
    const submitted = { ...decision(), claimSuggestions };
    const receipt = await worker.call('paper_review_claims', submitted, 1, 'replace-claims');
    expect(receipt).toMatchObject({ status: 'review_ready', reviewToolCallId: 'replace-claims', sourceAgentTaskId,
      reviewedCandidate: { claimSuggestions } });
    const final = worker.finish([...pair('candidate', 'paper_candidate', {}, candidate),
      ...pair('replace-claims', 'paper_review_claims', submitted, receipt)]);
    expect(final.core).toEqual(authorResult().core);
    expect(final.reviewedClaimSuggestions?.map(claim => claim.statement)).toEqual(claimSuggestions.map(claim => claim.statement));
    expect(final.nativeDraftClaims).toEqual(claimSuggestions);
  });

  it('rejects a valid Claim array sent to the new unchanged-only paper_review tool', async () => {
    const worker = tools(); const candidate = await worker.call('paper_candidate', {}, 0, 'candidate');
    const submitted = { ...decision(), claimSuggestions: replacementClaims() };
    const receipt = await worker.call('paper_review', submitted, 1, 'wrong-tool');
    expect(receipt).toMatchObject({ status: 'invalid_review' });
    expect(receipt).not.toHaveProperty('reviewedCandidate');
    expect(() => worker.finish([...pair('candidate', 'paper_candidate', {}, candidate),
      ...pair('wrong-tool', 'paper_review', submitted, receipt)])).toThrow();
  });

  it('uses the fresh profile to submit real replacement Claims through the array-only tool', async () => {
    const profile = nativeSourceReviewToolProfile(null);
    const worker = createNativeSourceReviewTools({ sourceMap: map, sourceAgentTaskId, sourceResult: authorResult(),
      renderPages: async () => [], legacyClaimsReview: profile.legacyClaimsReview });
    const candidate = await worker.call('paper_candidate', {}, 0, 'candidate');
    const submitted = { ...decision(), claimSuggestions: replacementClaims() };
    expect(profile.sourceTools.some(tool => tool.name === 'paper_review_claims')).toBe(true);
    const receipt = await worker.call('paper_review_claims', submitted, 1, 'replacement');
    expect(receipt.status).toBe('review_ready');
    expect(worker.finish([...pair('candidate', 'paper_candidate', {}, candidate),
      ...pair('replacement', 'paper_review_claims', submitted, receipt)]).nativeDraftClaims).toEqual(submitted.claimSuggestions);
  });

  it.each(['claimSuggestions', 'conditions', 'limitations', 'sourceBindings'] as const)(
    'rejects an item wrapper at %s without coercion or a usable review receipt', async wrapped => {
      const worker = tools(); const candidate = await worker.call('paper_candidate', {}, 0, 'candidate');
      const claims = replacementClaims();
      const submitted: Record<string, unknown> = { ...decision(), claimSuggestions: claims };
      if (wrapped === 'claimSuggestions') submitted.claimSuggestions = { item: claims };
      else (claims[0] as Record<string, unknown>)[wrapped] = { item: claims[0]![wrapped] };
      const before = structuredClone(submitted);
      const receipt = await worker.call('paper_review_claims', submitted, 1, 'wrapped');
      expect(receipt).toMatchObject({ status: 'invalid_review' });
      expect(receipt).not.toHaveProperty('reviewedCandidate'); expect(submitted).toEqual(before);
      expect(() => worker.finish([...pair('candidate', 'paper_candidate', {}, candidate),
        ...pair('wrapped', 'paper_review_claims', submitted, receipt)])).toThrow();
    });

  it('rejects unchanged on the explicit Claim replacement tool', async () => {
    const worker = tools(); const candidate = await worker.call('paper_candidate', {}, 0, 'candidate');
    const receipt = await worker.call('paper_review_claims', decision(), 1, 'wrong-tool');
    expect(receipt).toMatchObject({ status: 'invalid_review' });
    expect(() => worker.finish([...pair('candidate', 'paper_candidate', {}, candidate),
      ...pair('wrong-tool', 'paper_review_claims', decision(), receipt)])).toThrow();
  });

  it.each([
    ['paper_review', 'paper_review'], ['paper_review', 'paper_review_claims'],
    ['paper_review_claims', 'paper_review'], ['paper_review_claims', 'paper_review_claims'],
  ] as const)('cannot adopt valid %s after a newer rejected %s decision', async (firstTool, nextTool) => {
    const worker = tools(); const candidate = await worker.call('paper_candidate', {}, 0, 'candidate');
    const firstArgs = { ...decision(), claimSuggestions: firstTool === 'paper_review' ? 'unchanged' : replacementClaims() };
    const firstReceipt = await worker.call(firstTool, firstArgs, 1, 'good');
    expect(firstReceipt.status).toBe('review_ready');
    const nextArgs = { ...decision(), sourceAgentTaskId: 'foreign-author',
      claimSuggestions: nextTool === 'paper_review' ? 'unchanged' : replacementClaims() };
    const rejected = await worker.call(nextTool, nextArgs, 2, 'bad');
    expect(rejected.status).toBe('invalid_review');
    expect(() => worker.finish([...pair('candidate', 'paper_candidate', {}, candidate),
      ...pair('good', firstTool, firstArgs, firstReceipt), ...pair('bad', nextTool, nextArgs, rejected)])).toThrow();
  });

  it.each(['paper_review', 'paper_review_claims'] as const)(
    'adopts the latest successful %s decision and unchanged selects the original author Claims', async finalTool => {
      const original = authorResult(); const worker = tools(original);
      const candidate = await worker.call('paper_candidate', {}, 0, 'candidate');
      const firstTool = finalTool === 'paper_review' ? 'paper_review_claims' : 'paper_review';
      const firstArgs = { ...decision(), claimSuggestions: firstTool === 'paper_review' ? 'unchanged' : replacementClaims() };
      const firstReceipt = await worker.call(firstTool, firstArgs, 1, 'first');
      expect(firstReceipt.status).toBe('review_ready');
      const finalArgs = { ...decision(), claimSuggestions: finalTool === 'paper_review' ? 'unchanged' : replacementClaims() };
      const finalReceipt = await worker.call(finalTool, finalArgs, 2, 'latest');
      expect(finalReceipt.status).toBe('review_ready');
      const result = worker.finish([...pair('candidate', 'paper_candidate', {}, candidate),
        ...pair('first', firstTool, firstArgs, firstReceipt), ...pair('latest', finalTool, finalArgs, finalReceipt)]);
      const expected = finalTool === 'paper_review' ? original.scientificReview.draftClaims : replacementClaims();
      expect(result.nativeDraftClaims).toEqual(expected);
      expect(finalReceipt).toMatchObject({ reviewedCandidate: { claimSuggestions: expected } });
      expect(original).toEqual(authorResult());
    });

  it.each(['paper_review', 'paper_review_claims'] as const)('runs %s through actual Session/Gateway while keeping the private baseline out of host config', async reviewTool => {
    let state: NativeAgentSessionState | null = null;
    const store = { async read() { return structuredClone(state); },
      async compareAndSet(expected: NativeAgentSessionState | null, next: NativeAgentSessionState) {
        expect(state).toEqual(expected); state = structuredClone(next);
      },
      async complete(expected: NativeAgentSessionState, next: NativeAgentSessionState) {
        expect(state).toEqual(expected); state = structuredClone(next);
      },
      async publish<T>(expected: NativeAgentSessionState, submit: () => Promise<T>) {
        expect(state).toEqual(expected); return submit();
      } };
    seam.store.mockReturnValue(store);
    let calls = 0;
    const preflight = new AnthropicCompatProvider('minimax', { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: 'MiniMax-M3' }, async () => { throw new Error('No HTTP'); });
    const provider: TextProvider = { name: 'minimax', model: 'MiniMax-M3', preflightNativeTools: opts => preflight.preflightNativeTools(opts), async complete() {
      calls++;
      const common = { model: 'MiniMax-M3', usage: { inputTokens: 20, outputTokens: 10 } };
      if (calls <= 2) {
        const name = calls === 1 ? 'paper_candidate' : reviewTool;
        const args = calls === 1 ? {} : { ...decision(), claimSuggestions: reviewTool === 'paper_review' ? 'unchanged' : replacementClaims() };
        return { ...common, text: '', finishReason: 'tool_calls',
          toolCalls: [{ id: `call-${calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
          providerContent: { provider: 'minimax', model: 'MiniMax-M3', content: [{ type: 'tool_use', id: `call-${calls}`, name, input: args }] } };
      }
      return { ...common, text: 'Independent review saved.', finishReason: 'stop' };
    } };
    const gateway = new AiGateway({ providers: [provider] });
    const authorize = vi.fn(async () => undefined);
    seam.host.mockImplementation(async (input: Parameters<typeof runHostedNativeTask>[0]) => {
      expect(Object.keys(input.config).sort()).toEqual(['contextWindowTokens', 'goal', 'instructions', 'maxOutputTokens', 'maxTurns', 'model', 'runtimeId', 'skillCatalogueId', 'sourceTools', 'taskId'].sort());
      expect(JSON.stringify(input.config)).not.toContain(text);
      expect(JSON.stringify(input.config)).not.toContain('d'.repeat(64));
      expect(input.config.sourceTools.map(tool => tool.name)).toEqual(expect.arrayContaining(['paper_review', 'paper_review_claims']));
      const request = { model: input.config.model, max_tokens: input.config.maxOutputTokens,
        messages: [{ role: 'system', content: input.config.instructions }, { role: 'user', content: input.config.goal }] as unknown[],
        tools: [...['skills_list', 'skill_view'].map(name => ({ name, description: name, parameters: { type: 'object' } })),
          ...input.config.sourceTools].map(tool => ({ type: 'function', function: tool })) };
      for (let i = 0; i < 2; i++) {
        await input.authorize();
        const response = await input.session.complete(request); const message = response.choices[0]!.message;
        const call = message.tool_calls![0]!;
        const result = await input.paper.call(call.function.name, JSON.parse(call.function.arguments), i, call.id);
        request.messages.push(message, { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      const final = await input.session.complete(request);
      return { finalResponse: final.choices[0]!.message.content, observedPassageIds: input.paper.observedPassageIds };
    });
    const input: Parameters<typeof runNativeSourceReviewTask>[0] = { gateway, deps: { prisma: { $transaction: async (fn: (tx: never) => Promise<void>) => fn({} as never) } } as never,
      task: { id: 'review-task', executionAttempt: 1, result: { nativeAgentExecution: {
        kind: 'hermes-agent', profile: 'paper-source-review', runtimeId: 'runtime', skillCatalogueId: 'catalogue', model: 'MiniMax-M3' } } },
      sourceMap: map, sourceMapRef: { artifactId: map.artifactId, contentHash: map.contentHash, serializedSha256: 'c'.repeat(64) } as never,
      sourceAgentTaskId, authorCheckpointSha256: 'd'.repeat(64), sourceResult: authorResult(), inboxRoot: 'unused', renderPages: async () => [], authorize };
    const result = await runNativeSourceReviewTask(input);
    const saved = await store.read();
    expect(calls).toBe(3); expect(authorize).toHaveBeenCalled();
    expect(saved?.binding.sourceReview).toMatchObject({ sourceAgentTaskId, authorCheckpointSha256: 'd'.repeat(64),
      boundDraft: { fields: { method: { summary: text } }, draftClaims: [{ statement: text }] } });
    expect(saved?.initialMessages.some(m => m.content.includes(text))).toBe(false);
    expect(saved?.turns.at(-1)?.request.messages.some(m => m.role === 'tool' && m.content.includes(text))).toBe(true);
    const committed = saved?.turns.at(-1)?.request.messages.find(m => m.role === 'tool' && m.toolCallId === 'call-2');
    expect(JSON.parse(committed!.content)).toMatchObject({ reviewedCandidate: {
      fields: { results: { summary: text } }, claimSuggestions: reviewTool === 'paper_review' ? [{ statement: text }] : replacementClaims(),
    } });
    expect(result.scientificReview).toMatchObject({ kind: 'hermes_agent_review', profile: 'paper-source-review', sourceAgentTaskId,
      status: 'review_received', provider: 'minimax', model: 'MiniMax-M3', promptHash: saved?.turns.at(-1)?.target.promptHash });
    expect(result).not.toHaveProperty('nativeDraftClaims'); expect(result.scientificReview).not.toHaveProperty('draftClaims');
    expect(result.core.method).toBe(text);
    expect(result.reviewedClaimSuggestions?.map(claim => claim.statement)).toEqual(reviewTool === 'paper_review'
      ? [text] : replacementClaims().map(claim => claim.statement));
    expect(nativeSourceReviewToolProfile(saved).legacyClaimsReview).toBe(false);
    expect(await runNativeSourceReviewTask(input)).toEqual(result);
    expect(calls).toBe(3); expect(await store.read()).toEqual(saved);
  });

  it.each([
    { mode: 'legacy', legacy: true, choice: 'unchanged' }, { mode: 'legacy', legacy: true, choice: 'array' },
    { mode: 'split', legacy: false, choice: 'unchanged' }, { mode: 'split', legacy: false, choice: 'array' },
  ] as const)('replays paid $mode $choice review using its original schema and description without HTTP', async ({ legacy, choice }) => {
    let state: NativeAgentSessionState | null = null; let calls = 0;
    const store = { async read() { return structuredClone(state); },
      async compareAndSet(expected: NativeAgentSessionState | null, next: NativeAgentSessionState) {
        expect(state).toEqual(expected); state = structuredClone(next);
      },
      async complete(expected: NativeAgentSessionState, next: NativeAgentSessionState) {
        expect(state).toEqual(expected); state = structuredClone(next);
      },
      async publish<T>(expected: NativeAgentSessionState, submit: () => Promise<T>) {
        expect(state).toEqual(expected); return submit();
      } };
    const submitted = { ...decision(), claimSuggestions: choice === 'unchanged' ? 'unchanged' : replacementClaims() };
    const reviewTool = legacy || choice === 'unchanged' ? 'paper_review' : 'paper_review_claims';
    const currentTools = legacy ? LEGACY_NATIVE_SOURCE_REVIEW_TOOLS : NATIVE_SOURCE_REVIEW_TOOLS;
    const paidTools: Array<{ name: string; description: string; parameters: Record<string, unknown> }> = structuredClone(currentTools);
    const paidReview = paidTools.find(tool => tool.name === reviewTool)!;
    paidReview.description += ' Original paid review method description.';
    paidReview.parameters = { ...paidReview.parameters, properties: {
      ...paidReview.parameters.properties as Record<string, unknown>,
      sourceAgentTaskId: { type: 'string', minLength: 1, description: 'Original paid author selector.' },
    } };
    const provider = new AnthropicCompatProvider('minimax', {
      baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: 'MiniMax-M3',
    }, async () => {
      calls++;
      const name = calls === 1 ? 'paper_candidate' : reviewTool; const input = calls === 1 ? {} : submitted;
      return new Response(JSON.stringify({ model: 'MiniMax-M3', usage: { input_tokens: 20, output_tokens: 10 },
        stop_reason: calls <= 2 ? 'tool_use' : 'end_turn', content: calls <= 2
          ? [{ type: 'tool_use', id: `legacy-${calls}`, name, input }]
          : [{ type: 'text', text: 'Historical independent review saved.' }] }));
    });
    const gateway = new AiGateway({ providers: [provider] });
    const binding = { taskId: 'legacy-review-task', artifactId: map.artifactId, documentSha256: map.contentHash,
      sourceMapHash: 'c'.repeat(64), runtimeId: 'runtime', skillCatalogueId: 'catalogue', model: 'MiniMax-M3',
      allowedTools: paidTools.map(tool => tool.name), maxTurns: 3,
      maxOutputTokens: 100, maxTotalOutputTokens: 1000, maxInputBytes: 100000, deadlineAt: Date.now() + 60000 };
    const createSession = () => createNativeAgentSession({ gateway, binding, store, authorize: async () => {} });
    const drive = async (session: ReturnType<typeof createSession>, sourceTools: typeof paidTools,
      legacyClaimsReview: boolean) => {
      const worker = createNativeSourceReviewTools({ sourceMap: map, sourceAgentTaskId, sourceResult: authorResult(),
        renderPages: async () => [], legacyClaimsReview });
      const request = { model: binding.model, max_tokens: 100,
        messages: [{ role: 'system', content: 'Original paid source review instructions.' },
          { role: 'user', content: 'Review the original candidate.' }] as unknown[],
        tools: sourceTools.map(tool => ({ type: 'function', function: tool })) };
      for (let sequence = 0; sequence < 2; sequence++) {
        const response = await session.complete(request); const message = response.choices[0]!.message;
        const call = message.tool_calls![0]!;
        const receipt = await worker.call(call.function.name, JSON.parse(call.function.arguments), sequence, call.id);
        expect(receipt.status).toBe(sequence === 0 ? 'candidate_ready' : 'review_ready');
        request.messages.push(message, { role: 'tool', tool_call_id: call.id, content: JSON.stringify(receipt) });
      }
      const final = await session.complete(request);
      const saved = await store.read();
      return { final, result: worker.finish(saved!.turns.at(-1)!.request.messages) };
    };
    const original = await drive(createSession(), paidTools, legacy);
    const saved = await store.read(); const profile = nativeSourceReviewToolProfile(saved);
    const originalCheckpoint = structuredClone(saved);
    expect(profile.legacyClaimsReview).toBe(legacy);
    expect(profile.sourceTools.map(tool => ({ type: 'function', function: tool }))).toEqual(saved!.turns[0]!.request.options.tools);
    expect(profile.sourceTools.some(tool => tool.name === 'paper_review_claims')).toBe(!legacy);
    expect(original.result.nativeDraftClaims).toEqual(choice === 'unchanged' ? authorResult().scientificReview.draftClaims : replacementClaims());
    expect(await drive(createSession(), profile.sourceTools, profile.legacyClaimsReview)).toEqual(original);
    await expect(drive(createSession(), currentTools, legacy)).rejects.toThrow('tool definitions changed');
    const copiedReview = profile.sourceTools.find(tool => tool.name === reviewTool)!;
    copiedReview.description = 'Caller mutation after replay';
    const copiedProperties = copiedReview.parameters.properties as Record<string, Record<string, unknown>>;
    copiedProperties.sourceAgentTaskId!.minLength = 2;
    expect(saved).toEqual(originalCheckpoint);
    expect(calls).toBe(3); expect(await store.read()).toEqual(originalCheckpoint);
  });
  it('delivers the actual author fields, full Claims and full selected source through a real tool response', async () => {
    const worker = tools();
    expect(worker.observedPassageIds).toEqual([]);
    expect((await worker.call('paper_review', decision(), 0, 'early')).status).toBe('invalid_review');
    const candidate = await worker.call('paper_candidate', {}, 1, 'candidate');
    expect(candidate).toMatchObject({ status: 'candidate_ready', sourceAgentTaskId,
      passages: [{ id: 'P00001', text }], draftClaims: [{ statement: text, sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] });
    expect(worker.observedPassageIds).toEqual(['P00001']);
    expect((candidate.fields as Record<string, { summary: string }>).method!.summary).toBe(text);
  });
  it('finishes from the latest actual reviewed artifact without asking the reviewer to rewrite a draft', async () => {
    const { worker, messages } = await reviewed();
    expect(worker.finish(messages).core.method).toBe(text);
    expect(NATIVE_SOURCE_REVIEW_TOOLS.map(tool => tool.name)).not.toEqual(expect.arrayContaining(['paper_field', 'paper_claim', 'paper_draft']));
    for (const name of ['paper_field', 'paper_claim', 'paper_draft']) expect(await worker.call(name, {})).toHaveProperty('error');
  });
  it('returns the consolidated reviewed fields and Claims so a correction can be checked against retained text', async () => {
    const worker = tools();
    const candidate = await worker.call('paper_candidate', {}, 0, 'candidate');
    const summary = 'This is a numerical prediction under the stated optical geometry.';
    const revised = { ...decision(), fields: { ...decision().fields,
      limitations: { verdict: 'revised', summary, sourcePassageIds: ['P00001'],
        issues: [{ code: 'QUALIFIER_LOSS', problem: 'Retain the numerical model qualification.', sourcePassageIds: ['P00001'] }] } } };
    const receipt = await worker.call('paper_review', revised, 1, 'review');
    expect(receipt).toMatchObject({ status: 'review_ready', reviewToolCallId: 'review', sourceAgentTaskId,
      reviewedCandidate: { fields: { results: { verdict: 'accepted', summary: text, sourcePassageIds: ['P00001'] },
        limitations: { verdict: 'revised', summary } },
        claimSuggestions: [{ statement: text, sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }],
        needsMoreEvidence: [] } });
    const messages = [...pair('candidate', 'paper_candidate', {}, candidate), ...pair('review', 'paper_review', revised, receipt)];
    const final = worker.finish(messages);
    expect(final.core.results).toBe(text);
    expect(final.core.limitations).toBe(summary);
    expect((receipt.reviewedCandidate as { fields: unknown }).fields).toEqual(final.nativeScientificFields);
    const rejected = await worker.call('paper_review', { ...revised, sourceAgentTaskId: 'foreign' }, 2, 'rejected');
    expect(rejected).toMatchObject({ status: 'invalid_review' });
    expect(rejected).not.toHaveProperty('reviewedCandidate');
  });
  function persistedAuthorWithCoordinateDrift() {
    const sourceMap = structuredClone(map);
    sourceMap.pages[0]!.width = 612;
    sourceMap.pages[0]!.blocks[0]!.boundingBox.x = 53.999999999999886;
    const saved = JSON.parse(JSON.stringify(authorResult(sourceMap))) as ReturnType<typeof authorResult>;
    for (const field of SDF_CORE_FIELDS) {
      saved.evidenceSegments![field][0]!.sourceLocator.boundingBox!.x = 53.99999999999989;
      const location = saved.evidenceLocation![field];
      if (location.status === 'located') location.sourceLocator.boundingBox!.x = 53.99999999999989;
    }
    return { sourceMap, saved };
  }
  it('reads a persisted author with only IEEE-754 locator drift without changing saved data', async () => {
    const { sourceMap, saved } = persistedAuthorWithCoordinateDrift(); const before = structuredClone(saved);
    const worker = createNativeSourceReviewTools({ sourceMap, sourceAgentTaskId, sourceResult: saved, renderPages: async () => [] });
    expect((await worker.call('paper_candidate', {})).status).toBe('candidate_ready');
    expect(saved).toEqual(before);
  });
  it.each(['box', 'artifact', 'block', 'page', 'range', 'quote'] as const)('still rejects real persisted source %s changes', change => {
    const { sourceMap, saved } = persistedAuthorWithCoordinateDrift();
    const segment = saved.evidenceSegments!.method[0]!, locator = segment.sourceLocator;
    if (change === 'box') locator.boundingBox!.x += 0.001;
    if (change === 'artifact') locator.artifactId = 'different-paper';
    if (change === 'block') locator.blockId = 'different-block';
    if (change === 'page') locator.page = 2;
    if (change === 'range') locator.charRange!.start += 1;
    if (change === 'quote') segment.quote = 'Different scientific source.';
    expect(() => createNativeSourceReviewTools({ sourceMap, sourceAgentTaskId, sourceResult: saved, renderPages: async () => [] })).toThrow();
  });
  it.each(['core', 'fieldReviews', 'draftClaims', 'evidenceSegments'])('rejects changed author %s before starting a reviewer', key => {
    const original = authorResult();
    if (key === 'core') original.core.method = 'Changed saved public content.';
    else if (key === 'fieldReviews') (original.scientificReview.fieldReviews as Record<string, { summary: string }>).method!.summary = 'Changed final field.';
    else if (key === 'draftClaims') (original.scientificReview.draftClaims as Array<{ statement: string }>)[0]!.statement = 'Changed raw Claim.';
    else original.evidenceSegments!.method[0]!.quote = 'Changed original source.';
    expect(() => tools(original)).toThrow();
  });
  it('rejects a foreign author ID and preserves the source object against caller mutation', async () => {
    const original = authorResult(); const worker = tools(original); original.core.method = 'Caller mutation.';
    const candidate = await worker.call('paper_candidate', {});
    expect((candidate.fields as Record<string, { summary: string }>).method!.summary).toBe(text);
    expect((await worker.call('paper_review', { ...decision(), sourceAgentTaskId: 'foreign' }, 1, 'bad')).status).toBe('invalid_review');
    expect((await worker.call('paper_review', { ...decision(), draftToolCallId: 'invented' }, 2, 'bad2')).status).toBe('invalid_review');
  });
  it('explains misplaced field content without falsely reporting a changed author identity', async () => {
    const worker = tools(); await worker.call('paper_candidate', {});
    const misplaced = await worker.call('paper_review', { ...decision(), summary: 'A field was placed at the root.' }, 1, 'bad-shape');
    expect(misplaced).toMatchObject({ status: 'invalid_review', feedback: expect.stringContaining('inside fields') });
    expect(misplaced.feedback).not.toContain('exact saved author task');
  });
  it.each(['missing', 'duplicate', 'changed', 'later'])('requires a real preceding candidate receipt: %s', async variant => {
    const { worker, candidate, messages } = await reviewed();
    if (variant === 'missing') messages.splice(0, 2);
    if (variant === 'duplicate') messages.push(messages[1]!);
    if (variant === 'changed') messages[1]!.content = JSON.stringify({ ...candidate, sourceAgentTaskId: 'foreign' });
    if (variant === 'later') messages.push(...messages.splice(0, 2));
    expect(() => worker.finish(messages)).toThrow();
  });
  it.each(['failed-later', 'missing', 'duplicate', 'wrong-id'])('cannot adopt stale or ambiguous review output: %s', async variant => {
    const { worker, messages } = await reviewed();
    if (variant === 'failed-later') {
      const changed = { ...decision(), sourceAgentTaskId: 'foreign' };
      const failed = await worker.call('paper_review', changed, 2, 'failed');
      messages.push(...pair('failed', 'paper_review', changed, failed));
    } else if (variant === 'missing') messages.pop();
    else if (variant === 'duplicate') messages.push(messages.at(-1)!);
    else messages.at(-1)!.content = JSON.stringify({ status: 'review_ready', reviewToolCallId: 'foreign', sourceAgentTaskId });
    expect(() => worker.finish(messages)).toThrow();
  });
});
