import { describe, expect, it } from 'vitest';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { createNativeScientificMaterializer } from '../src/extractor';
import { nativeSkillReads, restoreNativePaperDraft } from '../src/native-agent/paper-task';
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
