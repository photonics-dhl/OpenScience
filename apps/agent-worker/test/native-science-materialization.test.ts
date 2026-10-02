import { describe, expect, it } from 'vitest';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { createNativeScientificMaterializer } from '../src/extractor';
import { finishNativePaperReview, nativeSkillReads, restoreNativePaperDraft } from '../src/native-agent/paper-task';
import { createNativePaperTools } from '../src/native-agent/paper-tools';
import type { ChatMessage } from '@openscience/ai-gateway';
import type { DocumentSourceMap } from '@openscience/domain';
const parser = { name: 'fixture', version: '1' };
const source = 'Electrons move through a bounded electromagnetic field; the numerical model predicts coherent radiation under the stated geometry.';
const map: DocumentSourceMap = { artifactId: 'paper', contentHash: 'a'.repeat(64), parser, pages: [{ page: 1, width: 100, height: 100,
  blocks: [{ id: 'body', kind: 'paragraph', text: source, boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] }] };
const draft = () => ({ fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { summary: source, sourcePassageIds: ['P00001'] }])),
  needsMoreEvidence: [], draftClaims: [{ clientKey: 'core-a', sourceField: 'insight', kind: 'core', statement: source,
    conditions: [], limitations: [], sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] });
const review = () => ({ fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { ...draft().fields[field], verdict: 'accepted', issues: [] }])),
  needsMoreEvidence: [], claimSuggestions: draft().draftClaims });
describe('actual native Agent scientific materializer', () => {
  const reviewedHistory = (): ChatMessage[] => [
    { role: 'assistant', content: '', toolCalls: [{ id: 'draft-a', type: 'function', function: { name: 'paper_draft', arguments: JSON.stringify(draft()) } }] },
    { role: 'tool', toolCallId: 'draft-a', content: JSON.stringify({ status: 'draft_ready' }) },
    { role: 'assistant', content: '', toolCalls: [{ id: 'review-a', type: 'function', function: { name: 'paper_review', arguments: JSON.stringify(review()) } }] },
    { role: 'tool', toolCallId: 'review-a', content: JSON.stringify({ status: 'review_ready' }) },
  ];
  it('materializes the exact checked review selected by a short final response without another full-body generation', () => {
    const result = finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), reviewedHistory(),
      JSON.stringify({ reviewToolCallId: 'review-a' }));
    expect(result.core.insight).toBe(source);
    expect(result.reviewedClaimSuggestions?.[0]?.statement).toBe(source);
    expect(result.evidenceSegments?.method[0]?.quote).toBe(source);
  });
  it.each(['unknown', 'failed', 'ambiguous', 'older_review', 'newer_draft', 'malformed', 'extra_keys', 'foreign_source'])('refuses a short selection with %s', change => {
    const messages = reviewedHistory(); let selected = 'review-a';
    if (change === 'unknown') selected = 'absent';
    if (change === 'failed') messages[3]!.content = JSON.stringify({ status: 'invalid_review' });
    if (change === 'ambiguous') messages.push(structuredClone(messages[3]!));
    if (change === 'older_review') messages.push({ role: 'assistant', content: '', toolCalls: [{ id: 'review-b', type: 'function',
      function: { name: 'paper_review', arguments: JSON.stringify(review()) } }] },
    { role: 'tool', toolCallId: 'review-b', content: JSON.stringify({ status: 'invalid_review' }) });
    if (change === 'newer_draft') messages.push({ role: 'assistant', content: '', toolCalls: [{ id: 'draft-b', type: 'function',
      function: { name: 'paper_draft', arguments: JSON.stringify(draft()) } }] },
    { role: 'tool', toolCallId: 'draft-b', content: JSON.stringify({ status: 'draft_ready' }) });
    if (change === 'malformed') messages[3]!.content = 'invalid metadata';
    if (change === 'foreign_source') {
      const changed = review(); changed.claimSuggestions[0]!.sourceBindings[0]!.sourcePassageId = 'P99999';
      messages[2]!.toolCalls![0]!.function.arguments = JSON.stringify(changed);
    }
    const final = JSON.stringify({ reviewToolCallId: selected, ...(change === 'extra_keys' ? { fields: review().fields } : {}) });
    expect(() => finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), messages, final)).toThrow();
  });
  it('retains full-JSON completion for historical Native replies', () => {
    expect(finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), reviewedHistory(), JSON.stringify(review())).core.results).toBe(source);
  });
  const compactReview = () => ({ draftToolCallId: 'draft-a', fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { verdict: 'accepted' }])),
    needsMoreEvidence: [], claimSuggestions: 'unchanged' });
  it('returns the actual successful review ID for final selection and keeps the draft ID unusable as a review', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft(), 1, 'draft-a');
    const receipt = worker.review(compactReview(), 'review-a');
    expect(receipt).toMatchObject({ status: 'review_ready', reviewToolCallId: 'review-a' });
    const messages = reviewedHistory(); messages[2]!.toolCalls![0]!.function.arguments = JSON.stringify(compactReview());
    messages[3]!.content = JSON.stringify(receipt);
    expect(finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), messages,
      JSON.stringify({ reviewToolCallId: receipt.reviewToolCallId })).core.insight).toBe(source);
    expect(() => finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), messages,
      JSON.stringify({ reviewToolCallId: 'draft-a' }))).toThrow('selected review');
  });
  it('does not expose a ready-review selection ID for a rejected review', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft(), 1, 'draft-a');
    const value = { ...compactReview(), draftToolCallId: 'other-draft' };
    const receipt = worker.review(value, 'review-invalid');
    expect(receipt.status).toBe('invalid_review');
    expect(receipt).not.toHaveProperty('reviewToolCallId');
  });
  it('reports every unread source ID in the draft without silently reading or changing its evidence', async () => {
    const largerMap = structuredClone(map);
    largerMap.pages[0]!.blocks.push({ ...structuredClone(largerMap.pages[0]!.blocks[0]!), id: 'two' },
      { ...structuredClone(largerMap.pages[0]!.blocks[0]!), id: 'three' });
    for (const block of largerMap.pages[0]!.blocks) block.text = source.repeat(6);
    const paper = createNativePaperTools(largerMap, async () => []);
    await paper.call('paper_read', { passageIds: ['P00001'] });
    const worker = createNativeScientificMaterializer(largerMap, () => paper.observedPassageIds);
    const value = draft(); value.fields.limitations!.sourcePassageIds = ['P00002']; value.fields.reproducibility!.sourcePassageIds = ['P00003'];
    const receipt = worker.draft(value, 1, 'draft-a');
    expect(receipt.status).toBe('invalid_draft');
    expect(receipt.feedback).toContain('fields.limitations.sourcePassageIds');
    expect(receipt.feedback).toContain('P00002');
    expect(receipt.feedback).toContain('fields.reproducibility.sourcePassageIds');
    expect(receipt.feedback).toContain('P00003');
    expect(paper.observedPassageIds).toEqual(['P00001']);
    await paper.call('paper_read', { passageIds: ['P00002', 'P00003'] });
    expect(worker.draft(value, 2, 'draft-a').status).toBe('draft_ready');
  });
  it('distinguishes nonexistent source IDs from passages that can actually be read', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']);
    const value = draft(); value.fields.method!.sourcePassageIds = ['P99999'];
    const receipt = worker.draft(value, 1, 'draft-a');
    expect(receipt.status).toBe('invalid_draft');
    expect(receipt.feedback).toContain('不属于当前SourceMap：P99999');
    expect(receipt.feedback).not.toContain('用paper_read读取');
  });
  it('consumes a short final selection of the actual compact review and reconstructs the bound draft after restart', () => {
    const messages = reviewedHistory(); messages[2]!.toolCalls![0]!.function.arguments = JSON.stringify(compactReview());
    const result = finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), messages, JSON.stringify({ reviewToolCallId: 'review-a' }));
    expect(result.core.results).toBe(source);
    expect(result.reviewedClaimSuggestions?.[0]?.statement).toBe(source);
  });
  it('preserves an explicit complete scientific correction in a compact review', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft(), 1, 'draft-a');
    const changed = { ...compactReview(), fields: { ...compactReview().fields, method: { verdict: 'revised', summary: 'The paper reports: ' + source,
      sourcePassageIds: ['P00001'], issues: [{ code: 'QUALIFIER_LOSS', problem: 'Identify this relation as the reported result.', sourcePassageIds: ['P00001'] }] } } };
    expect(worker.review(changed)).toHaveProperty('status', 'review_ready');
    expect(worker.finish(JSON.stringify(changed)).core.method).toBe('The paper reports: ' + source);
  });
  it('checks explicit compact decisions against the bound real draft and retains complete science and Claims', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft(), 1, 'draft-a');
    expect(worker.review(compactReview())).toHaveProperty('status', 'review_ready');
    const result = worker.finish(JSON.stringify(compactReview()));
    expect(result.core.method).toBe(source);
    expect(result.reviewedClaimSuggestions?.[0]?.statement).toBe(source);
    expect(result.nativeScientificFields?.results).toMatchObject({ verdict: 'accepted', summary: source, sourcePassageIds: ['P00001'], issues: [] });
  });
  it('does not rebind an earlier compact science decision to a later draft even when text is unchanged', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft(), 1, 'draft-a');
    expect(worker.review(compactReview())).toHaveProperty('status', 'review_ready');
    worker.draft(draft(), 2, 'draft-b');
    expect(worker.review(compactReview())).toHaveProperty('status', 'invalid_review');
    expect(() => worker.finish(JSON.stringify(compactReview()))).toThrow();
  });
  it.each(['missing_verdict', 'missing_claim_decision', 'extra_accepted_content', 'wrong_candidate', 'foreign_claim', 'false_revision'])('rejects a compact review with %s through the original science guard', change => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft(), 1, 'draft-a');
    const value = compactReview() as { draftToolCallId?: string; fields: Record<string, Record<string, unknown>>; needsMoreEvidence: unknown[]; claimSuggestions?: unknown };
    if (change === 'missing_verdict') delete value.fields.method;
    if (change === 'missing_claim_decision') delete value.claimSuggestions;
    if (change === 'extra_accepted_content') value.fields.method.summary = 'Invented replacement';
    if (change === 'wrong_candidate') value.draftToolCallId = 'other-draft';
    if (change === 'foreign_claim') { const claims = review().claimSuggestions; claims[0]!.sourceBindings[0]!.sourcePassageId = 'P99999'; value.claimSuggestions = claims; }
    if (change === 'false_revision') value.fields.method = { ...review().fields.method, verdict: 'revised', issues: [] };
    expect(worker.review(value)).toHaveProperty('status', 'invalid_review');
    expect(() => worker.finish(JSON.stringify(value))).toThrow();
  });
  it.each([undefined, null, 'arbitrary', false])('requires an explicit compact Claims decision even when evidence is pending: %s', decision => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft(), 1, 'draft-a');
    const value = { ...compactReview(),
    needsMoreEvidence: [{ affectedFields: ['method'], question: 'What condition applies?', requestedContext: 'The original model condition.' }], claimSuggestions: decision };
    expect(worker.review({ ...value, claimSuggestions: 'unchanged' })).toEqual(expect.objectContaining({ status: 'review_ready' }));
    expect(worker.review(value)).toHaveProperty('status', 'invalid_review');
  });
  it('gives compact-specific correction feedback without directing the Agent to remove its candidate binding', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft(), 1, 'draft-a');
    const value = { ...compactReview(), draftToolCallId: 'wrong-draft' }; const feedback = worker.review(value).feedback as string;
    expect(feedback).toContain('draftToolCallId');
    expect(feedback).not.toMatch(/根对象只使用fields[,、]/);
    const extra = worker.review({ ...compactReview(), unexpected: true }).feedback as string;
    expect(extra).toContain('根对象只使用draftToolCallId、fields、needsMoreEvidence、claimSuggestions');
  });
  it('keeps the full candidate usable without echoing its long body into draft feedback', () => {
    const candidate = draft();
    for (const field of SDF_CORE_FIELDS) candidate.fields[field]!.summary = source.repeat(5);
    const final = { ...review(), fields: Object.fromEntries(SDF_CORE_FIELDS.map(field =>
      [field, { ...candidate.fields[field], verdict: 'accepted', issues: [] }])) };
    const worker = createNativeScientificMaterializer(map, () => ['P00001']);
    const receipt = worker.draft(candidate);
    expect(receipt).toHaveProperty('status', 'draft_ready');
    expect(JSON.stringify(receipt).length).toBeLessThan(2000);
    expect(worker.finish(JSON.stringify(final)).core.method).toBe(candidate.fields.method!.summary);
    const restored = createNativeScientificMaterializer(map, () => ['P00001']);
    restoreNativePaperDraft(restored, [{ role: 'assistant', content: '', toolCalls: [{ id: 'large-draft', type: 'function',
      function: { name: 'paper_draft', arguments: JSON.stringify(candidate) } }] },
    { role: 'tool', toolCallId: 'large-draft', content: JSON.stringify(receipt) }]);
    expect(restored.finish(JSON.stringify(final)).core.results).toBe(candidate.fields.results!.summary);
  });
  it('records only actually successful native skill reads, retaining full-reference selection', () => {
    const selections = [
      { name: 'science:paper-method' }, { name: 'paper-method' },
      { name: 'paper-method', file_path: 'references/positions.md' }, { name: 'missing' }, { name: 'malformed' },
    ];
    const messages: ChatMessage[] = [{ role: 'assistant', content: '', toolCalls: selections.map((args, index) => ({
      id: `skill-${index}`, type: 'function', function: { name: 'skill_view', arguments: JSON.stringify(args) },
    })) }, ...[
      JSON.stringify({ success: false, error: 'Unknown namespace' }),
      JSON.stringify({ success: true, content: 'Complete method' }),
      JSON.stringify({ success: true, content: 'Full supporting reference' }),
    ].map((content, index) => ({ role: 'tool' as const, content, toolCallId: `skill-${index}` })),
    { role: 'tool', content: 'invalid metadata', toolCallId: 'skill-4' }];
    expect(nativeSkillReads(messages)).toEqual([selections[1], selections[2]]);
  });
  it('returns actionable review feedback in the same conversation and accepts the corrected exact JSON', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft());
    const changed = review(); changed.fields.method!.summary = 'Changed relation';
    expect(worker.review(changed)).toMatchObject({ status: 'invalid_review', feedback: expect.stringContaining('contract') });
    expect(worker.review(review())).toMatchObject({ status: 'review_ready' });
    expect(worker.finish('```json\n' + JSON.stringify(review()) + '\n```').core.method).toBe(source);
  });
  it('locates the actual flattened review fields without adopting or repairing the science', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft());
    const complete = review();
    const flattened = { ...complete, fields: { problem: complete.fields.problem },
      ...Object.fromEntries(SDF_CORE_FIELDS.filter(field => field !== 'problem').map(field => [field, complete.fields[field]])),
      parentClientKey: 'misplaced' };
    const rejected = worker.review(flattened);
    expect(rejected).toHaveProperty('status', 'invalid_review');
    expect(rejected.feedback).toContain('根对象');
    for (const field of SDF_CORE_FIELDS.filter(field => field !== 'problem')) expect(rejected.feedback).toContain(`fields.${field}`);
    expect(() => worker.finish(JSON.stringify(flattened))).toThrow('contract');
    expect(worker.review(complete)).toHaveProperty('status', 'review_ready');
    expect(worker.finish(JSON.stringify(complete)).core.insight).toBe(source);
  });
  it('identifies a missing nested field while preserving the accepted private draft', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft());
    const partial = review(); delete partial.fields.method;
    expect(worker.review(partial)).toMatchObject({ status: 'invalid_review', feedback: expect.stringContaining('fields.method') });
    expect(() => worker.finish(JSON.stringify(partial))).toThrow('contract');
    expect(worker.finish(JSON.stringify(review())).core.method).toBe(source);
  });
  it('locates the actual misplaced evidence requests at the root and inside fields', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft());
    const complete = review();
    const misplaced = { fields: { ...complete.fields, needsMoreEvidence: complete.needsMoreEvidence },
      claimSuggestions: complete.claimSuggestions };
    const rejected = worker.review(misplaced);
    expect(rejected).toHaveProperty('status', 'invalid_review');
    expect(rejected.feedback).toContain('根对象.needsMoreEvidence');
    expect(rejected.feedback).toContain('fields只使用');
    expect(() => worker.finish(JSON.stringify(misplaced))).toThrow('contract');
    expect(worker.finish(JSON.stringify(complete)).core.results).toBe(source);
  });
  it('restores the last genuinely accepted draft by model call order despite reverse parallel replies', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']);
    const older = draft(); older.fields.method!.summary = 'Earlier actual draft';
    const calls = [older, draft()].map((value, index) => ({ id: `draft-${index}`, type: 'function' as const,
      function: { name: 'paper_draft', arguments: JSON.stringify(value) } }));
    const messages: ChatMessage[] = [{ role: 'assistant', content: '', toolCalls: calls },
      { role: 'tool', toolCallId: 'draft-1', content: JSON.stringify(worker.draft(draft())) },
      { role: 'tool', toolCallId: 'draft-0', content: JSON.stringify(worker.draft(older)) }];
    expect(() => worker.finish(JSON.stringify(review()))).toThrow('contract');
    restoreNativePaperDraft(worker, messages); expect(worker.finish(JSON.stringify(review())).core.method).toBe(source);
    expect(() => restoreNativePaperDraft(worker, [{ role: 'assistant', content: '', toolCalls: calls }])).toThrow('candidate');
  });
  it('keeps draft selection stable when live parallel tools arrive out of model order', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']);
    const older = draft(); older.fields.method!.summary = 'Earlier actual draft';
    worker.draft(draft(), 2); worker.draft(older, 1);
    expect(worker.review(review())).toHaveProperty('status', 'review_ready');
    expect(worker.finish(JSON.stringify(review())).core.method).toBe(source);
  });
  it('reuses canonical evidence and Claims guards against a genuine earlier Agent draft', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); expect(worker.draft(draft())).toHaveProperty('status', 'draft_ready');
    const result = worker.finish(JSON.stringify(review())); expect(result.core.insight).toBe(source);
    expect(result.reviewedClaimSuggestions?.[0]).toMatchObject({ clientKey: 'core-a', kind: 'core' });
    expect(result.evidenceSegments?.insight[0]?.quote).toBe(source);
  });
  it('never manufactures a candidate baseline from the final fields', () => {
    expect(() => createNativeScientificMaterializer(map, () => ['P00001']).finish(JSON.stringify(review()))).toThrow('prior');
  });
  it('returns contract feedback to the Agent without accepting an unread or foreign passage', () => {
    const worker = createNativeScientificMaterializer(map, () => []); expect(worker.draft(draft())).toHaveProperty('status', 'invalid_draft');
    expect(() => worker.finish(JSON.stringify(review()))).toThrow('prior');
  });
  it.each(['accepted_changed', 'revised_unchanged', 'foreign_claim', 'claims_missing'])('refuses %s while preserving the actual draft', change => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft());
    const output = review();
    if (change === 'accepted_changed') output.fields.method!.summary = 'Different scientific content';
    if (change === 'revised_unchanged') output.fields.method!.verdict = 'revised';
    if (change === 'foreign_claim') output.claimSuggestions[0]!.sourceBindings[0]!.sourcePassageId = 'P99999';
    if (change === 'claims_missing') output.claimSuggestions = [];
    expect(() => worker.finish(JSON.stringify(output))).toThrow('contract');
    expect(worker.finish(JSON.stringify(review())).core.problem).toBe(source);
  });
});
