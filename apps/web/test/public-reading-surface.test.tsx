import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const research = {
  publicId: 'OSR-2026-000241',
  title: 'Ultrafast charge transfer in layered matter',
  url: '/research/OSR-2026-000241/v/4',
  visibility: 'public',
  version: {
    versionNo: 4,
    publicVersionId: 'OSR-2026-000241-v4',
    status: 'published',
    publishedAt: '2026-08-10T00:00:00.000Z',
    contentSha256: 'a'.repeat(64),
    legalDisclaimer: null,
    core: {
      problem: 'A testable research problem.',
      insight: 'The central citable insight.',
      method: 'Pump-probe microscopy.',
      results: 'A resolved transfer channel.',
      limitations: '',
      reproducibility: 'Data and code are attached.',
    },
  },
  authors: [{ displayName: 'DHL', identityStatus: 'email_verified', isCorresponding: true, affiliation: 'Zhejiang University', sortOrder: 1 }],
  contributions: [],
  licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC0' },
  aiReview: { status: 'passed', hardBlocks: {}, warnings: [] },
  citation: 'DHL. Ultrafast charge transfer in layered matter. OSR-2026-000241-v4. 2026.',
  artifactPaths: [],
  claims: [
    {
      id: 'claim-core',
      parentClaimId: null,
      kind: 'core',
      statement: 'Interlayer charge transfer completes within 80 fs.',
      conditions: ['Room temperature', 'Resonant excitation'],
      limitations: ['Demonstrated in one material family'],
      assessment: 'supported',
    },
    {
      id: 'claim-supporting',
      parentClaimId: 'claim-core',
      kind: 'supporting',
      statement: 'The transient signal follows the transfer channel.',
      conditions: [],
      limitations: [],
      assessment: 'partial',
    },
    {
      id: 'claim-counter',
      parentClaimId: 'claim-core',
      kind: 'counter',
      statement: 'A thermal contribution cannot yet be excluded.',
      conditions: [],
      limitations: ['Requires temperature-dependent controls'],
      assessment: 'disputed',
    },
  ],
  evidence: [
    {
      id: 'evidence-passage',
      claimId: 'claim-core',
      kind: 'passage',
      title: 'Resolved transfer timescale',
      exactQuote: 'The fitted transfer time is 78 ± 9 fs.',
      relation: 'supports',
      locator: { page: 4, section: 'Results', region: 'paragraph 2' },
      extractionConfidence: 0.96,
      verified: true,
      artifact: {
        logicalPath: 'manuscript.pdf',
        mediaType: 'application/pdf',
        contentHash: 'c'.repeat(64),
      },
    },
    {
      id: 'evidence-counter',
      claimId: 'claim-counter',
      kind: 'figure',
      title: 'Temperature-independent control is absent',
      exactQuote: null,
      relation: 'qualifies',
      locator: { page: 6, figure: 'Figure 3' },
      extractionConfidence: 0.81,
      verified: true,
      artifact: {
        logicalPath: 'manuscript.pdf',
        mediaType: 'application/pdf',
        contentHash: 'c'.repeat(64),
      },
    },
  ],
  presentationAssets: [
    {
      id: 'asset-hero',
      kind: 'image',
      label: 'Charge-transfer pathway illustration',
      contentHash: 'd'.repeat(64),
      generator: { name: 'MiniMax', version: 'image-01' },
      sourceClaimIds: ['claim-core'],
      url: '/api/research/OSR-2026-000241/v/4/presentation-assets/asset-hero',
    },
  ],
  history: [
    {
      versionNo: 4,
      publicVersionId: 'OSR-2026-000241-v4',
      publishedAt: '2026-08-10T00:00:00.000Z',
      contentSha256: 'a'.repeat(64),
      url: '/research/OSR-2026-000241/v/4',
    },
  ],
} as const;

describe('Optical Editorial public reading surface', () => {
  beforeAll(() => vi.stubGlobal('React', React));
  it('keeps public reading focused on the media available in this version', async () => {
    const { PresentationAssetGallery } = await import('../components/public/PresentationAssetGallery');
    const image = research.presentationAssets[0];
    const imageOnly = renderToStaticMarkup(<PresentationAssetGallery assets={[image] as never} leading />);
    expect(imageOnly).toContain(image.url);
    expect(imageOnly).not.toContain('videoPlaceholder');
    expect(imageOnly).not.toContain('data-media-placeholder');
    const video = { ...image, id: 'asset-video', kind: 'video', url: '/published/video.mp4' };
    const both = renderToStaticMarkup(<PresentationAssetGallery assets={[image, video] as never} leading />);
    expect(both).toContain(image.url);
    expect(both).toContain('<video');
    expect(both).toContain(video.url);
    expect(renderToStaticMarkup(<PresentationAssetGallery assets={[]} leading />)).toBe('');
  });
  it('retains the downstream LegacyOverviewTab compatibility export', async () => {
    const { LegacyOverviewTab } = await import('../components/public/PublicVersionPage');
    const markup = renderToStaticMarkup(<LegacyOverviewTab research={research as never} />);
    expect(markup).toContain('class="pub-article"');
    expect(markup).toContain('class="copy-btn"');
  });

  it('puts identity, contribution and the figure before detailed reading and resources', async () => {
    const { PublicReadingSurface } = await import('../components/public/PublicVersionPage');
    const markup = renderToStaticMarkup(<PublicReadingSurface research={research as never} />);
    const positions = [research.title, research.version.core.insight, research.presentationAssets[0].url,
      'data-sdf-node="problem"', 'data-public-license', 'data-public-citation'].map(landmark => markup.indexOf(landmark));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('distinguishes continuing-object and immutable-version citations', async () => {
    const { PublicReadingSurface } = await import('../components/public/PublicVersionPage');
    const markup = renderToStaticMarkup(<PublicReadingSurface research={research as never} />);
    expect(markup).toContain('data-citation-kind="object"');
    expect(markup).toContain('OSR-2026-000241');
    expect(markup).toContain('data-citation-kind="version"');
    expect(markup).toContain('OSR-2026-000241-v4');
    expect(markup).toContain('data-citation-kind="object"><p');
    expect(markup).toContain('DHL. Ultrafast charge transfer in layered matter. OSR-2026-000241. 2026.');
  });

  it('renders six text SDF states and print-preserved provenance landmarks', async () => {
    const { PublicReadingSurface } = await import('../components/public/PublicVersionPage');
    const markup = renderToStaticMarkup(<PublicReadingSurface research={research as never} />);
    expect(markup.match(/data-sdf-node=/g)).toHaveLength(6);
    expect(markup).toContain('data-sdf-state="empty"');
    expect(markup).toContain('data-print-landmark="citation"');
    expect(markup).toContain('data-print-landmark="provenance"');
    expect(markup).toContain('data-public-reading-column="true"');
    expect(markup).toContain('data-public-metadata-rail="true"');
  });

  it('retains publication, identity, review and artifact provenance fields', async () => {
    const { PublicReadingSurface } = await import('../components/public/PublicVersionPage');
    const withArtifact = { ...research, artifactPaths: [{ logicalPath: 'figures/charge-map.png', blobSha256: 'b'.repeat(64) }] };
    const markup = renderToStaticMarkup(<PublicReadingSurface research={withArtifact as never} />);
    expect(markup).not.toContain('email_verified');
    expect(markup).toContain('data-corresponding-author="true"');
    expect(markup).toContain('2026-08-10');
    expect(markup).toContain('aaaaaaaa');
    expect(markup).not.toContain('data-ai-review="passed"');
    expect(markup).toContain('figures/charge-map.png');
  });

  it('keeps authorized public downloads and makes unavailable attachment names non-interactive', async () => {
    const { PublicReadingSurface } = await import('../components/public/PublicVersionPage');
    const publicUrl = '/api/research/OSR-2026-000241/v/4/artifacts/public-file/download';
    const withArtifacts = { ...research, artifactPaths: [
      { logicalPath: 'legacy.pdf', blobSha256: 'b'.repeat(64) },
      { logicalPath: 'member.pdf', blobSha256: 'b'.repeat(64), downloadAccess: 'workspace_member', downloadUrl: '/api/artifacts/member-file/download' },
      { logicalPath: 'missing-url.pdf', blobSha256: 'b'.repeat(64), downloadAccess: 'public' },
      { logicalPath: 'public.pdf', blobSha256: 'b'.repeat(64), downloadAccess: 'public', downloadUrl: publicUrl },
    ] };
    const markup = renderToStaticMarkup(<PublicReadingSurface research={withArtifacts as never} />);
    const resourceMarkup = markup.match(/<details class="pub-reading-artifacts[\s\S]*?<\/details>/)![0];
    const rows = Array.from(resourceMarkup.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g), match => match[1]);
    for (const name of ['legacy.pdf', 'member.pdf', 'missing-url.pdf']) {
      const row = rows.find(item => item.includes(name))!;
      expect(row).toContain('artifactDownloadUnavailable');
      expect(row).not.toMatch(/<(?:a|button)\b|tabindex=|role="(?:link|button)"/);
    }
    const publicRow = rows.find(item => item.includes('public.pdf'))!;
    expect(publicRow).toContain(`href="${publicUrl}"`);
    expect(publicRow).toContain('download=""');
    expect(publicRow).not.toContain('artifactDownloadUnavailable');
    expect(resourceMarkup).not.toContain('/api/artifacts/member-file/download');
  });

  it('uses an absolute server API transport and resolves the latest continuing object', async () => {
    await expect(import('../lib/public-server-api')).resolves.toMatchObject({
      getLatestPublicResearchVersion: expect.any(Function),
      getServerPublicResearchVersion: expect.any(Function),
    });
  });

  it('retains claim conditions and relation-aware evidence after the readable research', async () => {
    const { PublicReadingSurface } = await import('../components/public/PublicVersionPage');
    const markup = renderToStaticMarkup(<PublicReadingSurface research={research as never} />);
    const identity = markup.indexOf('data-public-identity');
    const narrative = markup.indexOf('data-claim-narrative');
    const methods = markup.indexOf('data-sdf-node="method"');
    expect(identity).toBeLessThan(narrative);
    expect(methods).toBeGreaterThan(identity);
    expect(methods).toBeLessThan(narrative);
    expect(markup).toContain('data-claim-id="claim-core"');
    expect(markup).toContain('data-parent-claim-id="claim-core"');
    expect(markup).toContain(research.claims[2].statement);
    expect(markup).toContain('Room temperature');
    expect(markup).toContain('Demonstrated in one material family');
    expect(markup).toContain('The fitted transfer time is 78 ± 9 fs.');
  });

  it('keeps the complete evidence transcript in SSR, accessibility and print markup', async () => {
    const { PublicReadingSurface } = await import('../components/public/PublicVersionPage');
    const markup = renderToStaticMarkup(<PublicReadingSurface research={research as never} />);
    expect(markup).toContain('data-evidence-transcript="true"');
    expect(markup).toContain('data-print-evidence="true"');
    expect(markup).toMatch(/<details[^>]*>[\s\S]*data-evidence-transcript="true"/);
    expect(markup).not.toMatch(/data-evidence-transcript="true"[^>]*(hidden|aria-hidden)/);
    expect(markup).not.toMatch(/data-evidence-transcript="true"[^>]*style="[^"]*display:\s*none/);
  });

  it('shows the scientific figure without generator metadata and retains evidence separately', async () => {
    const { PublicReadingSurface } = await import('../components/public/PublicVersionPage');
    const markup = renderToStaticMarkup(<PublicReadingSurface research={research as never} />);
    expect(markup).toContain('data-presentation-gallery="true"');
    expect(markup).toContain(research.presentationAssets[0].url);
    expect(markup).not.toContain('MiniMax');
    expect(markup).toContain('claim-core');
    expect(markup).not.toMatch(/data-evidence-transcript="true"[\s\S]*data-presentation-gallery="true"[\s\S]*data-evidence-relation=/);
  });
});
