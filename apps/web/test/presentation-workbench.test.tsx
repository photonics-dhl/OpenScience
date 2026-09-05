import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key === 'generate' ? 'presentation.generate' : key === 'approve' ? 'presentation.approve' : key,
}));

import { PresentationWorkbench } from '../components/presentation/PresentationWorkbench';

describe('presentation workbench', () => {
  it('offers claim selection and explicit approval without exposing internal ids or fake media actions', () => {
    const markup = renderToStaticMarkup(createElement(PresentationWorkbench, {
      claims: [{ id: '11111111-1111-4111-8111-111111111111', researchObjectId: 'ro-1', versionId: 'version-1', parentClaimId: null, kind: 'core', statement: 'Core finding', assessment: 'missing', conditions: [], limitations: [], provenance: { source: 'human' }, extractionStatus: 'succeeded', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
      assets: [{ id: 'asset-1', researchObjectId: 'ro-1', versionId: 'version-1', kind: 'chart', contentHash: 'a'.repeat(64), generator: 'deterministic', generatorVersion: 'v1', status: 'draft', label: 'Claim map', sourceClaimIds: ['11111111-1111-4111-8111-111111111111'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
      version: { versionId: 'version-1', versionNo: 2, status: 'draft' },
      canWrite: true,
      onCreateClaim: vi.fn().mockResolvedValue(true),
      onGenerate: vi.fn(),
      onTransition: vi.fn(),
    }));
    expect(markup).toContain('Core finding');
    expect(markup).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(markup).toContain('presentation.generate');
    expect(markup).toContain('presentation.approve');
    expect(markup).not.toContain('video');
  });
});
