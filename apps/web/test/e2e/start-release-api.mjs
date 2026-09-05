import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { URL } from 'node:url';

const research = {
  publicId: 'OSR-DEMO-000001',
  title: 'Ultrafast charge transfer in layered matter',
  url: '/research/OSR-DEMO-000001/v/1',
  visibility: 'public',
  version: {
    versionNo: 1,
    publicVersionId: 'OSR-DEMO-000001-v1',
    status: 'published',
    publishedAt: '2026-08-10T00:00:00.000Z',
    contentSha256: 'a'.repeat(64),
    legalDisclaimer: null,
    core: {
      problem: 'How does coherent coupling change sub-100 fs carrier relaxation?',
      insight: 'A resolved transfer channel appears in the strongly coupled specimen.',
      method: 'Time-resolved photoemission with a constrained kinetic model.',
      results: 'The fitted transfer lifetime is 43 ± 6 fs.',
      limitations: 'Lateral disorder remains below the probe diameter.',
      reproducibility: 'Raw spectra, notebooks and environment manifests are attached.',
    },
  },
  authors: [{ displayName: 'OpenScience Demo', identityStatus: 'email_verified', isCorresponding: true, affiliation: 'Demonstration corpus', sortOrder: 1 }],
  contributions: [],
  licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0' },
  aiReview: { status: 'passed', hardBlocks: {}, warnings: [] },
  citation: 'OpenScience Demo. Ultrafast charge transfer in layered matter. OSR-DEMO-000001-v1. 2026.',
  artifactPaths: [{ logicalPath: 'figures/charge-map.png', blobSha256: 'b'.repeat(64) }],
  claims: [
    { id: 'claim-transfer', parentClaimId: null, kind: 'core', statement: 'Interlayer charge transfer completes within 80 fs.', conditions: ['Room temperature', 'Resonant excitation'], limitations: ['Validated in one material family'], assessment: 'supported' },
    { id: 'claim-channel', parentClaimId: 'claim-transfer', kind: 'supporting', statement: 'The transient signal follows the resolved transfer channel.', conditions: ['Three calibrated runs'], limitations: [], assessment: 'supported' },
    { id: 'claim-boundary', parentClaimId: 'claim-transfer', kind: 'counter', statement: 'A thermal contribution cannot yet be excluded.', conditions: [], limitations: ['Temperature-dependent controls remain pending'], assessment: 'partial' },
  ],
  evidence: [
    { id: 'evidence-timescale', claimId: 'claim-transfer', kind: 'passage', title: 'Resolved transfer timescale', exactQuote: 'The fitted transfer time is 78 ± 9 fs.', relation: 'supports', locator: { page: 4, boundingBox: { x: 60, y: 180, width: 480, height: 72 } }, extractionConfidence: 0.96, verified: true, artifact: { logicalPath: 'manuscript.pdf', mediaType: 'application/pdf', contentHash: 'c'.repeat(64) } },
    { id: 'evidence-runs', claimId: 'claim-channel', kind: 'figure', title: 'Independent calibrated runs', exactQuote: 'All three runs resolve the same early-time component.', relation: 'supports', locator: { page: 5, boundingBox: { x: 80, y: 260, width: 430, height: 190 } }, extractionConfidence: 0.93, verified: true, artifact: { logicalPath: 'manuscript.pdf', mediaType: 'application/pdf', contentHash: 'c'.repeat(64) } },
    { id: 'evidence-boundary', claimId: 'claim-boundary', kind: 'passage', title: 'Thermal-control limitation', exactQuote: 'Temperature-dependent controls are required to exclude a thermal contribution.', relation: 'qualifies', locator: { page: 7, boundingBox: { x: 65, y: 520, width: 470, height: 88 } }, extractionConfidence: 0.91, verified: true, artifact: { logicalPath: 'manuscript.pdf', mediaType: 'application/pdf', contentHash: 'c'.repeat(64) } },
  ],
  presentationAssets: [{ id: 'asset-transfer-map', kind: 'image', label: 'Charge-transfer pathway illustration', contentHash: 'd'.repeat(64), generator: { name: 'MiniMax', version: 'image-01' }, sourceClaimIds: ['claim-transfer'], url: '/api/research/OSR-DEMO-000001/v/1/presentation-assets/asset-transfer-map' }],
  history: [{ versionNo: 1, publicVersionId: 'OSR-DEMO-000001-v1', publishedAt: '2026-08-10T00:00:00.000Z', contentSha256: 'a'.repeat(64), url: '/research/OSR-DEMO-000001/v/1' }],
};

const evidenceSources = {
  'evidence-timescale': { text: 'The fitted transfer time is 78 ± 9 fs.', page: 4, region: { x: 0.1, y: 0.2, width: 0.8, height: 0.08 }, locator: { page: 4, boundingBox: { x: 60, y: 180, width: 480, height: 72 } }, artifact: { logicalPath: 'manuscript.pdf', mediaType: 'application/pdf' } },
  'evidence-runs': { text: 'All three runs resolve the same early-time component.', page: 5, region: { x: 0.13, y: 0.29, width: 0.72, height: 0.21 }, locator: { page: 5, boundingBox: { x: 80, y: 260, width: 430, height: 190 } }, artifact: { logicalPath: 'manuscript.pdf', mediaType: 'application/pdf' } },
  'evidence-boundary': { text: 'Temperature-dependent controls are required to exclude a thermal contribution.', page: 7, region: { x: 0.11, y: 0.58, width: 0.78, height: 0.1 }, locator: { page: 7, boundingBox: { x: 65, y: 520, width: 470, height: 88 } }, artifact: { logicalPath: 'manuscript.pdf', mediaType: 'application/pdf' } },
};

const presentationPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const collection = {
  id: 'collection-release', slug: 'ultrafast-science', title: 'Ultrafast Science', description: 'A journal-curated reading layer.',
  selections: [{
    id: 'selection-release', collectionId: 'collection-release', researchObjectId: 'ro-release', versionId: 'version-release', selectedBy: 'editor-release',
    title: research.title, publicId: research.publicId, versionNo: 1, sdf: research.version.core,
    note: 'Selected for its inspectable evidence chain.', media: [{
      type: 'image',
      url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"%3E%3Crect width="800" height="450" fill="%23070706"/%3E%3Cg fill="none" stroke="%23ff4b2b" stroke-width="3" opacity=".8"%3E%3Cpath d="M0 310 Q180 80 360 275 T800 150"/%3E%3Cpath d="M0 340 Q220 130 420 300 T800 190" opacity=".45"/%3E%3C/g%3E%3C/svg%3E',
      alt: 'Transient spectroscopy wavefront', credit: 'OpenScience demonstration', licenseId: 'CC-BY-4.0', sourceUrl: '/research/OSR-DEMO-000001/v/1',
    }], sortOrder: 1, state: 'published',
    scheduledAt: '2026-08-10T00:00:00.000Z', publishedAt: '2026-08-10T01:00:00.000Z',
    disclosure: 'Selected by Ultrafast Science. Editorial selection, not peer-review acceptance.',
    createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T01:00:00.000Z',
  }],
};

const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  let body;
  if (path === '/research/OSR-DEMO-000001') body = { research: { latestVersion: 1 } };
  else if (path === '/research/OSR-DEMO-000001/v/1') body = { research };
  else if (path.startsWith('/research/OSR-DEMO-000001/v/1/evidence/') && path.endsWith('/source')) {
    const evidenceId = path.split('/').at(-2);
    body = evidenceSources[evidenceId];
  }
  else if (path === '/research/OSR-DEMO-000001/v/1/presentation-assets/asset-transfer-map') {
    response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' });
    response.end(presentationPng);
    return;
  }
  else if (path === '/editorial/collections/ultrafast-science') body = { collection };
  else if (path === '/auth/academic-identity') body = {
    steps: {
      registered: true,
      emailVerified: true,
      orcidConnected: false,
      institutionEmailVerified: false,
    },
    credentials: [],
    scopedRoles: [],
    capabilities: { orcid: false, institutionEmail: true },
  };
  else {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'NOT_FOUND' } }));
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
});

server.listen(Number(process.env.PRODUCT_RELEASE_API_PORT ?? 3001), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
