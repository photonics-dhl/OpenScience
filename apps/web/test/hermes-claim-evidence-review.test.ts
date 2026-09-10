import { describe, expect, it } from 'vitest';

import { scopeWorkflowClaimReview } from '@/components/hermes/HermesClaimEvidenceReview';
import type { PresentationClaim, VersionEvidence } from '@/lib/api';

const claim = (id: string): PresentationClaim => ({
  id, researchObjectId: 'ro-1', versionId: 'version-1', parentClaimId: null, kind: 'core', statement: `Claim ${id}`,
  assessment: 'missing', conditions: ['Condition'], limitations: ['Limitation'], provenance: {}, extractionStatus: 'succeeded', createdAt: '', updatedAt: '',
});
const evidence = (claimId: string): VersionEvidence => ({
  id: `evidence-${claimId}`, researchObjectId: 'ro-1', versionId: 'version-1', claimId, title: 'Passage', locator: {}, relation: 'supports', extractionStatus: 'needs_review', updatedAt: '',
});

describe('Hermes claim-evidence review scope', () => {
  it('keeps only the workflow claims and their evidence', () => {
    const scoped = scopeWorkflowClaimReview(['claim-1'], [claim('claim-1'), claim('other')], [evidence('claim-1'), evidence('other')]);
    expect(scoped.claims.map((item) => item.id)).toEqual(['claim-1']);
    expect(scoped.evidence.map((item) => item.claimId)).toEqual(['claim-1']);
  });

  it('refuses review when a workflow claim did not load', () => {
    expect(() => scopeWorkflowClaimReview(['claim-1'], [], [evidence('claim-1')])).toThrow('Missing workflow claim');
  });
});
