import { createServer } from 'node:http';
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
};

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
  else if (path === '/editorial/collections/ultrafast-science') body = { collection };
  else {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'NOT_FOUND' } }));
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
});

server.listen(3102, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
