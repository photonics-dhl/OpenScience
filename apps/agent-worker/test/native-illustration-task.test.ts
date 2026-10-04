import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeIllustrationMaterializer, nativeIllustrationToolProfile } from '../src/native-agent/illustration-task';
import { materializeIllustrationScience } from '../src/presentation/illustration-planner';
import type { NativeAgentSessionState } from '../src/native-agent/session';
import type { ChatMessage } from '@openscience/ai-gateway';

const claims = [{ id: '10000000-0000-4000-8000-000000000001', kind: 'finding', statement: 'A qualitative relation', assessment: 'supported',
  conditions: [], limitations: [], extractionStatus: 'succeeded', sourcePassages: [{ evidenceId: '20000000-0000-4000-8000-000000000001', relation: 'supports', text: 'Two regions are connected under the stated condition.' }] }];
const settings = { locale: 'en' as const, style: 'aged-academia', instruction: 'Explain the relation.', output: 'image' as const, narrative: true, narrativeSceneLimit: 1 };
const science = { title: 'Two regions', narrative: { mainMessage: 'A supported relation', audience: 'A new reader' }, scenes: [{
  title: 'A relation', narration: 'These regions are connected.', message: 'A conditional relation', domain: 'conceptual',
  subjects: [{ description: 'Connected regions', basis: { sourceId: 's0' } }], encoding: 'A link represents the relationship of subject 0.',
  labels: ['Connected regions'], constraints: ['Not to scale'], paperOriginalAssetId: null }] };
function fixture(options: { scienceFeedback?: boolean; quote?: string } = {}) {
  const selectedClaims = structuredClone(claims);
  if (options.quote !== undefined) selectedClaims[0]!.sourcePassages[0]!.text = options.quote;
  const input = { claims: selectedClaims as never, settings, paperOriginals: new Map(), narrativeSource: undefined,
    scienceFeedback: options.scienceFeedback };
  const tool = createNativeIllustrationMaterializer(input); const messages: ChatMessage[] = [];
  const invoke = (name: string, args: unknown, id: string) => {
    const result = tool.call(name, args, messages.length, id);
    messages.push({ role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
      { role: 'tool', toolCallId: id, content: JSON.stringify(result) });
    return result;
  };
  const complete = (value = science) => {
    invoke('paper_illustration_science', value, 'science-call');
    invoke('paper_illustration_art', { scienceToolCallId: 'science-call', scenes: [{ layout: 'Put label 0 above subject 0.', treatment: 'Crisp ink on white paper.' }] }, 'art-call');
    invoke('paper_illustration_review', { planToolCallId: 'art-call', decision: 'accepted', summary: 'Sources, geometry and caption agree.', corrections: [], issues: [] }, 'review-call');
  };
  return { tool, messages, invoke, complete, input, restore: () => createNativeIllustrationMaterializer(input) };
}
describe('native illustration selects actual private tool history', () => {
  it('restores the exact reviewed plan and portable prompt without another model', () => {
    const f = fixture(); f.complete();
    const result = f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}');
    expect(result.review.decision).toBe('accepted');
    expect(result.document.scenes[0]!.illustration!.labels).toEqual(['Connected regions']);
    expect(result.prompts[0]!.prompt).toContain('Connected regions');
    expect(result.prompts[0]!.prompt).not.toContain('API');
  });
  it.each(['wrong-review', 'changed-receipt', 'changed-science', 'new-plan'] as const)('rejects %s without adopting or rendering', mode => {
    const f = fixture(); f.complete();
    if (mode === 'changed-receipt') f.messages[3]!.content = JSON.stringify({ status: 'art_ready', planToolCallId: 'forged' });
    if (mode === 'changed-science') f.messages[0]!.toolCalls![0]!.function.arguments = JSON.stringify({ ...science, title: 'An altered result' });
    if (mode === 'new-plan') f.invoke('paper_illustration_science', science, 'new-science');
    expect(() => f.restore().finish(f.messages, JSON.stringify({ reviewToolCallId: mode === 'wrong-review' ? 'science-call' : 'review-call' }))).toThrow(/Native|native/u);
  });
  it('returns repairable validation feedback without accepting unsupported source data', () => {
    const f = fixture(); const invalid = structuredClone(science); invalid.scenes[0]!.subjects[0]!.basis.sourceId = 'foreign';
    expect(f.invoke('paper_illustration_science', invalid, 'bad')).toMatchObject({ status: 'invalid_illustration', error: 'unknown_original_source' });
    f.complete(); expect(f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}').review.decision).toBe('accepted');
  });
});

// Exact paid description from before the quantity/feedback correction. Its receipts are immutable.
const PAID_SCIENCE_DESCRIPTION = 'Save the scientific visual narrative before art. Choose only the scenes needed to convey the paper. Each subject has one exact supporting sN source. Encode direction, quantity meaning, comparison and model conditions explicitly. Labels are the complete visible text inventory, including axis symbols and qualifiers; no citations or hidden extra text. Constraints at most two. Narration <=600 characters; title <=120, mainMessage <=240, audience <=160. Subject and label indices are zero-based. paperOriginalAssetId is null for a designed image or an exact available original asset. This validates structure and binding, not scientific truth.';
function savedProfile(description: string | undefined, omitTools = false): NativeAgentSessionState {
  const tools = nativeIllustrationToolProfile(null).sourceTools.map(tool => ({ type: 'function' as const,
    function: { ...structuredClone(tool), ...(tool.name === 'paper_illustration_science' ? { description } : {}) } }));
  return { kind: 'hermes-native-agent', binding: { taskId: 'task', artifactId: 'artifact', documentSha256: 'document', sourceMapHash: 'map',
    runtimeId: 'runtime', skillCatalogueId: 'catalogue', model: 'MiniMax-M3', allowedTools: tools.map(tool => tool.function.name),
    maxTurns: 32, maxOutputTokens: 32768, maxTotalOutputTokens: 98304, maxInputBytes: 500000, deadlineAt: 2000000000000 },
  initialMessages: [], turns: [{ state: 'started', target: { provider: 'minimax', model: 'MiniMax-M3', promptHash: 'existing-request' },
    request: { messages: [], options: omitTools ? {} : { tools } }, effectiveOptions: {} }] } as NativeAgentSessionState;
}
function quantityScene(text: string, description = text) {
  const value = structuredClone(science);
  value.scenes[0]!.narration = text;
  value.scenes[0]!.subjects[0]!.description = description;
  return value;
}
afterEach(() => vi.unstubAllGlobals());

describe('native illustration preserves paid quantity and feedback semantics', () => {
  it('selects the new mode only from the exact first paid science description and retains saved schemas', () => {
    const fresh = nativeIllustrationToolProfile(null);
    expect(fresh.scienceFeedback).toBe(true);
    const description = fresh.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description;
    expect(description).not.toBe(PAID_SCIENCE_DESCRIPTION);
    const saved = savedProfile(description);
    const definition = saved.turns[0]!.request.options.tools!.find(tool => tool.function.name === 'paper_illustration_science')!;
    definition.function.parameters = { type: 'object', properties: { savedSchemaMarker: { type: 'string' } } };
    const before = structuredClone(saved);
    const restored = nativeIllustrationToolProfile(saved);
    expect(restored.scienceFeedback).toBe(true);
    expect(restored.sourceTools.find(tool => tool.name === 'paper_illustration_science')).toEqual(definition.function);
    restored.sourceTools[0]!.description = 'a local copy';
    expect(saved).toEqual(before);
  });
  it.each([PAID_SCIENCE_DESCRIPTION, 'unknown paid science description'])('never upgrades a saved legacy or unknown description: %s', description => {
    const restored = nativeIllustrationToolProfile(savedProfile(description));
    expect(restored.scienceFeedback).toBe(false);
    expect(restored.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description).toBe(description);
  });
  it('does not advertise the new mode when paid tools are missing, and rejects a missing saved description', () => {
    const restored = nativeIllustrationToolProfile(savedProfile(undefined, true));
    expect(restored.scienceFeedback).toBe(false);
    expect(restored.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description).toBe(PAID_SCIENCE_DESCRIPTION);
    expect(() => nativeIllustrationToolProfile(savedProfile(undefined))).toThrow(/Native/u);
  });
  it.each(['Table 3 / Fig. S4', '(Table 3 / Figure S4)'])('treats %s as bibliography while retaining actual numeric source requirements', reference => {
    const f = fixture({ scienceFeedback: true });
    const value = structuredClone(science); value.scenes[0]!.narration = `The connection is shown in ${reference}.`;
    expect(f.invoke('paper_illustration_science', value, 'reference')).toMatchObject({ status: 'science_ready' });
    value.scenes[0]!.narration += ' Frequency 2.5 GHz.';
    expect(f.invoke('paper_illustration_science', value, 'unsupported')).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('unbound_numeric_2_5_ghz_description') });
  });
  it.each([['2.5-GHz', '2.5 GHz'], ['0.4-THz', '0.4 THz'], ['2.5–GHz', '2.5 GHz']])('retains the value/unit and own source for %s', (formatted, original) => {
    const f = fixture({ scienceFeedback: true, quote: `The frequency is ${original}.` });
    const value = quantityScene(`A ${formatted} signal connects the regions.`, `Frequency ${original}`);
    expect(f.invoke('paper_illustration_science', value, 'quantity')).toMatchObject({ status: 'science_ready' });
    expect(value.scenes[0]!.narration).toContain(formatted);
    const wrong = fixture({ scienceFeedback: true, quote: 'The frequency is 3.7 MHz.' });
    expect(wrong.invoke('paper_illustration_science', value, 'wrong-source')).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('_source') });
  });
  it.each(['1-β', '2.5-x', 'λ/2', '(2.5-GHz)/2', '2.5-GHz+x'])('keeps the full real expression %s source bound', expression => {
    const f = fixture({ scienceFeedback: true, quote: 'An unrelated frequency is 2.5 GHz.' });
    expect(f.invoke('paper_illustration_science', quantityScene(expression), 'expression')).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('unbound_expression_') });
  });
  it('returns only existing field locations and expected variable, without changing legacy or static defaults', () => {
    const value = quantityScene('FWHM_S = 7 fs'); value.scenes[0]!.labels = ['FWHM_S = 7 fs'];
    const f = fixture({ scienceFeedback: true, quote: 'FWHM_T = 7 fs' });
    let original: unknown;
    try { materializeIllustrationScience(value, f.input.claims, settings); } catch (error) { original = error; }
    expect(original).toMatchObject({ message: 'unbound_numeric_7_fs_source', fields: ['narration', 'labels[0]'], expectedVariable: 'FWHM_T' });
    const result = f.invoke('paper_illustration_science', value, 'details');
    expect(result).toEqual({ status: 'invalid_illustration', error: expect.stringMatching(/^unbound_numeric_7_fs_source/u) });
    expect(result.error).toContain('narration'); expect(result.error).toContain('labels[0]'); expect(result.error).toContain('FWHM_T');
    expect((result.error as string).length).toBeLessThanOrEqual(500);
    expect(result.error).not.toContain('FWHM_T = 7 fs');
    const old = fixture({ quote: 'FWHM_T = 7 fs' });
    expect(old.invoke('paper_illustration_science', value, 'old')).toEqual({ status: 'invalid_illustration', error: 'unbound_numeric_7_fs_source' });
    const bibliography = structuredClone(science); bibliography.scenes[0]!.narration = 'See Table 3 / Fig. S4.';
    expect(() => materializeIllustrationScience(bibliography, old.input.claims, settings)).toThrow(/unbound_expression_/u);
  });
  it('distinguishes an explicitly absent source symbol from unavailable variable guidance and bounds many diagnostics', () => {
    const f = fixture({ scienceFeedback: true, quote: 'The width is 7 fs.' });
    const value = quantityScene('FWHM_S = 7 fs');
    const prose = f.invoke('paper_illustration_science', value, 'prose');
    expect(prose.error).toContain('prose');
    expect(prose.error).not.toContain('undefined'); expect(prose.error).not.toContain('null');
    const unknown = fixture({ scienceFeedback: true, quote: 'An unrelated qualitative relation.' });
    const result = unknown.invoke('paper_illustration_science', value, 'unknown-variable');
    expect(result.error).toContain('narration'); expect(result.error).not.toContain('prose');
    value.scenes[0]!.labels = Array.from({ length: 15 }, (_, index) => `Frequency ${index + 100} GHz`);
    const many = unknown.invoke('paper_illustration_science', value, 'many');
    expect(many.status).toBe('invalid_illustration'); expect((many.error as string).length).toBeLessThanOrEqual(500);
  });
  it.each([false, true])('never defaults required nullable original metadata, mode %s', scienceFeedback => {
    const f = fixture({ scienceFeedback }); const value = structuredClone(science);
    delete (value.scenes[0] as { paperOriginalAssetId?: null }).paperOriginalAssetId;
    expect(f.invoke('paper_illustration_science', value, 'missing')).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('missing_paperOriginalAssetId') });
  });
  it.each([false, true])('restarts with exact failed and successful receipts, rejects either tamper, and makes no HTTP calls: new=%s', fresh => {
    const http = vi.fn(() => { throw new Error('Unexpected HTTP'); }); vi.stubGlobal('fetch', http);
    const first = nativeIllustrationToolProfile(fresh ? null : savedProfile(PAID_SCIENCE_DESCRIPTION));
    const saved = savedProfile(first.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description);
    const f = fixture({ scienceFeedback: first.scienceFeedback, quote: 'FWHM_T = 7 fs' });
    f.invoke('paper_illustration_science', quantityScene('FWHM_S = 7 fs'), 'invalid');
    const bibliography = structuredClone(science); bibliography.scenes[0]!.narration = 'See Table 3 / Fig. S4.';
    expect(f.invoke('paper_illustration_science', bibliography, 'bibliography').status).toBe(fresh ? 'science_ready' : 'invalid_illustration');
    f.complete();
    const originalHistory = structuredClone(f.messages);
    const restore = () => createNativeIllustrationMaterializer({ ...f.input, scienceFeedback: nativeIllustrationToolProfile(saved).scienceFeedback });
    const final = '{"reviewToolCallId":"review-call"}';
    expect(restore().finish(f.messages, final).review.decision).toBe('accepted');
    expect(f.messages).toEqual(originalHistory);
    for (const callId of ['invalid', 'science-call']) {
      const altered = structuredClone(f.messages);
      const receipt = altered.find(message => message.role === 'tool' && message.toolCallId === callId)!;
      const payload = JSON.parse(receipt.content);
      if (callId === 'invalid') payload.error += ' tampered'; else payload.intent.title = 'tampered';
      receipt.content = JSON.stringify(payload);
      expect(() => restore().finish(altered, final)).toThrow(/history changed/u);
    }
    expect(http).not.toHaveBeenCalled();
  });
});
