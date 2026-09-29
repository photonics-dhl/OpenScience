import { describe, expect, it } from 'vitest';
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
  it('accepts a corrected source-bound review after one bounded repair without repeating composition', async () => {
    const corrected = structuredClone(rejected);
    corrected.claimSuggestions[0]!.sourceBindings[0]!.sourcePassageId = 'P00001';
    const outputs = [semantic, { fields, needsMoreEvidence: [] }, rejected, corrected];
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
    const outputs = [JSON.stringify(semantic), JSON.stringify({ fields, needsMoreEvidence: [] }), JSON.stringify(rejected), lastText];
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
