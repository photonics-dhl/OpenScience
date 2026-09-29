import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { AiGateway, type Provider } from '@openscience/ai-gateway';
import type { DocumentSourceMap } from '@openscience/domain';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { extractHandler, type ExtractedCore } from '../src/extractor';

const sourceMap: DocumentSourceMap = {
  artifactId: 'artifact-review', contentHash: 'a'.repeat(64), parser: { name: 'fixture', version: '1' },
  pages: [{ page: 1, width: 100, height: 100, blocks: [{ id: 'source-block', kind: 'paragraph',
    text: 'The model is defined by q(t) = q0 exp(-k t). Representative parameters and the Runge-Kutta solver are described. The supplied appendix contains no executable code or mesh/convergence settings.',
    boundingBox: { x: 1, y: 1, width: 98, height: 98 }, parser: { name: 'fixture', version: '1' }, transformations: [] }] }],
};
const core: ExtractedCore = { schemaVersion: '0.1.0', problem: '研究如何计算一阶衰减过程。',
  insight: '作者用速率方程描述一阶衰减。', method: '材料给出模型方程和求解方法。',
  results: '数值求解得到随时间衰减的响应。', limitations: '该描述限定于所述模型和代表参数。',
  reproducibility: '材料报告代表参数；当前附录未提供可执行代码、网格与收敛设置。' };
const fields = Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { summary: core[field], sourcePassageIds: ['P00001'] }]));
const semantic = { chosenRepresentativeCase: 'reported model', fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, [{
  statement: core[field], type: 'bounded_synthesis', conditionCase: 'supplied appendix',
  comparison: null, operation: null, evidenceIds: ['P00001'],
}]])) };
const rejected = { fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { ...fields[field], verdict: 'accepted', issues: [] }])),
  needsMoreEvidence: [], claimSuggestions: [{ clientKey: 'claim', sourceField: 'insight', kind: 'core',
    statement: core.insight, conditions: [], limitations: [], sourceBindings: [{ sourcePassageId: 'P99999', relation: 'supports' }] }] };

describe('private failed source-review output', () => {
  it.each(['draft', 'saved'] as const)('reviews candidate science and its source context, not only parent links (%s)', async mode => {
    const scopedMap = structuredClone(sourceMap);
    const texts = [
      'This paper describes a numerical model, not an experimental measurement. ',
      'Particles are homogeneous along the beta direction. The field is constant along alpha due to structural symmetry. ',
      'The receiving surface uses equal optical paths. Case A gives 17 units; the separate scan case B gives 31 units. ',
    ];
    scopedMap.pages = texts.map((text, index) => ({ ...structuredClone(sourceMap.pages[0]!), page: index + 1,
      blocks: [{ ...structuredClone(sourceMap.pages[0]!.blocks[0]!), id: `scope-${index}`, text: text + 'Source context. '.repeat(55) }] }));
    const draft = [{ clientKey: 'candidate', sourceField: 'method', kind: 'core', statement: '实验表明粒子沿alpha方向均匀分布。',
      conditions: [], limitations: [], sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }];
    const saved = { ...structuredClone(rejected), claimSuggestions: structuredClone(draft) };
    saved.claimSuggestions[0]!.sourceBindings[0]!.sourcePassageId = 'P00002';
    const text = JSON.stringify(saved);
    const final = structuredClone(saved);
    Object.assign(final.fields.method!, { verdict: 'revised', summary: '数值模型中粒子沿beta方向均匀分布；场沿alpha方向恒定，接收面采用等光程。',
      sourcePassageIds: ['P00001', 'P00002', 'P00003'], issues: [{ code: 'PHYSICS_MISINTERPRETATION',
        problem: '区分粒子分布与场的方向，保留数值性质和接收条件。', sourcePassageIds: ['P00001', 'P00002', 'P00003'] }] });
    Object.assign(final.claimSuggestions[0]!, { statement: '数值模型假设粒子沿beta方向均匀，场由结构对称性沿alpha方向恒定。',
      conditions: ['等光程接收面；算例A与独立扫描B分别报告17与31，不能混用。'], limitations: ['非实验验证'],
      sourceBindings: [{ sourcePassageId: 'P00002', relation: 'supports' }, { sourcePassageId: 'P00003', relation: 'qualifies' }] });
    const outputs = [semantic, { fields, needsMoreEvidence: [], draftClaims: draft }, final];
    const requests: Parameters<Provider['complete']>[0][] = [];
    const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async request => {
      requests.push(request); const output = outputs[requests.length - 1];
      if (!output) throw new Error('Unexpected provider call');
      return { text: JSON.stringify(output), model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    } }] });
    const authorizationContext = { taskId: 'task', workspaceId: 'workspace', actorId: 'actor' };
    const composed = await extractHandler(gateway, { payload: {} }, { sourceMap: scopedMap,
      scientificReview: { requestId: 'compose', authorizationContext } });
    expect(composed.scientificReview?.draftClaims).toEqual(draft);
    expect(composed.reviewedClaimSuggestions).toBeUndefined();
    if (mode === 'saved') delete composed.scientificReview!.draftClaims;
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap: scopedMap, previousResult: composed,
      requireReusableSemanticStage: true, reviewExistingSourceTaskId: 'compose', scientificReview: {
        requestId: 'review', authorizationContext, requireReviewedClaims: true,
        ...(mode === 'saved' ? { savedReviewOutput: { sourceTaskId: 'failed', structuredAttempt: 2, text,
          byteLength: Buffer.byteLength(text), responseHash: createHash('sha256').update(text).digest('hex'),
          promptHash: 'a'.repeat(64), provider: 'fixture', model: 'fixture' }, beforeReviewProviderCall: async () => {} } : {}),
      } });
    expect(requests).toHaveLength(3);
    const prompt = requests[2]!.messages.map(message => message.content).join('\n');
    expect(prompt).toContain(mode === 'saved' ? text : JSON.stringify(draft));
    expect(prompt).toContain('[P00002'); expect(prompt).toContain('Particles are homogeneous along the beta direction');
    expect(prompt).toContain('field is constant along alpha'); expect(prompt).toContain('equal optical paths');
    expect(prompt).toContain('逐条'); expect(prompt).toContain('未审');
    expect(result.scientificReview?.status).toBe('review_received');
    expect(result.core.method).toBe(final.fields.method!.summary);
    expect(result.reviewedClaimSuggestions?.[0]).toMatchObject({ statement: final.claimSuggestions[0]!.statement,
      conditions: final.claimSuggestions[0]!.conditions, limitations: ['非实验验证'] });
    expect(result.scientificReview).not.toHaveProperty('draftClaims');
    if (mode === 'draft') expect(composed.scientificReview?.draftClaims).toEqual(draft);
  });

  it('sanitizes malformed saved JSON before any review call', async () => {
    const outputs = [semantic, { fields, needsMoreEvidence: [], draftClaims: [] }]; let calls = 0;
    const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async () => {
      const value = outputs[calls++]; if (!value) throw new Error('Unexpected review call');
      return { text: JSON.stringify(value), model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    } }] });
    const authorizationContext = { taskId: 'task', workspaceId: 'workspace', actorId: 'actor' };
    const composed = await extractHandler(gateway, { payload: {} }, { sourceMap,
      scientificReview: { requestId: 'compose', authorizationContext } });
    const text = '{"PRIVATE_SOURCE_SENTINEL": invalid}';
    const result = extractHandler(gateway, { payload: {} }, { sourceMap, previousResult: composed,
      requireReusableSemanticStage: true, reviewExistingSourceTaskId: 'compose', scientificReview: {
        requestId: 'review', authorizationContext, requireReviewedClaims: true, beforeReviewProviderCall: async () => {},
        savedReviewOutput: { sourceTaskId: 'failed', structuredAttempt: 2, text, byteLength: Buffer.byteLength(text),
          responseHash: createHash('sha256').update(text).digest('hex'), promptHash: 'a'.repeat(64), provider: 'fixture', model: 'fixture' },
      } });
    await expect(result).rejects.toThrow('[blocked] Saved source review JSON is invalid');
    expect(calls).toBe(2);
  });

  it.each(['missing', 'empty', 'invalid'] as const)('distinguishes historical absence from %s private drafts', async change => {
    const draft = [{ ...rejected.claimSuggestions[0]!, sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }];
    const outputs = [semantic, { fields, needsMoreEvidence: [], draftClaims: draft }, { ...rejected, claimSuggestions: draft }]; let calls = 0;
    const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async () => {
      const response = outputs[calls++]; if (!response) throw new Error('Review must not generate missing drafts');
      return { text: JSON.stringify(response), model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    } }] });
    const authorizationContext = { taskId: 'task', workspaceId: 'workspace', actorId: 'actor' };
    const composed = await extractHandler(gateway, { payload: {} }, { sourceMap,
      scientificReview: { requestId: 'compose', authorizationContext, requireReviewedClaims: false } });
    expect(composed.scientificReview?.draftClaims).toHaveLength(1);
    if (change === 'missing') delete composed.scientificReview!.draftClaims;
    if (change === 'empty') composed.scientificReview!.draftClaims = [];
    if (change === 'invalid') composed.scientificReview!.draftClaims![0]!.sourceBindings[0]!.sourcePassageId = 'P99999';
    const review = extractHandler(gateway, { payload: {} }, { sourceMap, previousResult: composed,
      requireReusableSemanticStage: true, reviewExistingSourceTaskId: 'compose',
      scientificReview: { requestId: 'review', authorizationContext, requireReviewedClaims: true } });
    if (change === 'missing') {
      await expect(review).resolves.toMatchObject({ scientificReview: { status: 'review_received' } });
      expect(calls).toBe(3);
    } else {
      await expect(review).rejects.toThrow(/\[blocked\].*draft claims/);
      expect(calls).toBe(2);
    }
  });

  it('requires private drafts in the existing composition response even without the final-review flag', async () => {
    let calls = 0;
    const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async () => {
      calls++; return { text: JSON.stringify(calls === 1 ? semantic : { fields, needsMoreEvidence: [] }),
        model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    } }] });
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap });
    expect(calls).toBe(3); // Existing composition call plus its one repair; no new stage.
    expect(result.scientificReview?.status).toBe('blocked_scientific_review');
    expect(result.reviewedClaimSuggestions).toBeUndefined();
  });

  it.each(['corrected', 'invalid', 'transport', 'source-changed', 'body-changed', 'permission-changed', 'claim-source-missing'] as const)(
    'corrects only the saved rejected review in one authorized call (%s)', async outcome => {
    const saved = structuredClone(rejected);
    saved.claimSuggestions[0]!.sourceBindings[0]!.sourcePassageId = 'P00001';
    saved.claimSuggestions.push({ ...structuredClone(saved.claimSuggestions[0]!), clientKey: 'counter', kind: 'counter' });
    const corrected = structuredClone(saved);
    Object.assign(corrected.claimSuggestions[1]!, { parentClientKey: 'claim' });
    if (outcome === 'source-changed') saved.fields.insight!.summary = '这不是原来被审查的科学断言。';
    if (outcome === 'claim-source-missing') saved.claimSuggestions[0]!.sourceBindings[0]!.sourcePassageId = 'P99999';
    const text = JSON.stringify(saved);
    const savedReviewOutput = { sourceTaskId: 'failed-review', structuredAttempt: 2, text,
      byteLength: Buffer.byteLength(text), responseHash: createHash('sha256').update(text).digest('hex'),
      promptHash: 'a'.repeat(64), provider: 'fixture', model: 'fixture' };
    if (outcome === 'body-changed') savedReviewOutput.text += ' ';
    const requests: Parameters<Provider['complete']>[0][] = [];
    const provider: Provider = { name: 'fixture', model: 'fixture', complete: async request => {
      requests.push(request);
      if (requests.length > 3) throw new Error('Unexpected extra provider request');
      if (requests.length === 3 && outcome === 'transport') throw new Error('connection closed after submit');
      const response = requests.length === 1 ? semantic : requests.length === 2 ? { fields, needsMoreEvidence: [], draftClaims: [{ ...rejected.claimSuggestions[0]!, sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] }
        : outcome === 'invalid' ? saved : corrected;
      return { text: JSON.stringify(response), model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    } };
    const gateway = new AiGateway({ providers: [provider] });
    const authorizationContext = { taskId: 'source-review', workspaceId: 'workspace', actorId: 'actor' };
    const composed = await extractHandler(gateway, { payload: {} }, { sourceMap,
      scientificReview: { requestId: 'source-compose', authorizationContext } });
    let authorizationChecks = 0;
    const correction = extractHandler(gateway, { payload: {} }, { sourceMap, previousResult: composed,
      requireReusableSemanticStage: true, reviewExistingSourceTaskId: 'source-compose',
      scientificReview: { requestId: 'saved-review-correction', authorizationContext, requireReviewedClaims: true,
        savedReviewOutput, beforeReviewProviderCall: async () => {
          authorizationChecks++;
          if (outcome === 'permission-changed') throw new Error('Permission revoked');
        } } });
    if (outcome === 'source-changed' || outcome === 'body-changed' || outcome === 'claim-source-missing') {
      await expect(correction).rejects.toThrow(/saved|review|source/i);
      expect(requests).toHaveLength(2);
    } else {
      const result = await correction;
      expect(authorizationChecks).toBe(1);
      expect(requests).toHaveLength(outcome === 'permission-changed' ? 2 : 3);
      if (outcome === 'corrected') {
        expect(result.scientificReview?.status).toBe('review_received');
        expect(result.core).toEqual(composed.core);
        expect(result.reviewedClaimSuggestions).toHaveLength(2);
        expect(requests[2]!.messages).toContainEqual({ role: 'assistant', content: text });
        expect(requests[2]!.messages.at(-1)!.content).toContain('parentClientKey');
      } else {
        expect(result.scientificReview?.status).not.toBe('review_received');
        expect(result.reviewedClaimSuggestions).toBeUndefined();
      }
    }
  });

  it.each([{ corrected: true, crowded: false, changedSources: false }, { corrected: false, crowded: false, changedSources: false },
    { corrected: false, crowded: true, changedSources: false }, { corrected: false, crowded: false, changedSources: true }])(
    'reports field and Claims errors together in the existing single repair (%j)', async ({ corrected, crowded, changedSources }) => {
    const reviewSourceMap = structuredClone(sourceMap);
    if (changedSources) reviewSourceMap.pages[0]!.blocks[0]!.text += ' The model uses fixed parameters.'.repeat(40);
    if (changedSources) reviewSourceMap.pages.push({ ...structuredClone(reviewSourceMap.pages[0]!), page: 2,
      blocks: [{ ...structuredClone(reviewSourceMap.pages[0]!.blocks[0]!), id: 'context-block',
        text: 'The appendix also describes a baseline control calculation with fixed input parameters.' }] });
    const mixed = structuredClone(rejected);
    mixed.claimSuggestions[0]!.sourceBindings[0]!.sourcePassageId = 'P00001';
    mixed.fields.insight!.summary = '改写后的候选不能继续标记为未改动的 accepted。';
    mixed.claimSuggestions.push({ ...structuredClone(mixed.claimSuggestions[0]!), clientKey: 'counter', kind: 'counter',
      sourceBindings: [{ sourcePassageId: 'P99999', relation: 'supports' }] });
    if (changedSources) mixed.fields.insight!.sourcePassageIds = ['P00002'];
    if (crowded) {
      for (const field of SDF_CORE_FIELDS) mixed.fields[field]!.summary = `改写${field}`;
      for (let index = 2; index < 12; index++) mixed.claimSuggestions.push({ ...structuredClone(mixed.claimSuggestions[1]!),
        clientKey: `counter-${index}`, sourceBindings: [{ sourcePassageId: 'P99999', relation: 'supports' },
          { sourcePassageId: 'P88888', relation: 'context' }] });
    }
    const repaired = structuredClone(mixed);
    repaired.fields.insight!.summary = core.insight;
    Object.assign(repaired.claimSuggestions[1]!, { parentClientKey: 'claim',
      sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] });
    const outputs = [semantic, { fields, needsMoreEvidence: [], draftClaims: [{ ...rejected.claimSuggestions[0]!, sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] }, mixed, corrected ? repaired : mixed];
    const requests: Parameters<Provider['complete']>[0][] = [];
    const provider: Provider = { name: 'fixture', model: 'fixture', complete: async request => {
      const response = outputs[requests.length]; requests.push(request);
      if (!response) throw new Error('Unexpected request');
      return { text: JSON.stringify(response), model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    } };
    const gateway = new AiGateway({ providers: [provider] });
    const authorizationContext = { taskId: 'source-review', workspaceId: 'workspace', actorId: 'actor' };
    const composed = await extractHandler(gateway, { payload: {} }, { sourceMap: reviewSourceMap,
      scientificReview: { requestId: 'source-compose', authorizationContext } });
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap: reviewSourceMap, previousResult: composed,
      requireReusableSemanticStage: true, reviewExistingSourceTaskId: 'source-compose',
      scientificReview: { requestId: 'source-review', authorizationContext, requireReviewedClaims: true } });
    expect(requests).toHaveLength(4);
    const feedback = requests[3]!.messages.at(-1)!.content;
    expect(feedback).toContain('insight: accepted requires unchanged');
    expect(feedback).toContain('claimSuggestions[1].parentClientKey: required_non_core');
    if (changedSources) expect(feedback).not.toContain('outside_field_source_ids');
    else expect(feedback).toContain('claimSuggestions[1].sourceBindings[0].sourcePassageId: outside_field_source_ids');
    expect(feedback.slice(feedback.indexOf('只返回fields')).length).toBeLessThanOrEqual(2_000);
    if (corrected) {
      expect(result.scientificReview?.status).toBe('review_received');
      expect(result.reviewedClaimSuggestions).toHaveLength(2);
      expect(result.scientificReview?.rejectedOutputs).toBeUndefined();
    } else {
      expect(result.scientificReview?.status).toBe('blocked_scientific_review');
      expect(result.reviewedClaimSuggestions).toBeUndefined();
      expect(result.scientificReview?.rejectedOutputs).toHaveLength(2);
    }
  });

  it('accepts a corrected source-bound review after one bounded repair without repeating composition', async () => {
    const corrected = structuredClone(rejected);
    corrected.claimSuggestions[0]!.sourceBindings[0]!.sourcePassageId = 'P00001';
    const outputs = [semantic, { fields, needsMoreEvidence: [], draftClaims: [{ ...rejected.claimSuggestions[0]!, sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] }, rejected, corrected];
    const requests: Parameters<Provider['complete']>[0][] = [];
    const provider: Provider = { name: 'fixture', model: 'fixture', complete: async request => {
      const response = outputs[requests.length]; requests.push(request);
      if (!response) throw new Error('Unexpected request');
      return { text: JSON.stringify(response), model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    } };
    const gateway = new AiGateway({ providers: [provider] });
    const authorizationContext = { taskId: 'source-review', workspaceId: 'workspace', actorId: 'actor' };
    const composed = await extractHandler(gateway, { payload: {} }, { sourceMap,
      scientificReview: { requestId: 'source-compose', authorizationContext } });
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap, previousResult: composed,
      requireReusableSemanticStage: true, reviewExistingSourceTaskId: 'source-compose',
      scientificReview: { requestId: 'source-review', authorizationContext, requireReviewedClaims: true } });
    expect(requests).toHaveLength(4);
    expect(requests[3]!.messages).toContainEqual({ role: 'assistant', content: JSON.stringify(rejected) });
    expect(result.core).toEqual(composed.core);
    expect(result.scientificReview?.status).toBe('review_received');
    expect(result.reviewedClaimSuggestions).toHaveLength(1);
    expect(result.scientificReview?.rejectedOutputs).toBeUndefined();
  });

  it.each(['INVALID PRIVATE JSON', '坏'.repeat(44_000)])('retains bounded diagnosis without accepting failed science (%#. case)', async lastText => {
    const requests: Parameters<Provider['complete']>[0][] = [];
    const outputs = [JSON.stringify(semantic), JSON.stringify({ fields, needsMoreEvidence: [], draftClaims: [{ ...rejected.claimSuggestions[0]!, sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] }), JSON.stringify(rejected), lastText];
    const provider: Provider = { name: 'fixture', model: 'fixture', complete: async request => {
      const text = outputs[requests.length]; requests.push(request);
      if (text === undefined) throw new Error('Unexpected request');
      return { text, model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    } };
    const gateway = new AiGateway({ providers: [provider] });
    const authorizationContext = { taskId: 'source-review', workspaceId: 'workspace', actorId: 'actor' };
    const composed = await extractHandler(gateway, { payload: {} }, {
      sourceMap, scientificReview: { requestId: 'source-compose', authorizationContext },
    });
    expect(composed.needsMoreInformation).toEqual([]);
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap, previousResult: composed,
      requireReusableSemanticStage: true, reviewExistingSourceTaskId: 'source-compose',
      scientificReview: { requestId: 'source-review', authorizationContext, requireReviewedClaims: true } });
    expect(requests).toHaveLength(4);
    expect(requests[3]!.messages).toContainEqual({ role: 'assistant', content: JSON.stringify(rejected) });
    expect(result.scientificReview?.status).toBe('blocked_scientific_review');
    expect(result.reviewedClaimSuggestions).toBeUndefined();
    expect(result.scientificReview?.fieldReviews).toBeUndefined();
    for (const field of SDF_CORE_FIELDS) {
      expect(result.core[field]).toBe('');
      expect(result.unverifiedSummaries?.[field]).toBe(core[field]);
    }
    const receipts = result.scientificReview?.rejectedOutputs;
    expect(receipts).toHaveLength(2);
    expect(receipts?.[0]).toMatchObject({ kind: 'schema_validation', diagnostic: 'claims_source_unmaterializable',
      structuredAttempt: 1, text: JSON.stringify(rejected) });
    expect(receipts?.[1]).toMatchObject({ kind: 'json_parse', structuredAttempt: 2, byteLength: Buffer.byteLength(lastText),
      responseHash: expect.stringMatching(/^[a-f0-9]{64}$/), finishReason: 'stop' });
    if (Buffer.byteLength(lastText) > 131_072) {
      expect(receipts?.[1]).toMatchObject({ omissionReason: 'response_byte_limit' });
      expect(receipts?.[1]).not.toHaveProperty('text');
    } else expect(receipts?.[1]?.text).toBe(lastText);
  });
});
