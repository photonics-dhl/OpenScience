import { describe, expect, it } from 'vitest';
import { getSuggestionEvidenceLocation, getSuggestionEvidenceSegments } from '../lib/suggestion-evidence';

const hash = 'a'.repeat(64);
const digest = 'b'.repeat(64);
const quote = 'Original source sentence.';
function context() {
  return {
    sourceMapIdentity: { artifactId: 'artifact-A', contentHash: hash },
    evidence: { method: { quote, locator: 'chars:0-25' } },
    evidenceLocation: { method: { status: 'located', origin: 'model_quote', matching: 'exact', sourceLocator: {
      artifactId: 'artifact-A', contentHash: hash, blockId: 'block-2', page: 2,
      charRange: { start: 0, end: 25 }, boundingBox: { x: 0, y: 0, width: 100, height: 20 },
    } } },
  };
}

describe('suggestion evidence display normalization', () => {
  it('keeps segment boundaries and rejects the entire list when one locator belongs elsewhere', () => {
    const value = context();
    const segment = { quote, sourceLocator: { ...value.evidenceLocation.method.sourceLocator, charRange: { start: 0, end: quote.length } } };
    const condition = 'provided the pulse remains weak';
    const next = { quote: condition, sourceLocator: { ...segment.sourceLocator, blockId: 'block-3', page: 3, charRange: { start: 0, end: condition.length } } };
    const canonical = { ...value, evidenceSegments: { method: [segment, next] } };
    expect(getSuggestionEvidenceSegments('method', canonical)).toEqual([
      { quote, location: { status: 'located', page: 2, blockId: 'block-2' } },
      { quote: next.quote, location: { status: 'located', page: 3, blockId: 'block-3' } },
    ]);
    next.sourceLocator.artifactId = 'other';
    expect(getSuggestionEvidenceSegments('method', canonical)).toEqual([]);
  });
  it('does not partially display duplicates, oversized lists, or malformed segment ranges as located', () => {
    const value = context();
    const segment = { quote, sourceLocator: { ...value.evidenceLocation.method.sourceLocator, charRange: { start: 0, end: quote.length } } };
    const canonical = (segments: unknown[]) => ({ ...value, evidenceSegments: { method: segments } });
    expect(getSuggestionEvidenceSegments('method', canonical([segment, segment]))).toEqual([]);
    expect(getSuggestionEvidenceSegments('method', canonical(Array(33).fill(segment)))).toEqual([]);
    expect(getSuggestionEvidenceSegments('method', canonical([{ ...segment, sourceLocator: { ...segment.sourceLocator, charRange: { start: 0, end: 2 } } }]))).toEqual([]);
    expect(getSuggestionEvidenceSegments('method', value)).toEqual([]);
  });
  it('keeps only safe page/block display values for a bound located quote', () => {
    expect(getSuggestionEvidenceLocation('method', quote, context())).toEqual({ status: 'located', blockId: 'block-2', page: 2 });
  });
  it('does not invent a page absent from the locator', () => {
    const value = context();
    delete (value.evidenceLocation.method.sourceLocator as { page?: number }).page;
    expect(getSuggestionEvidenceLocation('method', quote, value)).toEqual({ status: 'located', blockId: 'block-2' });
  });
  it.each(['ambiguous', 'cross_block', 'missing'])('never exposes a carried locator for %s', (status) => {
    const value = context();
    value.evidenceLocation.method.status = status;
    expect(getSuggestionEvidenceLocation('method', quote, value)).toEqual({ status });
  });
  it.each([undefined, null, [], {}, { sourceMapIdentity: context().sourceMapIdentity }])('degrades legacy or incomplete context', (value) => {
    expect(getSuggestionEvidenceLocation('method', quote, value)).toEqual({ status: 'unverified' });
  });
  it('rejects a different field or quote and does not retain preceding state', () => {
    expect(getSuggestionEvidenceLocation('method', quote, context()).status).toBe('located');
    expect(getSuggestionEvidenceLocation('results', quote, context()).status).toBe('unverified');
    expect(getSuggestionEvidenceLocation('method', 'Other source sentence.', context()).status).toBe('unverified');
    expect(getSuggestionEvidenceLocation('method', '', context()).status).toBe('unverified');
    expect(getSuggestionEvidenceLocation('method', quote).status).toBe('unverified');
  });
  it('rejects artifact/hash identity mismatch', () => {
    for (const key of ['artifactId', 'contentHash'] as const) {
      const value = context();
      value.evidenceLocation.method.sourceLocator[key] = key === 'artifactId' ? 'artifact-B' : 'c'.repeat(64);
      expect(getSuggestionEvidenceLocation('method', quote, value).status).toBe('unverified');
    }
  });
  it('rejects malformed reference and locator structure', () => {
    const mutations: Array<(value: ReturnType<typeof context>) => void> = [
      v => { v.sourceMapIdentity.artifactId = ''; },
      v => { v.sourceMapIdentity.contentHash = 'not-a-hash'; },
      v => { v.evidenceLocation.method.sourceLocator.blockId = ''; },
      v => { v.evidenceLocation.method.sourceLocator.page = 1.5; },
      v => { v.evidenceLocation.method.sourceLocator.charRange.end = 0; },
      v => { v.evidenceLocation.method.sourceLocator.boundingBox.width = Number.NaN; },
      v => { v.evidenceLocation.method.status = 'unknown'; },
    ];
    for (const mutate of mutations) {
      const value = context(); mutate(value);
      expect(getSuggestionEvidenceLocation('method', quote, value).status).toBe('unverified');
    }
  });

  it('rejects the private raw SourceMap reference shape even when evidence otherwise matches', () => {
    const value = context() as Record<string, unknown>;
    value.sourceMapRef = {
      schemaVersion: 1, parserStatus: 'succeeded', artifactId: 'artifact-A', contentHash: hash,
      objectKey: `derived/source-maps/${digest}.json`, serializedSha256: digest, size: 100,
    };
    delete value.sourceMapIdentity;
    expect(getSuggestionEvidenceLocation('method', quote, value)).toEqual({ status: 'unverified' });
  });
});
