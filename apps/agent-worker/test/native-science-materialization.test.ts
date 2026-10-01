import { describe, expect, it } from 'vitest';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { createNativeScientificMaterializer } from '../src/extractor';
import { restoreNativePaperDraft } from '../src/native-agent/paper-task';
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
  it('returns actionable review feedback in the same conversation and accepts the corrected exact JSON', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); worker.draft(draft());
    const changed = review(); changed.fields.method!.summary = 'Changed relation';
    expect(worker.review(changed)).toMatchObject({ status: 'invalid_review', feedback: expect.stringContaining('contract') });
    expect(worker.review(review())).toMatchObject({ status: 'review_ready' });
    expect(worker.finish('```json\n' + JSON.stringify(review()) + '\n```').core.method).toBe(source);
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
