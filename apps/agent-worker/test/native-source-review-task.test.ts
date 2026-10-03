import { describe, expect, it, vi } from 'vitest';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { AiGateway, AnthropicCompatProvider, type ChatMessage, type TextProvider } from '@openscience/ai-gateway';
import type { DocumentSourceMap } from '@openscience/domain';
import { createNativeScientificMaterializer } from '../src/extractor';
import { createNativeSourceReviewTools, NATIVE_SOURCE_REVIEW_TOOLS, runNativeSourceReviewTask } from '../src/native-agent/source-review-task';
import type { NativeAgentSessionState } from '../src/native-agent/session';
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
  it('runs the reviewer through actual Session/Gateway while keeping the private baseline out of host config', async () => {
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
        const name = calls === 1 ? 'paper_candidate' : 'paper_review'; const args = calls === 1 ? {} : decision();
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
    const result = await runNativeSourceReviewTask({ gateway, deps: { prisma: { $transaction: async (fn: (tx: never) => Promise<void>) => fn({} as never) } } as never,
      task: { id: 'review-task', executionAttempt: 1, result: { nativeAgentExecution: {
        kind: 'hermes-agent', profile: 'paper-source-review', runtimeId: 'runtime', skillCatalogueId: 'catalogue', model: 'MiniMax-M3' } } },
      sourceMap: map, sourceMapRef: { artifactId: map.artifactId, contentHash: map.contentHash, serializedSha256: 'c'.repeat(64) } as never,
      sourceAgentTaskId, authorCheckpointSha256: 'd'.repeat(64), sourceResult: authorResult(), inboxRoot: 'unused', renderPages: async () => [], authorize });
    const saved = await store.read();
    expect(calls).toBe(3); expect(authorize).toHaveBeenCalled();
    expect(saved?.binding.sourceReview).toMatchObject({ sourceAgentTaskId, authorCheckpointSha256: 'd'.repeat(64),
      boundDraft: { fields: { method: { summary: text } }, draftClaims: [{ statement: text }] } });
    expect(saved?.initialMessages.some(m => m.content.includes(text))).toBe(false);
    expect(saved?.turns.at(-1)?.request.messages.some(m => m.role === 'tool' && m.content.includes(text))).toBe(true);
    expect(result.scientificReview).toMatchObject({ kind: 'hermes_agent_review', profile: 'paper-source-review', sourceAgentTaskId,
      status: 'review_received', provider: 'minimax', model: 'MiniMax-M3', promptHash: saved?.turns.at(-1)?.target.promptHash });
    expect(result).not.toHaveProperty('nativeDraftClaims'); expect(result.scientificReview).not.toHaveProperty('draftClaims');
    expect(result.core.method).toBe(text);
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
