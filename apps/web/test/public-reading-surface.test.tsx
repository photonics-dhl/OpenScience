import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

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
} as const;

describe('Optical Editorial public reading surface', () => {
  it('proves identity, license, citation and Insight before deep navigation', async () => {
    const { PublicReadingSurface } = await import('../components/public/PublicVersionPage');
    const markup = renderToStaticMarkup(<PublicReadingSurface research={research as never} />);
    const tabs = markup.indexOf('data-public-deep-navigation');
    for (const landmark of ['data-public-identity', 'data-public-license', 'data-public-citation', 'data-sdf-node="insight"']) {
      const position = markup.indexOf(landmark);
      expect(position).toBeGreaterThan(-1);
      expect(position).toBeLessThan(tabs);
    }
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
    expect(markup).toContain('email_verified');
    expect(markup).toContain('data-corresponding-author="true"');
    expect(markup).toContain('2026-08-10');
    expect(markup).toContain('aaaaaaaa');
    expect(markup).toContain('data-ai-review="passed"');
    expect(markup).toContain('figures/charge-map.png');
    expect(markup).toContain('bbbbbbbb');
  });

  it('uses an absolute server API transport and resolves the latest continuing object', async () => {
    await expect(import('../lib/public-server-api')).resolves.toMatchObject({
      getLatestPublicResearchVersion: expect.any(Function),
      getServerPublicResearchVersion: expect.any(Function),
    });
  });
});
