import { describe, expect, it } from 'vitest';
import type { JournalSource } from '@openscience/domain';
import type { ExtractionResult } from '../src/extractor';
import { projectReviewedPaperToJournalDraft } from '../src/native-agent/journal-paper-projection';

const quotes = {
  problem: 'Problem source text describes the unmet need.', insight: 'Insight source text explains the central mechanism.',
  method: 'Method source text describes the measured procedure.', results: 'Results source text reports the observed result.',
  limitations: 'Limitations source text states the boundary.', reproducibility: 'Reproducibility source text gives the conditions.',
};
const source: JournalSource = { kind: 'fulltext', text: Object.values(quotes).join('\n'), url: '', label: 'test.pdf' };
const reviewed = {
  core: { schemaVersion: '1', problem: 'Unmet need', insight: 'A central mechanism', method: 'Measured procedure',
    results: 'Observed result', limitations: 'Known boundary', reproducibility: 'Reported conditions' },
  needsMoreInformation: [],
  evidenceSegments: Object.fromEntries(Object.entries(quotes).map(([field, quote], index) => [field,
    [{ quote, sourceLocator: { artifactId: 'artifact', contentHash: 'a'.repeat(64), blockId: `b${index}`, page: index + 1 } }]])),
  reviewedClaimSuggestions: [{ clientKey: 'claim-1', sourceField: 'results', kind: 'core', statement: 'Observed result',
    conditions: ['under the reported conditions'], limitations: ['single study'], sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }],
} as ExtractionResult;

describe('journal editorial projection of shared paper review', () => {
  it('keeps the exact six reviewed fields, Claim and page-located source evidence private', () => {
    const draft = projectReviewedPaperToJournalDraft(reviewed, source, 'en');
    expect(draft.core).toEqual({ problem: 'Unmet need', insight: 'A central mechanism', method: 'Measured procedure',
      results: 'Observed result', limitations: 'Known boundary', reproducibility: 'Reported conditions' });
    expect(draft.claims).toEqual([{ text: 'Observed result\nConditions: under the reported conditions\nLimitations: single study',
      kind: 'other', evidence: { quote: quotes.results, locator: 'page 4' } }]);
    expect(draft.faq).toHaveLength(2);
    expect(draft.figures).toEqual([]);
  });
  it('does not manufacture complete editorial content from a partial science review', () => {
    expect(() => projectReviewedPaperToJournalDraft({ ...reviewed, needsMoreInformation: ['method'] }, source, 'zh')).toThrow('complete');
    expect(() => projectReviewedPaperToJournalDraft({ ...reviewed, reviewedClaimSuggestions: [] }, source, 'zh')).toThrow('actually reviewed Claim');
  });
  it('refuses an evidence quote not present in the original uploaded text', () => {
    expect(() => projectReviewedPaperToJournalDraft(reviewed, { ...source, text: 'a different paper' }, 'en')).toThrow('not in the uploaded source');
  });
});
