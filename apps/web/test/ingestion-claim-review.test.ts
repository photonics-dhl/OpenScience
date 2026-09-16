import { describe, expect, it } from 'vitest';
import { createReviewRows, editReviewStatement, selectedReviewClaims, splitReviewRow } from '../lib/hermes/ingestion-claim-review';

const suggestion = { sourceField: 'insight' as const, originalStatement: 'Measured field', reviewedStatement: 'Measured field', rewritten: false, defaultQuoteAssociation: true, source: { quote: 'exact source words', locator: { page: 2, blockId: 'block' } } };
describe('reviewed ingestion claims', () => {
  it('requires selection and preserves the source independently of an editable statement', () => {
    const rows = createReviewRows([suggestion], () => 'one');
    expect(selectedReviewClaims(rows)).toEqual([]);
    expect(rows[0].source.quote).toBe('exact source words');
    const edited = editReviewStatement({ ...rows[0], selected: true }, 'Different conclusion');
    expect(edited.attachSourceQuote).toBe(false);
    expect(edited.source.quote).toBe('exact source words');
    expect(selectedReviewClaims([edited])[0]).toMatchObject({ statement: 'Different conclusion', attachSourceQuote: false });
  });
  it('splitting a statement creates a new unassociated review item, not another automatic proof', () => {
    const row = createReviewRows([suggestion], () => 'one')[0];
    const split = splitReviewRow(row, 'two');
    expect(split.clientKey).toBe('two');
    expect(split.selected).toBe(false);
    expect(split.attachSourceQuote).toBe(false);
  });
  it('rejects blank selected statements and missing or unselected parents', () => {
    const row = { ...createReviewRows([suggestion], () => 'one')[0], selected: true };
    expect(() => selectedReviewClaims([{ ...row, statement: '  ' }])).toThrow();
    expect(() => selectedReviewClaims([{ ...row, kind: 'method' }])).toThrow();
    expect(() => selectedReviewClaims([{ ...row, kind: 'method', parentClientKey: 'absent' }])).toThrow();
  });
  it('orders selected parent claims before children and never transmits an assessment', () => {
    const parent = { ...createReviewRows([suggestion], () => 'parent')[0], selected: true };
    const child = { ...parent, clientKey: 'child', kind: 'method' as const, parentClientKey: 'parent', attachSourceQuote: false };
    const selected = selectedReviewClaims([child, parent]);
    expect(selected.map(row => row.clientKey)).toEqual(['parent', 'child']);
    expect(selected[0]).not.toHaveProperty('assessment');
    expect(selected[0]).not.toHaveProperty('source');
  });
  it('rejects cycles and refuses attachment when no trusted source exists', () => {
    const row = { ...createReviewRows([suggestion], () => 'one')[0], selected: true, kind: 'method' as const, parentClientKey: 'two' };
    expect(() => selectedReviewClaims([row, { ...row, clientKey: 'two', parentClientKey: 'one' }])).toThrow();
    expect(() => selectedReviewClaims([{ ...row, kind: 'core', parentClientKey: undefined, source: undefined, attachSourceQuote: true }])).toThrow();
  });
  it('preserves each source segment and validates condition lengths before submission', () => {
    const sources = [suggestion.source, { quote: 'including the limiting condition', locator: { page: 3, blockId: 'next' } }];
    const row = { ...createReviewRows([{ ...suggestion, source: undefined, sources }], () => 'one')[0], selected: true };
    expect(row.sources).toEqual(sources);
    expect(row.attachSourceQuote).toBe(true);
    expect(selectedReviewClaims([row])[0].attachSourceQuote).toBe(true);
    expect(editReviewStatement(row, 'changed').attachSourceQuote).toBe(false);
    expect(() => selectedReviewClaims([{ ...row, conditions: ['x'.repeat(501)] }])).toThrow();
    expect(() => selectedReviewClaims([{ ...row, limitations: Array(101).fill('limit') }])).toThrow();
  });
  it('requires one association per original field when splitting a suggestion', () => {
    const first = { ...createReviewRows([suggestion], () => 'one')[0], selected: true };
    const second = { ...splitReviewRow(first, 'two'), selected: true, attachSourceQuote: true };
    expect(() => selectedReviewClaims([first, second])).toThrow();
    expect(selectedReviewClaims([first, { ...second, attachSourceQuote: false }])).toHaveLength(2);
  });
});
