import type { IngestionClaimSelection, IngestionClaimSuggestion } from '../api';

export interface ClaimReviewRow extends IngestionClaimSelection {
  selected: boolean;
  originalStatement: string;
  source?: IngestionClaimSuggestion['source'];
  sources?: IngestionClaimSuggestion['sources'];
}
export function createReviewRows(suggestions: IngestionClaimSuggestion[], id: () => string = () => crypto.randomUUID()): ClaimReviewRow[] {
  return suggestions.map(s => ({
    clientKey: id(), sourceField: s.sourceField, selected: false,
    kind: s.sourceField === 'method' || s.sourceField === 'reproducibility' ? 'method' : s.sourceField === 'limitations' ? 'boundary' : s.sourceField === 'results' ? 'supporting' : 'core',
    statement: s.reviewedStatement, originalStatement: s.originalStatement, source: s.source, sources: s.sources,
    attachSourceQuote: (s.sources ? s.sources.length > 0 : !!s.source) && s.defaultQuoteAssociation,
    conditions: [], limitations: [],
  }));
}
export function editReviewStatement(row: ClaimReviewRow, statement: string): ClaimReviewRow {
  return { ...row, statement, attachSourceQuote: false };
}
export function splitReviewRow(row: ClaimReviewRow, clientKey: string): ClaimReviewRow {
  return { ...row, clientKey, selected: false, attachSourceQuote: false, conditions: [...(row.conditions ?? [])], limitations: [...(row.limitations ?? [])] };
}
export function selectedReviewClaims(rows: ClaimReviewRow[]): IngestionClaimSelection[] {
  const selected = rows.filter(row => row.selected);
  const byKey = new Map(selected.map(row => [row.clientKey, row]));
  if (byKey.size !== selected.length || selected.length > 12) throw new Error('Invalid selection');
  const attachedFields = selected.filter(row => row.attachSourceQuote).map(row => row.sourceField);
  if (new Set(attachedFields).size !== attachedFields.length) throw new Error('DUPLICATE_SOURCE_ASSOCIATION');
  const result: IngestionClaimSelection[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (row: ClaimReviewRow) => {
    if (done.has(row.clientKey)) return;
    if (visiting.has(row.clientKey) || !row.statement.trim() || row.statement.length > 4000 || (row.attachSourceQuote && !(row.sources ? row.sources.length : row.source))) throw new Error('Invalid claim');
    const conditions = (row.conditions ?? []).map(value => value.trim()).filter(Boolean);
    const limitations = (row.limitations ?? []).map(value => value.trim()).filter(Boolean);
    if ([conditions, limitations].some(values => values.length > 100 || values.some(value => value.length > 500))) throw new Error('Invalid condition or limitation');
    visiting.add(row.clientKey);
    if (row.kind !== 'core') {
      const parent = row.parentClientKey && byKey.get(row.parentClientKey);
      if (!parent) throw new Error('Select a parent claim');
      visit(parent);
    }
    result.push({ clientKey: row.clientKey, sourceField: row.sourceField, kind: row.kind,
      ...(row.kind === 'core' ? {} : { parentClientKey: row.parentClientKey }),
      statement: row.statement.trim(), conditions, limitations, attachSourceQuote: row.attachSourceQuote });
    visiting.delete(row.clientKey); done.add(row.clientKey);
  };
  selected.forEach(visit);
  return result;
}
