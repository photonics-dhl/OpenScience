'use client';

import { PublicReadingSurface } from '@/components/public/PublicVersionPage';

const visualResearch = {
  publicId: 'OSR-2026-000241', title: 'Ultrafast charge transfer in layered matter', url: '/research/OSR-2026-000241/v/4', visibility: 'public',
  version: {
    versionNo: 4, publicVersionId: 'OSR-2026-000241-v4', status: 'published', publishedAt: '2026-08-10T00:00:00.000Z', contentSha256: '6e4e3f7a9d44f2c8d0b875cce28b87f82af77bfe3e69e154de2d0141e3f2e1a7', legalDisclaimer: null,
    core: { problem: 'How does interlayer charge move before the lattice reaches equilibrium?', insight: 'The transfer channel appears before structural relaxation and remains traceable to the original evidence.', method: 'Few-cycle pump-probe microscopy with provenance-linked analysis notebooks.', results: 'A sub-80 fs transfer channel resolves across three independently calibrated runs.', limitations: '', reproducibility: 'Raw frames, calibration data and analysis code are attached to this immutable version.' },
  },
  authors: [{ displayName: 'DHL', identityStatus: 'email_verified', isCorresponding: true, affiliation: 'Zhejiang University', sortOrder: 1 }],
  contributions: [{ displayName: 'DHL', creditRole: 'conceptualization' }], licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0' }, aiReview: { status: 'passed', hardBlocks: {}, warnings: [] },
  citation: 'DHL. Ultrafast charge transfer in layered matter. OpenScience OSR-2026-000241-v4. 2026.', artifactPaths: [],
  claims: [
    { id: 'claim-transfer', parentClaimId: null, kind: 'core', statement: 'Interlayer charge transfer completes within 80 fs.', conditions: ['Room temperature', 'Resonant excitation'], limitations: ['Validated in one material family'], assessment: 'supported' },
    { id: 'claim-channel', parentClaimId: 'claim-transfer', kind: 'supporting', statement: 'The transient signal follows the resolved transfer channel.', conditions: ['Three calibrated runs'], limitations: [], assessment: 'supported' },
    { id: 'claim-boundary', parentClaimId: 'claim-transfer', kind: 'counter', statement: 'A thermal contribution cannot yet be excluded.', conditions: [], limitations: ['Temperature-dependent controls remain pending'], assessment: 'partial' },
  ],
  evidence: [
    { id: 'evidence-timescale', claimId: 'claim-transfer', kind: 'passage', title: 'Resolved transfer timescale', exactQuote: 'The fitted transfer time is 78 ± 9 fs.', relation: 'supports', locator: { page: 4 }, extractionConfidence: 0.96, verified: true, artifact: { logicalPath: 'manuscript.pdf', mediaType: 'application/pdf', contentHash: 'c'.repeat(64) } },
    { id: 'evidence-runs', claimId: 'claim-channel', kind: 'figure', title: 'Independent calibrated runs', exactQuote: 'All three runs resolve the same early-time component.', relation: 'supports', locator: { page: 5 }, extractionConfidence: 0.93, verified: true, artifact: { logicalPath: 'manuscript.pdf', mediaType: 'application/pdf', contentHash: 'c'.repeat(64) } },
    { id: 'evidence-boundary', claimId: 'claim-boundary', kind: 'passage', title: 'Thermal-control limitation', exactQuote: 'Temperature-dependent controls are required to exclude a thermal contribution.', relation: 'qualifies', locator: { page: 7 }, extractionConfidence: 0.91, verified: true, artifact: { logicalPath: 'manuscript.pdf', mediaType: 'application/pdf', contentHash: 'c'.repeat(64) } },
  ],
  presentationAssets: [{ id: 'asset-transfer-map', kind: 'interactive_html', label: 'Charge-transfer pathway interactive', contentHash: 'd'.repeat(64), generator: { name: 'MiniMax', version: 'html-01' }, sourceClaimIds: ['claim-transfer'], url: '/api/research/OSR-2026-000241/v/4/presentation-assets/asset-transfer-map' }],
  history: [{ versionNo: 4, publicVersionId: 'OSR-2026-000241-v4', publishedAt: '2026-08-10T00:00:00.000Z', contentSha256: '6e4e3f7a9d44f2c8d0b875cce28b87f82af77bfe3e69e154de2d0141e3f2e1a7', url: '/research/OSR-2026-000241/v/4' }],
} as const;

export default function PublicReadingVisualPage() {
  return <main className="pub-page-tabbed"><PublicReadingSurface research={visualResearch as never} /></main>;
}
