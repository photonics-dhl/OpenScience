import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { CLAIM_KINDS, CLAIM_RELATIONS, type ClaimKind, type ClaimRelation } from '../research-intelligence/types';
import { MAX_CANONICAL_EVIDENCE_SEGMENTS } from './canonical-evidence-contract';

/** The existing confirmation batch accepts at most twelve claims. */
export const MAX_INGESTION_CLAIMS = 12;

/** Worker-owned suggestions. Indices address this extraction's field evidenceSegments. */
export interface ReviewedClaimSuggestion {
  clientKey: string;
  sourceField: typeof SDF_CORE_FIELDS[number];
  kind: ClaimKind;
  parentClientKey?: string;
  statement: string;
  conditions: string[];
  limitations: string[];
  sourceBindings: Array<{ sourceIndex: number; relation: ClaimRelation }>;
}

/** Invalid optional suggestions do not invalidate an otherwise readable legacy result. */
export function parseReviewedClaimSuggestions(
  value: unknown,
  sourceCounts: Partial<Record<typeof SDF_CORE_FIELDS[number], number>>,
): ReviewedClaimSuggestion[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_INGESTION_CLAIMS) return undefined;
  const claims: ReviewedClaimSuggestion[] = [];
  const keys = new Set<string>();
  const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 100 && v.every(s => text(s, 500));
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const expected = ['clientKey', 'sourceField', 'kind', 'statement', 'conditions', 'limitations', 'sourceBindings'];
    if (record.parentClientKey !== undefined) expected.push('parentClientKey');
    if (Object.keys(record).sort().join(',') !== expected.sort().join(',')
      || !text(record.clientKey, 100) || keys.has(record.clientKey)
      || !SDF_CORE_FIELDS.includes(record.sourceField as ReviewedClaimSuggestion['sourceField'])
      || !CLAIM_KINDS.includes(record.kind as ClaimKind) || !text(record.statement, 4_000)
      || !strings(record.conditions) || !strings(record.limitations)
      || (record.kind === 'core' ? record.parentClientKey !== undefined : !text(record.parentClientKey, 100))) return undefined;
    const count = sourceCounts[record.sourceField as ReviewedClaimSuggestion['sourceField']] ?? 0;
    if (!Array.isArray(record.sourceBindings) || !record.sourceBindings.length
      || record.sourceBindings.length > MAX_CANONICAL_EVIDENCE_SEGMENTS) return undefined;
    const seen = new Set<number>();
    for (const binding of record.sourceBindings) {
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)
        || Object.keys(binding).sort().join(',') !== 'relation,sourceIndex'
        || !Number.isSafeInteger(binding.sourceIndex) || binding.sourceIndex < 0 || binding.sourceIndex >= count
        || seen.has(binding.sourceIndex) || !CLAIM_RELATIONS.includes(binding.relation)) return undefined;
      seen.add(binding.sourceIndex);
    }
    if (!record.sourceBindings.some(binding => binding.relation === 'supports')) return undefined;
    keys.add(record.clientKey);
    claims.push(record as unknown as ReviewedClaimSuggestion);
  }
  const byKey = new Map(claims.map(claim => [claim.clientKey, claim]));
  for (const claim of claims) {
    const ancestry = new Set([claim.clientKey]);
    let parentKey = claim.parentClientKey;
    while (parentKey !== undefined) {
      const parent = byKey.get(parentKey);
      if (!parent || ancestry.has(parentKey)) return undefined;
      ancestry.add(parentKey);
      parentKey = parent.parentClientKey;
    }
  }
  return claims;
}
