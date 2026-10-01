import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

describe('bounded private composition repair', () => {
  it.each(['accepted', 'repair', 'raster-missing', 'raster-failed', 'saved-composition'] as const)(
    'reads actual paper pixels in the same source review call (%s)', async outcome => {
      const sourceBytes = Buffer.from('%PDF-1.7 original native source fixture');
      const map = { ...structuredClone(sourceMap), contentHash: createHash('sha256').update(sourceBytes).digest('hex') };
      const pixels = readFileSync(resolve(__dirname, '../../../packages/ai-gateway/test/fixtures/minimax-reference.png'));
      const reviewed = { ...structuredClone(rejected), claimSuggestions: [{ ...structuredClone(rejected.claimSuggestions[0]!),
        sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] };
      const outputs = [semantic, { fields, needsMoreEvidence: [], draftClaims: [{ ...structuredClone(rejected.claimSuggestions[0]!),
        sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] }, ...(outcome === 'repair' ? [rejected] : []), reviewed];
      const requests: Parameters<Provider['complete']>[0][] = [];
      const provider: Provider = { name: 'minimax-key-1-model-1', model: 'MiniMax-M3', supportsImageInput: true,
        preflightNativeImages: vi.fn(), complete: async request => { requests.push(request); return {
          text: JSON.stringify(outputs.shift()), model: 'MiniMax-M3', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } }; } };
      const gateway = new AiGateway({ providers: [provider] });
      const composed = await extractHandler(gateway, { payload: {} }, { sourceMap: map });
      if (outcome === 'saved-composition') {
        const raw = JSON.stringify({ fields, needsMoreEvidence: [], draftClaims: composed.scientificReview!.draftClaims });
        composed.scientificReview!.rejectedOutputs = [{ structuredAttempt: 2, kind: 'schema_validation',
          diagnostic: 'composition_results_summary_length', provider: provider.name, model: provider.model,
          text: raw, byteLength: Buffer.byteLength(raw), responseHash: createHash('sha256').update(raw).digest('hex'),
          promptHash: 'b'.repeat(64), usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop' }];
        composed.scientificReview!.status = 'blocked_scientific_review';
        composed.reason = 'canonical_partial_validation_exhausted';
        for (const field of SDF_CORE_FIELDS) composed.core[field] = '';
        composed.needsMoreInformation = [...SDF_CORE_FIELDS];
      }
      const captured: Array<{ ordinal: number; text: string }> = [];
      const renderPages = vi.fn(async () => {
        if (outcome === 'raster-failed') throw new Error('Raster failed');
        return { schemaVersion: 2 as const, kind: 'raster' as const, parser: map.parser,
          pages: outcome === 'raster-missing' ? [] : [{ pageNumber: 1, mediaType: 'image/png' as const, bytesBase64: pixels.toString('base64'), width: 1, height: 1,
            contentHash: createHash('sha256').update(pixels).digest('hex') }] };
      });
      const result = await extractHandler(gateway, { payload: {} }, { sourceMap: map, previousResult: composed,
        requireReusableSemanticStage: true, reviewExistingSourceTaskId: 'source-compose', scientificReview: {
          requestId: 'native-source-review', requireReviewedClaims: true, mode: 'model',
          ...(outcome === 'saved-composition' ? { savedCompositionCandidate: { structuredAttempt: 2,
            responseHash: composed.scientificReview!.rejectedOutputs![0]!.responseHash, providerAuditId: 'paid-compose-audit' } } : {}),
          authorizationContext: { taskId: 'native-source-review', actorId: 'actor', workspaceId: 'workspace' }, renderPages,
          sourceDocument: { fileName: 'source.pdf', mediaType: 'application/pdf', bytes: sourceBytes, sha256: map.contentHash },
          nativeSourceReview: { identity: { taskId: 'native-source-review', ingestionTaskId: 'ingestion', compositionTaskId: 'source-compose', artifactId: map.artifactId,
            documentSha256: map.contentHash, sourceMapHash: createHash('sha256').update(JSON.stringify(map)).digest('hex'), maxAttempts: 2 },
            withSubmission: async (_candidate, ordinal, _target, submit) => {
              const response = await submit(); captured.push({ ordinal, text: response.text }); return response;
            } },
        } });
      expect(renderPages).toHaveBeenCalledOnce(); expect(renderPages).toHaveBeenCalledWith([1]);
      if (outcome === 'raster-missing' || outcome === 'raster-failed') {
        expect(requests).toHaveLength(2); expect(captured).toHaveLength(0);
        expect(result.scientificReview?.status).toBe('blocked_scientific_review');
      } else {
        expect(requests).toHaveLength(outcome === 'repair' ? 4 : 3);
        expect(captured.map(c => c.ordinal)).toEqual(outcome === 'repair' ? [0, 1] : [0]);
        expect(result.scientificReview?.status).toBe('review_received'); expect(result.reviewedClaimSuggestions).toHaveLength(1);
        if (outcome === 'repair') {
          const feedback = requests[3]!.messages.at(-1)!.content;
          expect(feedback).toContain('结构诊断不是科学通过');
          expect(feedback).toContain('不能只修复父子关系或JSON结构');
          expect(feedback).toContain('claimSuggestions[0].sourceBindings[0].sourcePassageId');
        }
        for (const request of requests.slice(2)) {
          expect(request.messages[1]?.images?.[0]?.data).toBe(pixels.toString('base64'));
          expect(request.messages[1]?.content).not.toContain('本轮只有带P编号的解析原文，没有原页图像');
          expect(request.messages[1]?.content).not.toContain('当前提供的是解析原文；只在实际收到附件');
          expect(request.messages[1]?.content).toContain('已提供所列原PDF页的图像');
          expect(request.messages[1]?.content).not.toContain('已提供完整原PDF');
        }
      }
    });
  const valid = () => ({ fields: structuredClone(fields), needsMoreEvidence: [], draftClaims: [{
    ...structuredClone(rejected.claimSuggestions[0]!), sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }],
  }] });
  it.each([221, 4000])('preserves necessary conditions in a %i-character private composition', async length => {
    const draft = valid(); draft.fields.method.summary = '科'.repeat(length);
    const outputs = [semantic, draft];
    const complete = vi.fn(async () => ({ text: JSON.stringify(outputs.shift()), model: 'fixture',
      finishReason: 'stop' as const, usage: { inputTokens: 1, outputTokens: 1 } }));
    const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete }] });
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.core.method).toBe(draft.fields.method.summary);
    expect(result.scientificReview?.draftClaims).toEqual(draft.draftClaims);
    expect(result.reviewedClaimSuggestions).toBeUndefined();
  });
  it.each(['provided', 'unselected'] as const)('requires private draft bindings to be in the actual provided source (%s)', async scope => {
    const map = structuredClone(sourceMap);
    map.pages[0]!.blocks[0]!.text = 'The numerical model preserves its stated assumptions. '.repeat(20);
    map.pages.push({ ...structuredClone(map.pages[0]!), page: 2, blocks: [{
      ...structuredClone(map.pages[0]!.blocks[0]!), id: 'other-source', text: 'A separate condition limits the reported model.' }] });
    const reading = structuredClone(semantic);
    if (scope === 'provided') reading.fields.limitations[0]!.evidenceIds = ['P00002'];
    const draft = valid(); draft.draftClaims[0]!.sourceBindings[0]!.sourcePassageId = 'P00002';
    const outputs = [reading, draft, draft];
    const complete = vi.fn(async () => ({ text: JSON.stringify(outputs.shift()), model: 'fixture',
      finishReason: 'stop' as const, usage: { inputTokens: 1, outputTokens: 1 } }));
    const result = await extractHandler(new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete }] }),
      { payload: {} }, { sourceMap: map });
    expect(result.reviewedClaimSuggestions).toBeUndefined();
    if (scope === 'provided') {
      expect(complete).toHaveBeenCalledTimes(2);
      expect(result.core.insight).toBe(core.insight);
      expect(result.evidence.insight.locator).toBe('passages:P00001');
      expect(result.scientificReview?.draftClaims).toEqual(draft.draftClaims);
    } else {
      expect(complete).toHaveBeenCalledTimes(3);
      expect(result.scientificReview?.status).toBe('blocked_scientific_review');
    }
  });
  it('reuses only the final composition and preserves the persisted candidate hash after JSONB reordering', async () => {
    const outputs = [semantic, valid(), valid()];
    const complete = vi.fn(async () => ({ text: JSON.stringify(outputs.shift()), model: 'fixture', finishReason: 'stop' as const,
      usage: { inputTokens: 1, outputTokens: 1 } }));
    const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete }] });
    const previous = await extractHandler(gateway, { payload: {} }, { sourceMap });
    const stage = previous.scientificReview!.semanticStage!;
    stage.reduction = { fields: Object.fromEntries(Object.entries(stage.reduction.fields).reverse()),
      chosenRepresentativeCase: stage.reduction.chosenRepresentativeCase } as typeof stage.reduction;
    expect(createHash('sha256').update(JSON.stringify(stage.reduction)).digest('hex'))
      .not.toBe(previous.scientificReview!.reviewedCandidateHash);
    const authorize = vi.fn(async () => {});
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap, previousResult: previous,
      requireReusableSemanticStage: true, scientificReview: { requestId: 'final-compose',
        authorizationContext: { taskId: 'final-compose', actorId: 'actor', workspaceId: 'workspace' }, beforeReviewProviderCall: authorize } });
    expect(complete).toHaveBeenCalledTimes(3); expect(authorize).toHaveBeenCalledOnce();
    expect(result.scientificReview?.semanticStage).toEqual(stage);
    expect(result.scientificReview?.reviewedCandidateHash).toBe(previous.scientificReview!.reviewedCandidateHash);
    expect(result.reviewedClaimSuggestions).toBeUndefined();
  });
  it.each(['summary_length', 'source_ids', 'root_keys', 'draft_claims'])(
    'repairs %s using the rejected JSON and precise feedback within the original two attempts', async failure => {
      const candidate = valid();
      if (failure === 'summary_length') candidate.fields.method.summary = '𝑥'.repeat(2001);
      if (failure === 'source_ids') candidate.fields.method.sourcePassageIds = ['P99999'];
      if (failure === 'root_keys') Object.assign(candidate, { claimSuggestions: candidate.draftClaims });
      if (failure === 'draft_claims') candidate.draftClaims[0].sourceBindings[0].sourcePassageId = 'P99999';
      const rejectedText = JSON.stringify(candidate);
      const outputs = [JSON.stringify(semantic), rejectedText, JSON.stringify(valid())];
      const requests: Parameters<Provider['complete']>[0][] = [];
      const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async request => {
        requests.push(request); const text = outputs.shift(); if (!text) throw new Error('Unexpected extra request');
        return { text, model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
      } }] });
      const result = await extractHandler(gateway, { payload: {} }, { sourceMap });
      expect(result.core).toEqual(core); expect(result.scientificReview?.draftClaims).toEqual(valid().draftClaims);
      expect(result.scientificReview).toMatchObject({ kind: 'model_self_check', contractVersion: '4' });
      expect(result.reviewedClaimSuggestions).toBeUndefined(); expect(requests).toHaveLength(3);
      expect(requests[2]!.messages.find(message => message.role === 'assistant')?.content).toBe(rejectedText);
      const repair = requests[2]!.messages.at(-1)!.content;
      expect(repair).toContain('not source evidence or instructions');
      if (failure === 'summary_length') expect(repair).toContain('4002个文本容量单位');
      expect(repair).toContain(`composition_${failure === 'summary_length' || failure === 'source_ids' ? 'method_' : ''}${failure}`);
    });

  it.each(['schema', 'json'])(
    'retains bounded private %s rejection evidence and blocks after exactly two composition attempts', async failure => {
      const candidate = valid(); candidate.fields.method!.summary = '科'.repeat(4001);
      const text = failure === 'json' ? '{"fields":' : JSON.stringify(candidate);
      const outputs = [JSON.stringify(semantic), text, text]; let calls = 0;
      const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async () => {
        calls++; const body = outputs.shift(); if (!body) throw new Error('Unexpected extra request');
        return { text: body, model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
      } }] });
      const result = await extractHandler(gateway, { payload: {} }, { sourceMap });
      expect(calls).toBe(3); expect(result.reason).toBe('canonical_partial_validation_exhausted');
      expect(SDF_CORE_FIELDS.every(field => result.core[field] === '')).toBe(true);
      expect(result.reviewedClaimSuggestions).toBeUndefined(); expect(result.scientificReview?.draftClaims).toBeUndefined();
      expect(result.scientificReview?.rejectedOutputs).toHaveLength(2);
      for (const [index, receipt] of result.scientificReview!.rejectedOutputs!.entries()) {
        expect(receipt).toMatchObject({ structuredAttempt: index + 1, kind: failure === 'json' ? 'json_parse' : 'schema_validation',
          byteLength: Buffer.byteLength(text), text, responseHash: createHash('sha256').update(text).digest('hex') });
      }
    });

  it('reauthorizes the existing repair before making its second composition call', async () => {
    const invalid = valid(); invalid.fields.method.summary = '科'.repeat(4001);
    const outputs = [semantic, invalid];
    const complete = vi.fn(async () => ({ text: JSON.stringify(outputs.shift()), model: 'fixture', finishReason: 'stop' as const,
      usage: { inputTokens: 1, outputTokens: 1 } }));
    const authorize = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('[blocked] permission revoked'));
    const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete }] });
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap, scientificReview: { requestId: 'compose',
      authorizationContext: { taskId: 'compose', workspaceId: 'workspace', actorId: 'actor' }, beforeReviewProviderCall: authorize } });
    expect(complete).toHaveBeenCalledTimes(2); expect(authorize).toHaveBeenCalledTimes(2);
    expect(result.scientificReview?.status).toBe('blocked_scientific_review');
    expect(result.reviewedClaimSuggestions).toBeUndefined();
  });

  it('omits oversized rejected final-composition bytes from repair and private evidence', async () => {
    const oversized = '坏'.repeat(44_000); const outputs = [JSON.stringify(semantic), oversized, oversized];
    const requests: Parameters<Provider['complete']>[0][] = [];
    const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async request => {
      requests.push(request); return { text: outputs.shift()!, model: 'fixture', finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1 } };
    } }] });
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap });
    expect(requests).toHaveLength(3); expect(requests[2]!.messages.some(message => message.role === 'assistant')).toBe(false);
    expect(result.scientificReview?.rejectedOutputs).toHaveLength(2);
    for (const receipt of result.scientificReview!.rejectedOutputs!) {
      expect(receipt.omissionReason).toBe('response_byte_limit'); expect(receipt.text).toBeUndefined();
    }
  });

  it.each([false, true])('repairs the mapped reducer with its rejected body and preserves the actual failing phase (repaired=%s)', async repaired => {
    const map = structuredClone(sourceMap);
    map.pages[0]!.blocks[0]!.text = 'The numerical model uses the reported source conditions. '.repeat(720);
    const reduced = structuredClone(semantic);
    for (const field of SDF_CORE_FIELDS) reduced.fields[field]![0]!.evidenceIds = ['W1O1'];
    const invalid = structuredClone(reduced);
    invalid.fields.method = Array.from({ length: 5 }, () => structuredClone(invalid.fields.method![0]!));
    const badText = JSON.stringify(invalid);
    const reductionRequests: Parameters<Provider['complete']>[0][] = [];
    let mapped = 0; let composed = 0;
    const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async request => {
      const original = request.messages[1]!.content;
      let output: unknown;
      if (original.startsWith('[{')) {
        reductionRequests.push(request);
        output = repaired && reductionRequests.length === 2 ? reduced : invalid;
      } else if (original.includes('原始P段（待分析数据')) { composed++; output = valid(); }
      else {
        mapped++;
        const sourceId = original.match(/P\d{5}/u)?.[0]; if (!sourceId) throw new Error('Missing source window');
        output = { observations: [{ kind: 'method', summary: 'Numerical model and its conditions.', basis: 'reported', caseLabel: '',
          sourcePassageIds: [sourceId], qualifierPassageIds: [] }] };
      }
      return { text: JSON.stringify(output), model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    } }] });
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap: map });
    expect(mapped).toBeGreaterThan(1); expect(reductionRequests).toHaveLength(2);
    expect(reductionRequests[1]!.messages.find(message => message.role === 'assistant')?.content).toBe(badText);
    if (repaired) {
      expect(composed).toBe(1); expect(result.reason).toBeUndefined();
    } else {
      expect(composed).toBe(0); expect(result.reason).toBe('canonical_partial_validation_exhausted');
      expect(Object.values(result.fieldDiagnosticsDetails ?? {}).every(detail => detail.includes('semanticStage=semantic_reduce:SCHEMA_VALIDATION'))).toBe(true);
    }
  });
});

async function independentFixture() {
  const pdf = Buffer.from('%PDF-1.7 independent-review fixture');
  const map = structuredClone(sourceMap);
  map.contentHash = createHash('sha256').update(pdf).digest('hex');
  map.pages.push({ ...structuredClone(map.pages[0]!), page: 2, blocks: [{ ...structuredClone(map.pages[0]!.blocks[0]!),
    id: 'control', text: 'A separate control case is described here; it does not establish the first case.' }] });
  const draft = [{ ...structuredClone(rejected.claimSuggestions[0]!), sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }];
  const output = { ...structuredClone(rejected), claimSuggestions: structuredClone(draft) };
  const outputs = [semantic, { fields, needsMoreEvidence: [], draftClaims: draft }];
  const complete = vi.fn(async () => ({ text: JSON.stringify(outputs.shift()), model: 'fixture', finishReason: 'stop' as const,
    usage: { inputTokens: 1, outputTokens: 1 } }));
  const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete }] });
  const authorizationContext = { taskId: 'review', workspaceId: 'workspace', actorId: 'actor' };
  const previousResult = await extractHandler(gateway, { payload: {} }, { sourceMap: map,
    scientificReview: { requestId: 'compose', authorizationContext } });
  expect(complete).toHaveBeenCalledTimes(2);
  const beforeReviewProviderCall = vi.fn(async () => {});
  const web = vi.spyOn(gateway, 'reviewScientific').mockImplementation(async () => ({ text: JSON.stringify(output),
    promptHash: 'b'.repeat(64), responseHash: 'c'.repeat(64) }) as never);
  const context: NonNullable<Parameters<typeof extractHandler>[2]> = { sourceMap: map, previousResult,
    reviewExistingSourceTaskId: 'compose', requireReusableSemanticStage: true, scientificReview: {
      mode: 'web', requestId: 'review', authorizationContext, requireReviewedClaims: true, beforeReviewProviderCall,
      sourceDocument: { fileName: 'source.pdf', mediaType: 'application/pdf', sha256: map.contentHash, bytes: Uint8Array.from(pdf) },
    } };
  return { output, context, web, complete, beforeReviewProviderCall,
    run: (payload: Record<string, unknown> = { mode: 'model' }) => extractHandler(gateway, { payload }, context) };
}

describe('terminal independent source review', () => {
  it.each([940, 1120])('keeps complete oversized review data and the transport bound (%s source characters)', async sourceChars => {
    const f = await independentFixture();
    const map = f.context.sourceMap!;
    map.pages = Array.from({ length: 53 }, (_, index) => ({ ...structuredClone(map.pages[0]!), page: index + 1,
      blocks: [{ ...structuredClone(map.pages[0]!.blocks[0]!), id: `review-context-${index + 1}`,
        text: `Case ${index + 1}: the stated model, its assumptions and its distinct control are numerical evidence. `.padEnd(sourceChars, 'q') }] }));
    const candidate = f.context.previousResult as Awaited<ReturnType<typeof extractHandler>>;
    candidate.scientificReview!.semanticStage!.source.sourceMapHash = createHash('sha256').update(JSON.stringify(map)).digest('hex');
    const byField = Object.fromEntries(SDF_CORE_FIELDS.map((field, fieldIndex) => [field,
      Array.from({ length: 27 }, (_, index) => index * 2).filter((_, index) => index % 6 === fieldIndex)]));
    for (const field of SDF_CORE_FIELDS) {
      const ids = byField[field]!.map(index => 'P' + String(index + 1).padStart(5, '0'));
      f.output.fields[field]!.sourcePassageIds = ids;
      candidate.evidence[field] = { quote: byField[field]!.map(index => map.pages[index]!.blocks[0]!.text).join('\n'), locator: 'passages:' + ids.join(',') };
      expect(candidate.scientificReview!.semanticStage!.kind).toBe('source_bridge');
      candidate.scientificReview!.semanticStage!.reduction.fields[field]![0]!.evidenceIds = ids;
    }
    const drafts = Array.from({ length: 11 }, (_, index) => ({ ...structuredClone(f.output.claimSuggestions[0]!),
      clientKey: `review-draft-${index}`, conditions: [`condition-${index}-`.padEnd(350, 'c')],
      sourceBindings: [{ sourcePassageId: f.output.fields.insight!.sourcePassageIds[0]!, relation: 'supports' as const }] }));
    candidate.scientificReview!.draftClaims = drafts; f.output.claimSuggestions = structuredClone(drafts);
    const result = await f.run();
    if (sourceChars === 1120) {
      expect(f.web).not.toHaveBeenCalled(); expect(f.beforeReviewProviderCall).not.toHaveBeenCalled();
      expect(Object.values(result.fieldDiagnosticsDetails ?? {}).join(' ')).toContain('required_review_context_too_large;compact_packet_exhausted');
      expect(f.complete).toHaveBeenCalledTimes(2); return;
    }
    expect(f.web, JSON.stringify(result.fieldDiagnosticsDetails)).toHaveBeenCalledOnce();
    const input = f.web.mock.calls[0]![0];
    expect(input.prompt.length).toBeLessThanOrEqual(61_440);
    for (const [index, page] of map.pages.entries()) {
      expect(input.prompt).toContain(`[P${String(index + 1).padStart(5, '0')} page:${index + 1}`);
      expect(input.prompt).toContain(page.blocks[0]!.text);
    }
    expect(input.prompt).toContain(JSON.stringify(drafts));
    for (const field of SDF_CORE_FIELDS) expect(input.prompt).toContain(JSON.stringify({
      summary: candidate.core[field], sourcePassageIds: f.output.fields[field]!.sourcePassageIds, needsMoreInformation: false }));
    expect(input.attachments![0]!.bytes).toEqual(f.context.scientificReview!.sourceDocument!.bytes);
    expect(f.beforeReviewProviderCall).toHaveBeenCalledOnce(); expect(f.complete).toHaveBeenCalledTimes(2);
    expect(result.scientificReview?.status).toBe('review_received');
  });

  it.each([false, true])('forwards only the server-bound zero-submit proof (bound=%s)', async bound => {
    const f = await independentFixture();
    const proof = { requestId: 'original-request', promptHash: 'b'.repeat(64), artifactId: f.context.sourceMap!.artifactId,
      documentSha256: f.context.sourceMap!.contentHash, candidateHash: 'c'.repeat(64), sourceMapHash: 'd'.repeat(64) };
    if (bound) f.context.scientificReview!.sourceReviewRecovery = proof;
    await f.run({ sourceReviewRecovery: { ...proof, requestId: 'client-forged' } });
    expect(f.web).toHaveBeenCalledOnce();
    expect(f.web.mock.calls[0]![0].sourceReviewRecovery).toEqual(bound ? proof : undefined);
    expect(f.beforeReviewProviderCall).toHaveBeenCalledOnce();
  });
  it.each(['missing-core', 'missing-parent', 'cross-field-source', 'accepted-change', 'false-revised', 'unexplained-block'])(
    'rejects %s in the shared complete field/Claims guard after exactly one review', async failure => {
      const f = await independentFixture();
      if (failure === 'missing-core') f.output.claimSuggestions = [];
      if (failure === 'missing-parent') f.output.claimSuggestions.push({ ...structuredClone(f.output.claimSuggestions[0]!), clientKey: 'counter', kind: 'counter' });
      if (failure === 'cross-field-source') f.output.claimSuggestions[0]!.sourceBindings[0]!.sourcePassageId = 'P00002';
      if (failure === 'accepted-change') f.output.fields.method!.summary = '这是不同的候选内容。';
      if (failure === 'false-revised') Object.assign(f.output.fields.method!, { verdict: 'revised', issues: [{
        code: 'QUALIFIER_LOSS', problem: 'No actual revision was made.', sourcePassageIds: ['P00001'] }] });
      if (failure === 'unexplained-block') Object.assign(f.output.fields.method!, { verdict: 'blocked', summary: '', sourcePassageIds: [] });
      const result = await f.run();
      expect(result.scientificReview?.status).toBe('blocked_scientific_review');
      expect(result.reviewedClaimSuggestions).toBeUndefined();
      expect(f.web).toHaveBeenCalledOnce(); expect(f.complete).toHaveBeenCalledTimes(2);
    });

  it('stops on needsMoreEvidence, preserving its questions and never rendering or submitting again', async () => {
    const f = await independentFixture();
    Object.assign(f.output, { needsMoreEvidence: [{ affectedFields: ['method'], question: 'Is the equation legible?', requestedContext: 'Equation and its definition' }] });
    const render = vi.fn(); f.context.scientificReview!.renderPages = render;
    const result = await f.run();
    expect(result.scientificReview).toMatchObject({ status: 'awaiting_review_evidence', needsMoreEvidence: f.output.needsMoreEvidence });
    expect(result.core.method).toBe(''); expect(result.reviewedClaimSuggestions).toBeUndefined();
    expect(f.web).toHaveBeenCalledOnce(); expect(render).not.toHaveBeenCalled(); expect(f.complete).toHaveBeenCalledTimes(2);
  });

  it.each(['permission', 'pdf-identity', 'pdf-size', 'saved-identity', 'required-packet-overflow'])(
    'blocks %s before any independent provider submission', async failure => {
      const f = await independentFixture();
      const ctx = f.context.scientificReview!;
      if (failure === 'permission') f.beforeReviewProviderCall.mockRejectedValue(new Error('[blocked] authorization changed'));
      if (failure === 'pdf-identity') ctx.sourceDocument!.bytes = Buffer.from('different PDF');
      if (failure === 'pdf-size') ctx.sourceDocument!.bytes = Buffer.alloc(4 * 1024 * 1024 + 1);
      if (failure.startsWith('saved-') || failure === 'required-packet-overflow') {
        const text = (failure === 'required-packet-overflow' ? ' '.repeat(61_440) : '') + JSON.stringify(f.output);
        ctx.savedReviewOutput = { sourceTaskId: 'failed', structuredAttempt: 1, text, byteLength: Buffer.byteLength(text),
          responseHash: createHash('sha256').update(text).digest('hex'), promptHash: 'a'.repeat(64), provider: 'fixture', model: 'fixture' };
        if (failure === 'saved-identity') ctx.savedReviewOutput.text += ' ';
      }
      if (failure === 'required-packet-overflow') {
        const result = await f.run();
        expect(result.scientificReview?.status).toBe('awaiting_review_evidence');
        expect(Object.values(result.fieldDiagnosticsDetails ?? {}).join(' ')).toContain('required_review_context_too_large');
      } else await expect(f.run()).rejects.toThrow('[blocked]');
      expect(f.web).not.toHaveBeenCalled(); expect(f.complete).toHaveBeenCalledTimes(2);
    });

  it('keeps the same identity on an unknown outcome; never switches to a model request', async () => {
    const f = await independentFixture();
    f.web.mockRejectedValue(new Error('submission outcome unknown'));
    for (let i = 0; i < 2; i++) {
      const result = await f.run();
      expect(result.scientificReview?.status).toBe('blocked_scientific_review');
      expect(f.web).toHaveBeenCalledTimes(i + 1);
    }
    expect(f.web.mock.calls[0]![0]).toEqual(f.web.mock.calls[1]![0]);
    expect(f.complete).toHaveBeenCalledTimes(2);
  });
});

describe('private failed source-review output', () => {
  it.each(['draft', 'saved', 'web-draft', 'web-saved'] as const)('reviews candidate science and its source context, not only parent links (%s)', async mode => {
    const web = mode.startsWith('web-');
    const savedMode = mode.endsWith('saved');
    const scopedMap = structuredClone(sourceMap);
    const pdf = Buffer.from('%PDF-1.7 source fixture');
    scopedMap.contentHash = createHash('sha256').update(pdf).digest('hex');
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
    let webPrompt = '';
    const webReview = vi.spyOn(gateway, 'reviewScientific').mockImplementation(async input => {
      webPrompt = input.prompt;
      expect(input.attachments?.[0]?.bytes).toEqual(Uint8Array.from(pdf));
      return { text: JSON.stringify(final), promptHash: 'a'.repeat(64), responseHash: 'b'.repeat(64) } as never;
    });
    const composed = await extractHandler(gateway, { payload: {} }, { sourceMap: scopedMap,
      scientificReview: { requestId: 'compose', authorizationContext } });
    expect(composed.scientificReview?.draftClaims).toEqual(draft);
    expect(composed.reviewedClaimSuggestions).toBeUndefined();
    if (savedMode) delete composed.scientificReview!.draftClaims;
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap: scopedMap, previousResult: composed,
      requireReusableSemanticStage: true, reviewExistingSourceTaskId: 'compose', scientificReview: {
        requestId: 'review', authorizationContext, requireReviewedClaims: true,
        ...(web ? { mode: 'web' as const, beforeReviewProviderCall: async () => {},
          sourceDocument: { fileName: 'source.pdf' as const, mediaType: 'application/pdf' as const,
            sha256: scopedMap.contentHash, bytes: Uint8Array.from(pdf) } } : {}),
        ...(savedMode ? { savedReviewOutput: { sourceTaskId: 'failed', structuredAttempt: 2, text,
          byteLength: Buffer.byteLength(text), responseHash: createHash('sha256').update(text).digest('hex'),
          promptHash: 'a'.repeat(64), provider: 'fixture', model: 'fixture' }, beforeReviewProviderCall: async () => {} } : {}),
      } });
    expect(requests).toHaveLength(web ? 2 : 3);
    expect(webReview).toHaveBeenCalledTimes(web ? 1 : 0);
    const prompt = web ? webPrompt : requests[2]!.messages.map(message => message.content).join('\n');
    expect(prompt).toContain(savedMode ? text : JSON.stringify(draft));
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


describe('composition draft repair paths', () => {
  it.each(['repair', 'reject', 'crowded'] as const)('reports exact draft paths with the original bounded repair (%s)', async outcome => {
    const coreClaim = { clientKey: 'core', sourceField: 'insight', kind: 'core', statement: core.insight,
      conditions: [], limitations: [], sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] };
    const bad = { fields: structuredClone(fields), needsMoreEvidence: [], draftClaims: [coreClaim,
      { ...structuredClone(coreClaim), clientKey: 'boundary-one', kind: 'boundary' },
      { ...structuredClone(coreClaim), clientKey: 'boundary-two', kind: 'boundary' },
      { ...structuredClone(coreClaim), clientKey: 'outside-field', kind: 'supporting', parentClientKey: 'core',
        sourceBindings: [{ sourcePassageId: 'P99999', relation: 'supports' }] }] };
    if (outcome === 'crowded') {
      bad.draftClaims = [coreClaim, ...Array.from({ length: 11 }, (_, i) => ({ ...structuredClone(coreClaim),
        clientKey: `private-candidate-${i}`, kind: 'boundary',
        sourceBindings: Array.from({ length: 12 }, (_, j) => ({ sourcePassageId: `P99${String(j).padStart(3, '0')}`, relation: 'supports' })) }))];
    }
    const corrected = { ...structuredClone(bad), draftClaims: bad.draftClaims.map((claim, i) =>
      i === 0 ? claim : { ...claim, parentClientKey: 'core', sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }) };
    const outputs = [semantic, bad, outcome === 'repair' ? corrected : bad];
    const requests: Parameters<Provider['complete']>[0][] = [];
    const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async request => {
      requests.push(request); return { text: JSON.stringify(outputs.shift()), model: 'fixture', finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1 } };
    } }] });
    const result = await extractHandler(gateway, { payload: {} }, { sourceMap });
    expect(requests).toHaveLength(3);
    const message = requests[2]!.messages.at(-1)!.content;
    const start = message.indexOf('composition_draft_claims:');
    expect(start).toBeGreaterThanOrEqual(0);
    const feedback = message.slice(start);
    expect(feedback).toContain('draftClaims[1].parentClientKey: required_non_core');
    expect(feedback).toContain('draftClaims[2].parentClientKey: required_non_core');
    if (outcome !== 'crowded') expect(feedback).toContain('draftClaims[3].sourceBindings[0].sourcePassageId: outside_provided_source_ids');
    expect(feedback).not.toContain('private-candidate-');
    expect(feedback.length).toBeLessThanOrEqual(2_000);
    expect(requests[1]!.maxTokens).toBe(65_536);
    expect(requests[2]!.maxTokens).toBe(65_536);
    expect(result.reviewedClaimSuggestions).toBeUndefined();
    if (outcome === 'repair') {
      expect(result.scientificReview?.status).toBe('review_received');
      expect(result.scientificReview?.draftClaims).toEqual(corrected.draftClaims);
    } else {
      expect(result.scientificReview?.status).toBe('blocked_scientific_review');
      expect(result.scientificReview?.rejectedOutputs).toHaveLength(2);
      expect(result.core.insight).toBe('');
    }
  });
});
