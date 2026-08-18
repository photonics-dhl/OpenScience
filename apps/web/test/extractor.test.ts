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
