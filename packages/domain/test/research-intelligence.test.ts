import { describe, expect, it } from 'vitest';
import {
  deserializeExtractionResult,
  serializeExtractionResult,
  validateClaimGraph,
  validateSourceLocator,
  type ClaimNode,
  type ExtractionProvenance,
} from '../src/research-intelligence';

const provenance: ExtractionProvenance = {
  source: 'deterministic_parser',
  provider: 'local',
  providerVersion: '1.0.0',
  inputHash: 'sha256:input',
};

function claim(id: string, overrides: Partial<ClaimNode> = {}): ClaimNode {
  return {
    id,
    researchObjectId: 'ro-1',
    versionId: 'version-1',
    kind: 'core',
    statement: `Statement ${id}`,
    assessment: 'supported',
    conditions: [],
    limitations: [],
    evidenceIds: [],
    counterEvidenceIds: [],
    provenance,
    ...overrides,
  };
}

describe('research intelligence domain contracts', () => {
  it('validates a publishable graph without changing the input', () => {
    const graph = ['a', 'b', 'c'].map((id) => claim(id));
    const before = structuredClone(graph);

    const validated = validateClaimGraph(graph, 'publish');

    expect(validated).toEqual(before);
    expect(validated).not.toBe(graph);
    expect(graph).toEqual(before);
  });

  it('allows draft graphs but requires 3–7 core claims to publish', () => {
    const graph = [claim('a')];
    expect(() => validateClaimGraph(graph, 'draft')).not.toThrow();
    expect(() => validateClaimGraph(graph, 'publish')).toThrow(/3 to 7 core/i);
  });

  it('rejects duplicate ids, missing parents, cross-scope parents, and cycles', () => {
    expect(() => validateClaimGraph([claim('a'), claim('a')])).toThrow(/duplicate/i);
    expect(() => validateClaimGraph([claim('a', { parentClaimId: 'missing', kind: 'supporting' })])).toThrow(/parent/i);
    expect(() => validateClaimGraph([
      claim('a'),
      claim('b', { parentClaimId: 'a', kind: 'supporting', versionId: 'version-2' }),
    ])).toThrow(/scope/i);
    expect(() => validateClaimGraph([
      claim('a', { parentClaimId: 'b', kind: 'supporting' }),
      claim('b', { parentClaimId: 'a', kind: 'supporting' }),
    ])).toThrow(/cycle/i);
  });

  it('handles a 20,000-node parent chain iteratively', () => {
    const graph = Array.from({ length: 20_000 }, (_, index) => claim(String(index), {
      kind: index === 0 ? 'core' : 'supporting',
      parentClaimId: index === 0 ? undefined : String(index - 1),
    }));
    expect(validateClaimGraph(graph)).toHaveLength(20_000);
  });

  it('accepts valid locators and rejects non-finite, invalid, or inverted ranges', () => {
    expect(validateSourceLocator({
      artifactId: 'artifact-1', contentHash: 'sha256:source', page: 1,
      boundingBox: { x: 0, y: 1, width: 100, height: 40 },
      charRange: { start: 4, end: 9 },
      tableCell: { row: 1, column: 2 },
      codeRange: { commit: 'abc', path: 'src/main.ts', startLine: 1, endLine: 9 },
    })).toMatchObject({ artifactId: 'artifact-1' });
    expect(() => validateSourceLocator({ artifactId: 'a', contentHash: 'h', page: Infinity })).toThrow(/finite/i);
    expect(() => validateSourceLocator({ artifactId: 'a', contentHash: 'h', charRange: { start: 8, end: 2 } })).toThrow(/range/i);
    expect(() => validateSourceLocator({ artifactId: 'a', contentHash: 'h', codeRange: { commit: 'x', path: '', startLine: 2, endLine: 1 } })).toThrow(/range|path/i);
  });

  it('round-trips only the explicit extraction-result union', () => {
    const value = {
      status: 'failed' as const,
      retryable: true,
      provider: 'parser-service',
      message: 'Transient timeout',
      providerPayload: { leaked: true },
    };
    const encoded = serializeExtractionResult(value);
    expect(encoded).not.toContain('providerPayload');
    expect(deserializeExtractionResult(encoded)).toEqual({
      status: 'failed', retryable: true, provider: 'parser-service', message: 'Transient timeout',
    });
    expect(() => deserializeExtractionResult('{"status":"succeeded","warnings":[]}')).toThrow(/sourceMap/i);
    expect(() => deserializeExtractionResult('{"status":"unknown"}')).toThrow(/status/i);
  });
});
