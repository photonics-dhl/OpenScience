import type { IngestionClaimSelection, IngestionClaimSuggestion } from '../api';

export interface ClaimReviewRow extends IngestionClaimSelection {
  selected: boolean;
  originalStatement: string;
  source?: IngestionClaimSuggestion['source'];
  sources?: IngestionClaimSuggestion['sources'];
}
export function createReviewRows(suggestions: IngestionClaimSuggestion[], id: () => string = () => crypto.randomUUID()): ClaimReviewRow[] {
  const keys = new Map(suggestions.flatMap(s => s.atomicSuggestions ?? []).map(claim => [claim.clientKey, id()]));
  return suggestions.flatMap((s): ClaimReviewRow[] => s.atomicSuggestions?.length ? s.atomicSuggestions.map(claim => ({
    clientKey: keys.get(claim.clientKey)!, sourceField: s.sourceField, selected: false,
    kind: claim.kind, ...(claim.parentClientKey ? { parentClientKey: keys.get(claim.parentClientKey) } : {}),
    statement: claim.statement, originalStatement: claim.statement, source: s.source, sources: s.sources,
    attachSourceQuote: s.defaultQuoteAssociation,
    sourceBindings: claim.sourceBindings.map(binding => ({ ...binding })),
    conditions: [...claim.conditions], limitations: [...claim.limitations],
  })) : [{
    clientKey: id(), sourceField: s.sourceField, selected: false,
    kind: s.sourceField === 'method' || s.sourceField === 'reproducibility' ? 'method' : s.sourceField === 'limitations' ? 'boundary' : s.sourceField === 'results' ? 'supporting' : 'core',
    statement: s.reviewedStatement, originalStatement: s.originalStatement, source: s.source, sources: s.sources,
    attachSourceQuote: (s.sources ? s.sources.length > 0 : !!s.source) && s.defaultQuoteAssociation,
    sourceBindings: (s.sources ?? (s.source ? [s.source] : [])).map((_, sourceIndex) => ({ sourceIndex, relation: 'supports' as const })),
    conditions: [], limitations: [],
  }]);
}
export function editReviewStatement(row: ClaimReviewRow, statement: string): ClaimReviewRow {
  return { ...row, statement, attachSourceQuote: false };
}
export function splitReviewRow(row: ClaimReviewRow, clientKey: string): ClaimReviewRow {
  return { ...row, clientKey, selected: false, attachSourceQuote: false, sourceBindings: row.sourceBindings?.map(binding => ({ ...binding })), conditions: [...(row.conditions ?? [])], limitations: [...(row.limitations ?? [])] };
}
export function setReviewSourceRelation(row: ClaimReviewRow, sourceIndex: number, relation: NonNullable<IngestionClaimSelection['sourceBindings']>[number]['relation'] | 'none'): ClaimReviewRow {
  const current = row.sourceBindings ?? (row.sources ?? (row.source ? [row.source] : [])).map((_, index) => ({ sourceIndex: index, relation: 'supports' as const }));
  const sourceBindings = current.filter(binding => binding.sourceIndex !== sourceIndex);
  if (relation !== 'none') sourceBindings.push({ sourceIndex, relation });
  sourceBindings.sort((left, right) => left.sourceIndex - right.sourceIndex);
  return { ...row, sourceBindings, attachSourceQuote: false };
}
export function selectedReviewClaims(rows: ClaimReviewRow[], maxEvidencePerBatch?: number, maxClaims = 12): IngestionClaimSelection[] {
  const selected = rows.filter(row => row.selected);
  const byKey = new Map(selected.map(row => [row.clientKey, row]));
  if (byKey.size !== selected.length || selected.length > maxClaims) throw new Error('Invalid selection');
  const evidenceCount = selected.reduce((total, row) => total + (row.attachSourceQuote
    ? row.sourceBindings?.length ?? (row.sources ?? (row.source ? [row.source] : [])).length : 0), 0);
  if (maxEvidencePerBatch !== undefined && evidenceCount > maxEvidencePerBatch) throw new Error('TOO_MANY_SOURCE_ASSOCIATIONS');
  const result: IngestionClaimSelection[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (row: ClaimReviewRow) => {
    if (done.has(row.clientKey)) return;
    if (visiting.has(row.clientKey) || !row.statement.trim() || row.statement.length > 4000 || (row.attachSourceQuote && !(row.sources ? row.sources.length : row.source))) throw new Error('Invalid claim');
    if (row.attachSourceQuote && row.sourceBindings !== undefined) {
      const sourceCount = (row.sources ?? (row.source ? [row.source] : [])).length;
      const seen = new Set<number>();
      if (!row.sourceBindings.length || row.sourceBindings.length > sourceCount) throw new Error('INVALID_SOURCE_ASSOCIATION');
      for (const binding of row.sourceBindings) {
        if (!Number.isSafeInteger(binding.sourceIndex) || binding.sourceIndex < 0 || binding.sourceIndex >= sourceCount
          || seen.has(binding.sourceIndex) || !['supports', 'contradicts', 'qualifies', 'context'].includes(binding.relation)) throw new Error('INVALID_SOURCE_ASSOCIATION');
        seen.add(binding.sourceIndex);
      }
    }
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
      statement: row.statement.trim(), conditions, limitations, attachSourceQuote: row.attachSourceQuote,
      ...(row.attachSourceQuote && row.sourceBindings !== undefined ? { sourceBindings: row.sourceBindings.map(binding => ({ ...binding })) } : {}) });
    visiting.delete(row.clientKey); done.add(row.clientKey);
  };
  selected.forEach(visit);
  return result;
}
