import { describe, expect, it } from 'vitest';
import { projectSharedPaperToJournalDraft } from '../src/journal/shared-projection';

const quotes = {
  problem: 'The optical pulse source has an unmet power stability requirement.',
  insight: 'The numerical model identifies a stable operating range.',
  method: 'The authors simulate propagation through a measured fiber geometry.',
  results: 'The numerical simulation predicts a peak power of 14.7 TW.',
  limitations: 'The paper does not report an experimental demonstration.',
  reproducibility: 'The model records the fiber geometry and input pulse duration.',
};
const source = { kind: 'fulltext' as const, text: Object.values(quotes).join('\n'), url: '', label: 'paper.pdf' };
const result = {
  core: { schemaVersion: '0.1.0', problem: 'Power stability', insight: 'Stable range', method: 'Numerical propagation',
    results: '14.7 TW prediction', limitations: 'No experiment', reproducibility: 'Reported model inputs' },
  needsMoreInformation: [],
  scientificReview: { kind: 'hermes_agent_review', status: 'review_received' },
  evidenceSegments: Object.fromEntries(Object.entries(quotes).map(([field, quote], index) => [field,
    [{ quote, sourceLocator: { page: index + 1, blockId: `b${index}` } }]])),
  reviewedClaimSuggestions: [{ clientKey: 'claim-1', sourceField: 'results', kind: 'core', statement: '14.7 TW is a prediction',
    conditions: ['numerical model'], limitations: ['no experiment'], sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }],
};

describe('journal projection of the saved shared Native result', () => {
  it('projects six fields and exact page-bound evidence without inventing figures', () => {
    const draft = projectSharedPaperToJournalDraft(result, source, 'en');
    expect(draft.core.results).toBe('14.7 TW prediction');
    expect(draft.claims[0]?.evidence).toEqual({ quote: quotes.results, locator: 'page 4' });
    expect(draft.figures).toEqual([]);
    expect(draft.faq).toHaveLength(2);
  });
  it('rejects incomplete Native review or mismatched source quotes', () => {
    expect(() => projectSharedPaperToJournalDraft({ ...result, needsMoreInformation: ['method'] }, source, 'en')).toThrow();
    expect(() => projectSharedPaperToJournalDraft(result, { ...source, text: 'different manuscript' }, 'en')).toThrow();
    expect(() => projectSharedPaperToJournalDraft({ ...result, reviewedClaimSuggestions: [] }, source, 'en')).toThrow();
  });
});
