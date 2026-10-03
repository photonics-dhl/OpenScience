import { describe, expect, it } from 'vitest';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { canonicalPassages, createNativeScientificMaterializer } from '../src/extractor';
import { finishNativePaperReview, nativeSkillReads, restoreNativePaperDraft, nativePaperToolProfile, NATIVE_PAPER_NOTE_DRAFT_TOOL, NATIVE_PAPER_REVIEW_TOOL, NATIVE_PAPER_COMMITTED_REVIEW_TOOL } from '../src/native-agent/paper-task';
import type { NativeAgentSessionState } from '../src/native-agent/session';
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
const paidContextDescription = 'Select exact successful paper_field and paper_claim calls to compose the private draft. No text regeneration: fieldToolCallIds maps each of the six fields to its own returned ID; claimToolCallIds selects required Claims. Use [] when no evidence request is needed. The existing complete science/source/Claim checks apply; this is not scientific approval. The returned reviewContext pairs this call with its complete selected source passages. Compare your saved statements, quantities, cases and conditions against them before deciding paper_review; use source tools for missing definitions, restrictions and counterexamples.';
describe('actual native Agent scientific materializer', () => {
  it('pairs a new draft with its actual selected sentences and full Claim rather than only their IDs', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001'], nativePaperToolProfile(null));
    saveNotes(worker);
    worker.field({ field: 'method', summary: 'This discarded note is not part of the selected candidate.', sourcePassageIds: ['P00001'] }, 7, 'discarded');
    const receipt = worker.draft(selectedNotes(), 8, 'paired-draft');
    expect(receipt).toMatchObject({ status: 'draft_ready', reviewContext: {
      fields: SDF_CORE_FIELDS.map(field => ({ field, ...draft().fields[field] })), claims: draft().draftClaims,
      knownContractIssues: [], passages: [{ id: 'P00001', text: source }],
    } });
    expect(JSON.stringify(receipt)).not.toContain('discarded note');
    const context = receipt.reviewContext as { fields: Array<{ sourcePassageIds: string[] }>; claims: Array<{ conditions: string[] }> };
    context.fields[0]!.sourcePassageIds.push('foreign'); context.claims[0]!.conditions.push('invented');
    expect(worker.draft(selectedNotes(), 9, 'paired-again').reviewContext).toMatchObject({
      fields: SDF_CORE_FIELDS.map(field => ({ field, ...draft().fields[field] })), claims: draft().draftClaims,
    });
  });
  it('reports the existing field-Claim binding issue while keeping the draft private and the final guard intact', () => {
    const larger = structuredClone(map); larger.pages[0]!.blocks[0]!.text = source.repeat(8);
    larger.pages[0]!.blocks.push({ ...structuredClone(larger.pages[0]!.blocks[0]!), id: 'later', text: 'A different reported comparison and condition. '.repeat(20) });
    const worker = createNativeScientificMaterializer(larger, () => ['P00001', 'P00002'], nativePaperToolProfile(null));
    saveNotes(worker);
    const claim = { ...draft().draftClaims[0], sourceBindings: [{ sourcePassageId: 'P00002', relation: 'supports' }] };
    expect(worker.claim(claim, 7, 'claim-other-field-source').status).toBe('claim_saved');
    const selected = { ...selectedNotes(), claimToolCallIds: ['claim-other-field-source'] };
    const receipt = worker.draft(selected, 8, 'draft-source-warning');
    expect(receipt).toMatchObject({ status: 'draft_ready', reviewContext: { knownContractIssues: [
      'draftClaims[0].sourceBindings[0].sourcePassageId: outside_field_source_ids',
    ] } });
    expect(() => worker.finish(JSON.stringify({ ...compactReview(), draftToolCallId: 'draft-source-warning' }))).toThrow('outside_field_source_ids');
    worker.field({ field: 'insight', summary: source, sourcePassageIds: ['P00001', 'P00002'] }, 9, 'aligned-field');
    const aligned = { ...selected, fieldToolCallIds: { ...selected.fieldToolCallIds, insight: 'aligned-field' } };
    expect(worker.draft(aligned, 10, 'aligned-draft')).toMatchObject({ reviewContext: { knownContractIssues: [] } });
    expect(worker.finish(JSON.stringify({ ...compactReview(), draftToolCallId: 'aligned-draft' })).core.insight).toBe(source);
  });
  it('preserves the original paid comparison projection instead of retrofitting candidate text or diagnostics', () => {
    const saved = { binding: { allowedTools: ['paper_field', 'paper_claim', 'paper_draft'] }, turns: [{ request: { options: { tools: [
      { type: 'function', function: { ...structuredClone(NATIVE_PAPER_NOTE_DRAFT_TOOL), description: paidContextDescription } },
    ] } } }] } as unknown as NativeAgentSessionState;
    const worker = createNativeScientificMaterializer(map, () => ['P00001'], nativePaperToolProfile(saved));
    saveNotes(worker);
    const context = worker.draft(selectedNotes(), 7, 'paid-draft').reviewContext;
    expect(context).toEqual({ source: { artifactId: map.artifactId, documentSha256: map.contentHash },
      fields: SDF_CORE_FIELDS.map(field => ({ field, sourcePassageIds: ['P00001'] })),
      claims: [{ clientKey: 'core-a', sourceField: 'insight', sourceBindings: draft().draftClaims[0]!.sourceBindings }],
      passages: [{ id: 'P00001', pageStart: 1, pageEnd: 1, text: source }],
    });
  });
  it('pairs an earlier selected call with its own text after a concurrent newer candidate has been stored', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001'], nativePaperToolProfile(null));
    saveNotes(worker);
    const updated = { ...selectedNotes(), fieldToolCallIds: { ...selectedNotes().fieldToolCallIds, method: 'new-method' } };
    const newerSummary = source + ' This is the newer candidate.';
    worker.field({ field: 'method', summary: newerSummary, sourcePassageIds: ['P00001'] }, 9, 'new-method');
    expect(worker.draft(updated, 10, 'new-draft').status).toBe('draft_ready');
    expect(worker.draft(selectedNotes(), 7, 'old-draft')).toMatchObject({ reviewContext: {
      fields: SDF_CORE_FIELDS.map(field => ({ field, ...draft().fields[field] })), claims: draft().draftClaims,
    } });
    expect(worker.finish(JSON.stringify({ ...compactReview(), draftToolCallId: 'new-draft' })).core.method).toBe(newerSummary);
  });
  it('keeps original paid paper tools and their old feedback while fresh tasks receive comparison context', () => {
    const old = { ...structuredClone(NATIVE_PAPER_NOTE_DRAFT_TOOL), description: 'Original paid draft tool description' };
    const saved = { binding: { allowedTools: ['paper_field', 'paper_draft'] }, turns: [{ request: { options: { tools: [
      { type: 'function', function: { name: 'skills_list', parameters: { type: 'object' } } },
      { type: 'function', function: old },
    ] } } }] } as unknown as NativeAgentSessionState;
    const profile = nativePaperToolProfile(saved);
    expect(profile).toMatchObject({ useNotes: true, reviewContext: false, sourceTools: [old] });
    profile.sourceTools[0]!.parameters.changed = true;
    expect(old.parameters).not.toHaveProperty('changed');
    expect(nativePaperToolProfile(null)).toMatchObject({ useNotes: true, reviewContext: true });
    expect(nativePaperToolProfile(null).sourceTools).toContainEqual(NATIVE_PAPER_NOTE_DRAFT_TOOL);
  });
  it('retains comparison context when replaying tasks that originally received its tool description', () => {
    const saved = { binding: { allowedTools: ['paper_field', 'paper_draft'] }, turns: [{ request: { options: { tools: [
      { type: 'function', function: structuredClone(NATIVE_PAPER_NOTE_DRAFT_TOOL) },
    ] } } }] } as unknown as NativeAgentSessionState;
    expect(nativePaperToolProfile(saved).reviewContext).toBe(true);
  });
  it('returns complete selected source passages for the Agent to compare before its existing review decision', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001'], { reviewContext: true });
    const receipt = worker.draft(draft(), 0, 'draft-evidence');
    expect(receipt).toMatchObject({ status: 'draft_ready', draftToolCallId: 'draft-evidence',
      reviewContext: { source: { artifactId: 'paper', documentSha256: map.contentHash },
        passages: [{ id: 'P00001', text: source, pageStart: 1, pageEnd: 1 }],
        claims: [{ clientKey: 'core-a', sourceField: 'insight', sourceBindings: draft().draftClaims[0]!.sourceBindings }] } });
    expect((receipt.reviewContext as { fields: unknown[] }).fields).toHaveLength(6);
    expect(createNativeScientificMaterializer(map, () => ['P00001']).draft(draft(), 0, 'old-draft')).not.toHaveProperty('reviewContext');
  });
  it('does not reveal unread source or turn a failed draft into a source comparison receipt', () => {
    const worker = createNativeScientificMaterializer(map, () => [], { reviewContext: true });
    const receipt = worker.draft(draft(), 0, 'draft-unread');
    expect(receipt.status).toBe('invalid_draft'); expect(receipt).not.toHaveProperty('reviewContext');
  });
  it('keeps a comparison receipt tied to the actual call when a newer draft has already been stored', async () => {
    const larger = structuredClone(map);
    larger.pages[0]!.blocks[0]!.text = source.repeat(8);
    larger.pages[0]!.blocks.push({ ...structuredClone(larger.pages[0]!.blocks[0]!), id: 'later', text: 'A different reported comparison and condition. '.repeat(20) });
    const paper = createNativePaperTools(larger, async () => []);
    await paper.call('paper_read', { passageIds: ['P00001', 'P00002'] });
    const worker = createNativeScientificMaterializer(larger, () => paper.observedPassageIds, { reviewContext: true });
    const newer = draft();
    for (const field of SDF_CORE_FIELDS) newer.fields[field]!.sourcePassageIds = ['P00002'];
    newer.draftClaims[0]!.sourceBindings = [{ sourcePassageId: 'P00002', relation: 'supports' }];
    expect(worker.draft(newer, 10, 'newer').status).toBe('draft_ready');
    const olderReceipt = worker.draft(draft(), 9, 'older');
    expect(olderReceipt).toMatchObject({ draftToolCallId: 'older', reviewContext: { passages: [{ id: 'P00001', text: source.repeat(8) }] } });
    expect(worker.review({ ...compactReview(), draftToolCallId: 'older' }).status).toBe('invalid_review');
    expect(worker.review({ ...compactReview(), draftToolCallId: 'newer' }).status).toBe('review_ready');
  });
  const selectedNotes = () => ({ fieldToolCallIds: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, `field-${field}`])),
    claimToolCallIds: ['claim-core'], needsMoreEvidence: [] });
  function saveNotes(worker: ReturnType<typeof createNativeScientificMaterializer>) {
    SDF_CORE_FIELDS.forEach((field, order) => worker.field({ field, ...draft().fields[field] }, order, `field-${field}`));
    worker.claim(draft().draftClaims[0], 6, 'claim-core');
  }
  it('saves small exact field and Claim calls, then selects them without re-emitting the full paper', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); saveNotes(worker);
    const receipt = worker.draft(selectedNotes(), 7, 'draft-notes');
    expect(receipt).toMatchObject({ status: 'draft_ready', draftToolCallId: 'draft-notes' });
    const checked = { ...compactReview(), draftToolCallId: 'draft-notes' };
    expect(worker.review(checked, 'review-notes').status).toBe('review_ready');
    const result = worker.finish(JSON.stringify(checked));
    expect(result.core).toMatchObject(Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, source])));
    expect(result.reviewedClaimSuggestions?.[0]).toMatchObject({ statement: source, sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] });
    expect(JSON.stringify(selectedNotes()).length).toBeLessThan(JSON.stringify(draft()).length / 2);
  });
  it('corrects one recorded field and preserves the other explicit selections and Claims', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); saveNotes(worker);
    worker.draft(selectedNotes(), 7, 'draft-original');
    const revised = { field: 'limitations', summary: 'This prediction applies to the stated geometry.', sourcePassageIds: ['P00001'] };
    expect(worker.field(revised, 8, 'field-limits-new')).toMatchObject({ status: 'field_saved', fieldToolCallId: 'field-limits-new' });
    const selected = selectedNotes(); selected.fieldToolCallIds.limitations = 'field-limits-new';
    expect(worker.draft(selected, 9, 'draft-corrected').status).toBe('draft_ready');
    expect(worker.finish(JSON.stringify({ ...compactReview(), draftToolCallId: 'draft-corrected' })).core.limitations).toBe(revised.summary);
    expect(worker.finish(JSON.stringify({ ...compactReview(), draftToolCallId: 'draft-corrected' })).core.method).toBe(source);
    expect(worker.review({ ...compactReview(), draftToolCallId: 'draft-original' }).status).toBe('invalid_review');
  });
  it.each(['unknown_id', 'wrong_field', 'wrong_tool', 'duplicate_claim', 'future_note', 'extra_root'])('refuses a recorded draft with %s', change => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); saveNotes(worker);
    const selected = selectedNotes(); let order = 7;
    if (change === 'unknown_id') selected.fieldToolCallIds.method = 'other-task';
    if (change === 'wrong_field') selected.fieldToolCallIds.method = 'field-results';
    if (change === 'wrong_tool') selected.fieldToolCallIds.method = 'claim-core';
    if (change === 'duplicate_claim') selected.claimToolCallIds.push('claim-core');
    if (change === 'future_note') order = 3;
    const value = change === 'extra_root' ? { ...selected, item: draft().draftClaims[0] } : selected;
    expect(worker.draft(value, order, 'draft-bad').status).toBe('invalid_draft');
  });
  it('rejects a leaked Claim root locally without losing already saved fields', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']);
    const bad = { ...draft().draftClaims[0], item: draft().draftClaims[0] };
    expect(worker.claim(bad, 0, 'claim-malformed').status).toBe('invalid_claim');
    saveNotes(worker);
    expect(worker.draft(selectedNotes(), 7, 'draft-good').status).toBe('draft_ready');
  });
  it('keeps saved arguments immutable and refuses reused trusted IDs', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); saveNotes(worker);
    const item = { field: 'method', summary: source, sourcePassageIds: ['P00001'] };
    worker.field(item, 7, 'field-method-new'); item.summary = 'Invented change'; item.sourcePassageIds.length = 0;
    const selected = selectedNotes(); selected.fieldToolCallIds.method = 'field-method-new';
    expect(worker.draft(selected, 8, 'draft-copy').status).toBe('draft_ready');
    expect(worker.finish(JSON.stringify({ ...compactReview(), draftToolCallId: 'draft-copy' })).core.method).toBe(source);
    expect(worker.field({ field: 'method', ...draft().fields.method }, 9, 'field-method-new').status).toBe('invalid_field');
    expect(worker.draft(selected, 10, 'draft-reused').status).toBe('invalid_draft');
  });
  it('does not promote a failed unread note after more source text is read', () => {
    let read: string[] = []; const worker = createNativeScientificMaterializer(map, () => read);
    expect(worker.field({ field: 'method', ...draft().fields.method }, 0, 'field-unread').status).toBe('invalid_field');
    read = ['P00001']; saveNotes(worker);
    const selected = selectedNotes(); selected.fieldToolCallIds.method = 'field-unread';
    expect(worker.draft(selected, 8, 'draft-unread').status).toBe('invalid_draft');
    expect(worker.draft(selectedNotes(), 8, 'draft-read').status).toBe('draft_ready');
  });
  it.each(['dangling_parent', 'duplicate_key', 'total_claim_size'])('still applies the existing complete Claim guard to selected notes: %s', change => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001']); saveNotes(worker);
    const claim = { ...draft().draftClaims[0]!, clientKey: 'child', kind: 'supporting', parentClientKey: 'core-a' };
    if (change === 'dangling_parent') claim.parentClientKey = 'missing';
    if (change === 'duplicate_key') { claim.kind = 'core'; claim.clientKey = 'core-a'; delete (claim as { parentClientKey?: string }).parentClientKey; }
    if (change === 'total_claim_size') claim.statement = source.repeat(20);
    expect(worker.claim(claim, 7, 'claim-child').status).toBe('claim_saved');
    const selected = selectedNotes(); selected.claimToolCallIds.push('claim-child');
    if (change === 'total_claim_size') {
      const extra = { ...claim, clientKey: 'child-extra' }; worker.claim(extra, 8, 'claim-extra'); selected.claimToolCallIds.push('claim-extra');
      const last = { ...claim, clientKey: 'child-last' }; worker.claim(last, 9, 'claim-last'); selected.claimToolCallIds.push('claim-last');
    }
    expect(worker.draft(selected, 10, 'draft-bad-claims').status).toBe('invalid_draft');
  });
  it('replays exact successful notes in paid call order before resolving the selected draft and review', () => {
    const notes = SDF_CORE_FIELDS.map(field => ({ id: `field-${field}`, type: 'function' as const,
      function: { name: 'paper_field', arguments: JSON.stringify({ field, ...draft().fields[field] }) } }));
    notes.push({ id: 'claim-core', type: 'function', function: { name: 'paper_claim', arguments: JSON.stringify(draft().draftClaims[0]) } });
    const messages: ChatMessage[] = [{ role: 'assistant', content: '', toolCalls: notes },
      ...notes.slice().reverse().map(call => ({ role: 'tool' as const, toolCallId: call.id,
        content: JSON.stringify({ status: call.function.name === 'paper_field' ? 'field_saved' : 'claim_saved' }) })),
      { role: 'assistant', content: '', toolCalls: [{ id: 'draft-notes', type: 'function', function: { name: 'paper_draft', arguments: JSON.stringify(selectedNotes()) } }] },
      { role: 'tool', toolCallId: 'draft-notes', content: JSON.stringify({ status: 'draft_ready' }) },
      { role: 'assistant', content: '', toolCalls: [{ id: 'review-notes', type: 'function', function: { name: 'paper_review', arguments: JSON.stringify({ ...compactReview(), draftToolCallId: 'draft-notes' }) } }] },
      { role: 'tool', toolCallId: 'review-notes', content: JSON.stringify({ status: 'review_ready' }) }];
    expect(finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), messages,
      JSON.stringify({ reviewToolCallId: 'review-notes' })).core.method).toBe(source);
    messages.splice(1, 0, { ...messages[1]! });
    expect(() => finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), messages,
      JSON.stringify({ reviewToolCallId: 'review-notes' }))).toThrow();
  });
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
  const toolSubmittedHistory = (): ChatMessage[] => {
    const messages = reviewedHistory();
    messages[2]!.toolCalls![0]!.function.arguments = JSON.stringify(compactReview());
    messages[3]!.content = JSON.stringify({ status: 'review_ready', reviewToolCallId: 'review-a' });
    return messages;
  };
  it('uses the actual tool-submitted review payload rather than requiring a duplicate final JSON', () => {
    const result = finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), toolSubmittedHistory(),
      'The review is saved. This explanation is not its scientific payload.', { reviewToolCompletion: true });
    expect(result.core.method).toBe(source);
    expect(result.reviewedClaimSuggestions?.[0]?.statement).toBe(source);
  });
  it('enables tool-submitted completion only for a fresh task or its exact original tool description', () => {
    const fresh = nativePaperToolProfile(null);
    expect(fresh.reviewToolCompletion).toBe(true);
    const original = fresh.sourceTools.map(tool => ({ type: 'function', function: structuredClone(tool) }));
    const saved = { binding: { allowedTools: fresh.allowedTools }, turns: [{ request: { options: { tools: original } } }] } as unknown as NativeAgentSessionState;
    expect(nativePaperToolProfile(saved).reviewToolCompletion).toBe(true);
    original.find(tool => tool.function.name === 'paper_review')!.function.description += ' unknown variant';
    expect(nativePaperToolProfile(saved).reviewToolCompletion).toBe(false);
    expect(() => finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), toolSubmittedHistory(), 'No JSON')).toThrow();
  });
  it.each(['no_review', 'wrong_receipt_id', 'failed_review', 'later_failed_review', 'later_draft', 'later_field', 'later_claim', 'later_failed_field', 'later_failed_draft', 'duplicate_review', 'foreign_source', 'wrong_draft'] as const)(
    'refuses a tool-submitted completion with %s', change => {
      const messages = toolSubmittedHistory();
      if (change === 'no_review') messages.splice(2);
      if (change === 'wrong_receipt_id') messages[3]!.content = JSON.stringify({ status: 'review_ready', reviewToolCallId: 'foreign' });
      if (change === 'failed_review') messages[3]!.content = JSON.stringify({ status: 'invalid_review' });
      if (change === 'duplicate_review') messages[2]!.toolCalls!.push(structuredClone(messages[2]!.toolCalls![0]!));
      if (change === 'foreign_source' || change === 'wrong_draft') {
        const payload = { ...compactReview(), ...(change === 'wrong_draft' ? { draftToolCallId: 'other-draft' }
          : { claimSuggestions: [{ ...draft().draftClaims[0], sourceBindings: [{ sourcePassageId: 'P99999', relation: 'supports' }] }] }) };
        messages[2]!.toolCalls![0]!.function.arguments = JSON.stringify(payload);
      }
      if (change.startsWith('later_')) {
        const name = change === 'later_failed_review' ? 'paper_review' : change.includes('draft') ? 'paper_draft' : change.includes('field') ? 'paper_field' : 'paper_claim';
        const args = name === 'paper_review' ? compactReview() : name === 'paper_draft' ? draft()
          : name === 'paper_field' ? { field: 'method', ...draft().fields.method } : draft().draftClaims[0];
        const status = change.includes('failed') ? 'invalid_submission' : name === 'paper_draft' ? 'draft_ready' : name === 'paper_field' ? 'field_saved' : 'claim_saved';
        messages.push({ role: 'assistant', content: '', toolCalls: [{ id: 'later', type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
          { role: 'tool', toolCallId: 'later', content: JSON.stringify({ status }) });
      }
      expect(() => finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), messages, 'Finished', { reviewToolCompletion: true })).toThrow();
    });
  it('uses model call order for a tool-submitted review and later field in the same parallel batch', () => {
    const messages = toolSubmittedHistory();
    messages[2]!.toolCalls!.push({ id: 'parallel-field', type: 'function', function: { name: 'paper_field',
      arguments: JSON.stringify({ field: 'method', ...draft().fields.method }) } });
    messages.splice(3, 0, { role: 'tool', toolCallId: 'parallel-field', content: JSON.stringify({ status: 'field_saved' }) });
    expect(() => finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), messages, 'Finished', { reviewToolCompletion: true })).toThrow();
  });
  it('requires the actual draft selector for a tool-submitted review while preserving old full-JSON handling', () => {
    const worker = createNativeScientificMaterializer(map, () => ['P00001'], { reviewToolCompletion: true });
    worker.draft(draft(), 0, 'draft-a');
    expect(worker.review(review(), 'review-a').status).toBe('invalid_review');
    expect(worker.review(compactReview(), 'review-a')).toMatchObject({ status: 'review_ready', reviewToolCallId: 'review-a' });
    const old = createNativeScientificMaterializer(map, () => ['P00001']); old.draft(draft(), 0, 'draft-a');
    expect(old.review(review(), 'review-a').status).toBe('review_ready');
  });
  it('can submit a source-complete field revision already supported by the native notebook and materializer', () => {
    const larger = structuredClone(map);
    larger.pages = Array.from({ length: 17 }, (_, index) => ({ ...structuredClone(map.pages[0]!), page: index + 1,
      blocks: [{ ...structuredClone(map.pages[0]!.blocks[0]!), id: `source-${index + 1}`, text: source.repeat(8) }] }));
    const ids = canonicalPassages(larger).map(passage => passage.id);
    expect(ids).toHaveLength(17);
    const worker = createNativeScientificMaterializer(larger, () => ids, nativePaperToolProfile(null));
    SDF_CORE_FIELDS.forEach((field, order) => worker.field({ field, summary: source, sourcePassageIds: ids.slice(0, 16) }, order, `field-${field}`));
    worker.claim(draft().draftClaims[0], 6, 'claim-core');
    expect(worker.draft(selectedNotes(), 7, 'draft-a').status).toBe('draft_ready');
    const payload = { ...compactReview(), fields: { ...compactReview().fields, results: { verdict: 'revised',
      summary: source, sourcePassageIds: ids, issues: [{ code: 'RELATION_MISMATCH', problem: 'Additional already-read original support is retained.', sourcePassageIds: [ids[16]] }] } } };
    expect(worker.review(payload, 'review-a').status).toBe('review_ready');
    const declared = NATIVE_PAPER_COMMITTED_REVIEW_TOOL.parameters.properties.fields.properties.results.properties.sourcePassageIds;
    expect(declared.maxItems).toBeGreaterThanOrEqual(ids.length);
    for (const field of Object.values(NATIVE_PAPER_COMMITTED_REVIEW_TOOL.parameters.properties.fields.properties))
      expect(field.properties.issues.items.properties.sourcePassageIds.maxItems).toBe(12);
    expect(NATIVE_PAPER_REVIEW_TOOL.parameters.properties.fields.properties.results.properties.sourcePassageIds.maxItems).toBe(12);
  });
  it('consumes a complete compact final review directly from saved notes without a review tool round trip', () => {
    const notes = SDF_CORE_FIELDS.map(field => ({ id: `field-${field}`, type: 'function' as const,
      function: { name: 'paper_field', arguments: JSON.stringify({ field, ...draft().fields[field] }) } }));
    notes.push({ id: 'claim-core', type: 'function', function: { name: 'paper_claim', arguments: JSON.stringify(draft().draftClaims[0]) } });
    const messages: ChatMessage[] = [{ role: 'assistant', content: '', toolCalls: notes },
      ...notes.map(call => ({ role: 'tool' as const, toolCallId: call.id,
        content: JSON.stringify({ status: call.function.name === 'paper_field' ? 'field_saved' : 'claim_saved' }) })),
      { role: 'assistant', content: '', toolCalls: [{ id: 'draft-a', type: 'function',
        function: { name: 'paper_draft', arguments: JSON.stringify(selectedNotes()) } }] },
      { role: 'tool', toolCallId: 'draft-a', content: JSON.stringify({ status: 'draft_ready' }) }];
    const final = { ...compactReview(), fields: { ...compactReview().fields, limitations: {
      verdict: 'revised', summary: 'This numerical prediction applies to the stated geometry.', sourcePassageIds: ['P00001'],
      issues: [{ code: 'QUALIFIER_LOSS', problem: 'Keep the numerical model and geometry condition explicit.', sourcePassageIds: ['P00001'] }],
    } } };
    const result = finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), messages, JSON.stringify(final));
    expect(result.core.method).toBe(source);
    expect(result.core.limitations).toBe(final.fields.limitations.summary);
    expect(result.nativeScientificFields?.limitations.verdict).toBe('revised');
    expect(result.reviewedClaimSuggestions?.[0]?.statement).toBe(source);
    expect(result.evidenceSegments?.limitations[0]?.quote).toBe(source);
  });
  it.each(['truncated', 'no_draft', 'failed_draft', 'stale_draft', 'missing_decision', 'foreign_claim', 'changed_accepted'])(
    'keeps source and review requirements for a direct compact final with %s', change => {
    const messages = reviewedHistory().slice(0, 2);
    const value = compactReview() as { draftToolCallId: string; fields: Record<string, Record<string, unknown>>;
      needsMoreEvidence: unknown[]; claimSuggestions?: unknown };
    if (change === 'no_draft') messages.length = 0;
    if (change === 'failed_draft') messages[1]!.content = JSON.stringify({ status: 'invalid_draft' });
    if (change === 'stale_draft') messages.push({ role: 'assistant', content: '', toolCalls: [{ id: 'draft-b', type: 'function',
      function: { name: 'paper_draft', arguments: JSON.stringify(draft()) } }] },
    { role: 'tool', toolCallId: 'draft-b', content: JSON.stringify({ status: 'draft_ready' }) });
    if (change === 'missing_decision') delete value.claimSuggestions;
    if (change === 'foreign_claim') { const claims = draft().draftClaims; claims[0]!.sourceBindings[0]!.sourcePassageId = 'P99999'; value.claimSuggestions = claims; }
    if (change === 'changed_accepted') value.fields.method!.summary = 'An invented replacement';
    const final = change === 'truncated' ? '{"draftToolCallId":"draft-a"' : JSON.stringify(value);
    expect(() => finishNativePaperReview(createNativeScientificMaterializer(map, () => ['P00001']), messages, final)).toThrow();
  });
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
