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
} as const;

export default function PublicReadingVisualPage() {
  return <main className="pub-page-tabbed"><PublicReadingSurface research={visualResearch as never} /></main>;
}
