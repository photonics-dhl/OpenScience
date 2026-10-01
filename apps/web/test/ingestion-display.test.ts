import { describe, expect, it } from 'vitest';
import { hasEmptyIngestionCore } from '../lib/ingestion-display';

const core = { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
describe('ingestion display evidence', () => {
  it('recognizes all six explicitly blank fields without depending on retry count', () => {
    expect(hasEmptyIngestionCore({ state: 'needs_review', result: { core: { ...core, method: ' \n ' }, evidenceSegments: {} } })).toBe(true);
  });
  it('does not infer emptiness from a pending state, missing fields or missing result', () => {
    expect(hasEmptyIngestionCore({ state: 'needs_review', result: null })).toBe(false);
    expect(hasEmptyIngestionCore({ state: 'needs_review', result: { core: { problem: '' } } })).toBe(false);
    expect(hasEmptyIngestionCore({ state: 'parsing', result: { core } })).toBe(false);
  });
  it('keeps partial scientific content available for review', () => {
    expect(hasEmptyIngestionCore({ state: 'needs_review', result: { core: { ...core, results: 'Observed transfer within 50 fs.' } } })).toBe(false);
  });
});
