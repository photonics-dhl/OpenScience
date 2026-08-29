import type { ClaimNode } from './types';
import { ResearchIntelligenceValidationError } from './validation';

export type ClaimGraphNode = Pick<
  ClaimNode,
  'id' | 'researchObjectId' | 'versionId' | 'parentClaimId' | 'kind' | 'statement'
>;

export function validateClaimGraph<TClaim extends ClaimGraphNode>(claims: readonly TClaim[]): readonly TClaim[] {
  const coreCount = claims.filter((claim) => claim.kind === 'core').length;
  if (coreCount < 3 || coreCount > 7) {
    throw new ResearchIntelligenceValidationError('INVALID_CLAIM_GRAPH', 'A publishable Claim graph requires 3-7 core Claims');
  }

  const first = claims[0];
  if (!first) {
    throw new ResearchIntelligenceValidationError('INVALID_CLAIM_GRAPH', 'A Claim graph cannot be empty');
  }
  const byId = new Map<string, TClaim>();
  for (const claim of claims) {
    if (byId.has(claim.id)) {
      throw new ResearchIntelligenceValidationError('INVALID_CLAIM_GRAPH', `Claim graph has duplicate id "${claim.id}"`);
    }
    if (claim.researchObjectId !== first.researchObjectId || claim.versionId !== first.versionId) {
      throw new ResearchIntelligenceValidationError('INVALID_CLAIM_GRAPH', 'All Claims must belong to the same Research Object and Version');
    }
    if (!claim.statement.trim()) {
      throw new ResearchIntelligenceValidationError('INVALID_CLAIM_GRAPH', `Claim "${claim.id}" has an empty statement`);
    }
    byId.set(claim.id, claim);
  }

  for (const claim of claims) {
    if (claim.kind === 'core' && claim.parentClaimId !== undefined) {
      throw new ResearchIntelligenceValidationError('INVALID_CLAIM_GRAPH', `core Claim "${claim.id}" cannot have a parent`);
    }
    if (claim.kind !== 'core' && !claim.parentClaimId) {
      throw new ResearchIntelligenceValidationError('INVALID_CLAIM_GRAPH', `Child Claim "${claim.id}" requires a parent`);
    }
    if (claim.parentClaimId && !byId.has(claim.parentClaimId)) {
      throw new ResearchIntelligenceValidationError('INVALID_CLAIM_GRAPH', `Claim "${claim.id}" references missing parent "${claim.parentClaimId}"`);
    }
  }

  const states = new Map<string, 'visiting' | 'visited'>();
  for (const start of claims) {
    if (states.get(start.id) === 'visited') continue;
    const path: TClaim[] = [];
    let current: TClaim | undefined = start;
    while (current) {
      const state = states.get(current.id);
      if (state === 'visiting') {
        throw new ResearchIntelligenceValidationError('INVALID_CLAIM_GRAPH', `Claim graph contains a cycle at "${current.id}"`);
      }
      if (state === 'visited') break;
      states.set(current.id, 'visiting');
      path.push(current);
      current = current.parentClaimId ? byId.get(current.parentClaimId) : undefined;
    }
    path.forEach((claim) => states.set(claim.id, 'visited'));
  }

  return claims;
}
