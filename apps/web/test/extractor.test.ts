import { describe, expect, it } from 'vitest';
import { coreToSuggestions, extractMissingSdfFields } from '../lib/suggestions';

const emptyCore = () => ({
  schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '',
});

describe('coreToSuggestions（P1D-3：Extractor core → AiSuggestion，§5.4 逐字段 diff）', () => {
  it('非空且不同的字段 → 建议（source=extractor）', () => {
    const core = { schemaVersion: '0.1.0', problem: 'P', insight: '', method: 'M', results: '', limitations: '', reproducibility: '' };
    const suggestions = coreToSuggestions(core, emptyCore());
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({ field: 'problem', suggestion: 'P', source: 'extractor', sourceContext: 'sdf_aggregate', sourceLocator: undefined });
    expect(suggestions[1].field).toBe('method');
  });

  it('与当前相同字段 → 不产出', () => {
    const current = { schemaVersion: '0.1.0', problem: 'P', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
    const core = { ...current };
    expect(coreToSuggestions(core, current)).toHaveLength(0);
  });

  it('空 core → 无建议', () => {
    expect(coreToSuggestions(emptyCore(), emptyCore())).toHaveLength(0);
  });

  it('保留真实素材定位，结果与可复现性走高影响审阅', () => {
    const core = { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: 'R', limitations: '', reproducibility: 'RP' };
    const suggestions = coreToSuggestions(core, emptyCore(), 'manuscript.pdf · p. 12');
    expect(suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'results', sourceLocator: 'manuscript.pdf · p. 12', risk: 'high' }),
      expect.objectContaining({ field: 'reproducibility', sourceLocator: 'manuscript.pdf · p. 12', risk: 'high' }),
    ]));
  });

  it('把逐字段原文与 locator 带进可审阅建议', () => {
    const core = { schemaVersion: '0.1.0', problem: 'P', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
    const suggestions = coreToSuggestions(core, emptyCore(), {
      problem: { quote: 'Exact source sentence.', locator: 'chars:11-33' },
    });
    expect(suggestions[0]).toMatchObject({
      field: 'problem',
      evidence: { quote: 'Exact source sentence.', locator: 'chars:11-33' },
      evidenceLocation: { status: 'unverified' },
    });
  });

  it('binds a current task result to the proposal location without changing the legacy three-argument call', () => {
    const core = { schemaVersion: '0.1.0', problem: '', insight: '', method: 'Method proposal.', results: '', limitations: '', reproducibility: '' };
    const quote = 'Method proposal.';
    const evidence = { method: { quote, locator: 'chars:0-16' } };
    const canonicalResult = {
      sourceMapRef: {
        schemaVersion: 1,
        parserStatus: 'succeeded',
        artifactId: 'artifact-a',
        contentHash: 'a'.repeat(64),
        objectKey: `${'derived/source-maps/'}${'b'.repeat(64)}.json`,
        serializedSha256: 'b'.repeat(64),
        size: 100,
      },
      evidence,
      evidenceLocation: {
        method: {
          status: 'located', origin: 'model_quote', matching: 'exact', sourceLocator: {
            artifactId: 'artifact-a', contentHash: 'a'.repeat(64), blockId: 'block-2', page: 2,
            charRange: { start: 0, end: 16 }, boundingBox: { x: 0, y: 0, width: 20, height: 10 },
          },
        },
      },
    };

    expect(coreToSuggestions(core, emptyCore(), evidence)[0]).toMatchObject({ evidenceLocation: { status: 'unverified' } });
    expect(coreToSuggestions(core, emptyCore(), evidence, canonicalResult)[0]).toMatchObject({
      evidenceLocation: { status: 'located', blockId: 'block-2', page: 2 },
    });
  });

  it('keeps malformed runtime evidence out of proposal rendering and marks it unverified', () => {
    const core = { schemaVersion: '0.1.0', problem: 'P', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
    const malformed = {
      problem: { quote: { unexpected: 'object' }, locator: 'chars:0-1' },
    } as unknown as Partial<Record<import('../lib/suggestions').SdfField, { quote: string; locator: string }>>;

    expect(coreToSuggestions(core, emptyCore(), malformed)[0]).toMatchObject({
      evidence: undefined,
      evidenceLocation: { status: 'unverified' },
    });
  });

  it('only exposes recognized missing-evidence fields from an extractor result', () => {
    expect(extractMissingSdfFields({ needsMoreInformation: ['results', 'unknown', 3, 'limitations'] })).toEqual([
      'results',
      'limitations',
    ]);
    expect(extractMissingSdfFields({ needsMoreInformation: true })).toEqual([]);
    expect(extractMissingSdfFields(null)).toEqual([]);
  });
});
