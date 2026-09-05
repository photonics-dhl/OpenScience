import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
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
    expect(markup).not.toContain('<video');
    expect(markup.indexOf('id="presentation-preview-heading"')).toBeLessThan(markup.indexOf('id="presentation-source-heading"'));
    expect(markup).toContain('<summary');
    expect(markup).toContain('sourceDetails');
  });
});


it('previews private videos with native controls and keeps explicit draft approval', () => {
  const markup = renderToStaticMarkup(createElement(PresentationWorkbench, {
    researchObjectId: 'ro-video', claims: [],
    assets: [{ id: 'video-1', researchObjectId: 'ro-video', versionId: 'version-1', kind: 'video', canTransition: true, contentHash: 'b'.repeat(64), generator: 'Reviewed local renderer', generatorVersion: 'v1', status: 'draft', label: 'presentation_not_evidence', sourceClaimIds: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
    version: {versionId: 'version-1', versionNo: 1, status: 'draft'}, canWrite: true,
    onCreateClaim: vi.fn().mockResolvedValue(true), onGenerate: vi.fn(), onTransition: vi.fn(),
  }));
  expect(markup).toContain('<video');
  expect(markup).toContain('controls=""');
  expect(markup).toContain('playsinline=""');
  expect(markup).toContain('preload="metadata"');
  expect(markup).toContain('/research-objects/ro-video/versions/version-1/presentation-assets/video-1/content');
  expect(markup).not.toContain('autoPlay');
  expect(markup).toContain('presentation.approve');
});


it('does not offer media approval when server capability is absent', () => {
  const markup = renderToStaticMarkup(createElement(PresentationWorkbench, {
    claims: [], assets: [{ id:'video',researchObjectId:'ro',versionId:'v',kind:'video',contentHash:'a'.repeat(64),generator:'reviewed',generatorVersion:'v1',status:'draft',label:'presentation_not_evidence',sourceClaimIds:[],createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z' }],
    version:{versionId:'v',versionNo:1,status:'draft'},canWrite:true,
    onCreateClaim:vi.fn(),onGenerate:vi.fn(),onTransition:vi.fn(),
  }));
  expect(markup).toContain('<video');
  expect(markup).not.toContain('presentation.approve');
  expect(markup).toContain('mediaAdminApproval');
});


it.each([
  { assets: [], expectedOpen: true },
  { error: 'Save failed', expectedOpen: true },
  { loadFailed: true, expectedOpen: true },
  { task: { status: 'running' as const, progress: 20, paused: false }, expectedOpen: true },
  { task: { status: 'failed' as const, progress: 20, paused: false }, expectedOpen: true },
  { expectedOpen: false },
])('keeps source tools reachable for empty, failed and active work: %j', ({expectedOpen, ...overrides}) => {
  const markup = renderToStaticMarkup(createElement(PresentationWorkbench, {
    claims: [], assets: [{ id:'image',researchObjectId:'ro',versionId:'v',kind:'image',contentHash:'a'.repeat(64),generator:'reviewed',generatorVersion:'v1',status:'approved',label:'presentation_not_evidence',sourceClaimIds:[],createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z' }],
    version:{versionId:'v',versionNo:1,status:'draft'},canWrite:true,
    onCreateClaim:vi.fn(),onGenerate:vi.fn(),onTransition:vi.fn(), ...overrides,
  }));
  const disclosure = markup.match(/<details[^>]*data-source-tools="true"[^>]*>/)?.[0];
  expect(disclosure).toBeDefined();
  expect(disclosure?.includes('open=""')).toBe(expectedOpen);
  expect(markup).toContain('claimStatementLabel');
  if ('error' in overrides) {
    expect(markup.indexOf('role="alert"')).toBeLessThan(markup.indexOf('data-source-tools="true"'));
  }
  if ('task' in overrides) expect(markup.indexOf('role="progressbar"')).toBeLessThan(markup.indexOf('data-source-tools="true"'));
});

it('keeps rendered media before storyboard plans and gives comparisons the full gallery width', () => {
  const base = { researchObjectId: 'ro', versionId: 'v', contentHash: 'a'.repeat(64), generator: 'Hermes', generatorVersion: 'v1', status: 'approved' as const, label: 'presentation_not_evidence', sourceClaimIds: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const markup = renderToStaticMarkup(createElement(PresentationWorkbench, {
    claims: [], assets: [{ ...base, id: 'plan', kind: 'interactive_html', storyboard: { locale: 'en', style: 'ink', document: { schemaVersion: 1, title: 'Plan after media', scenes: [] } } }, { ...base, id: 'media', kind: 'image' }],
    version: { versionId: 'v', versionNo: 1, status: 'draft' }, canWrite: false,
    onCreateClaim: vi.fn(), onGenerate: vi.fn(), onTransition: vi.fn(),
  }));
  expect(markup.indexOf('data-presentation-asset="media"')).toBeLessThan(markup.indexOf('data-presentation-asset="plan"'));
  expect(markup).toMatch(/<article class="[^"]*lg:col-span-2[^"]*"[^>]* data-presentation-asset="plan"/);
});
