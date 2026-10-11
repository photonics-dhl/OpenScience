import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { PresentationAsset } from '../lib/api';

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
vi.stubGlobal('React', React);
import { PresentationWorkbench } from '../components/presentation/PresentationWorkbench';
import { selectStoryboard } from '../components/presentation/StoryboardPlans';

function plan(id: string, status: PresentationAsset['status'], createdAt: string, scenes = 1): PresentationAsset {
  return { id, researchObjectId: 'ro', versionId: 'v', kind: 'interactive_html', contentHash: 'a'.repeat(64),
    generator: 'Hermes', generatorVersion: 'v1', status, label: id, sourceClaimIds: ['claim'], createdAt, updatedAt: createdAt,
    canTransition: true, canApprove: true, canGenerateSceneImage: true,
    storyboard: { locale: 'en', style: 'auto', output: 'image', narrative: true,
      document: { schemaVersion: 1, title: `Title ${id}`, scenes: Array.from({ length: scenes }, (_, i) => ({
        title: `Scene ${id} ${i}`, narration: `Narration ${id}`, visualAction: `Visual ${id}`, sourceClaimIds: ['claim'],
      })) } } };
}
function render(assets: PresentationAsset[], overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(PresentationWorkbench, {
    researchObjectId: 'ro', claims: [], assets, version: { versionId: 'v', versionNo: 1, status: 'draft' },
    canWrite: true, onCreateClaim: vi.fn(), onGenerate: vi.fn(), onTransition: vi.fn(),
    onGenerateStoryboard: vi.fn(), onGenerateSceneImage: vi.fn(), ...overrides,
  }));
}

it('opens the newest draft for review instead of hiding it among old generation buttons', () => {
  const markup = render([plan('old', 'approved', '2026-10-07', 4), plan('new', 'draft', '2026-10-08')]);
  expect(markup).toContain('data-active-storyboard="new"');
  expect(markup).toMatch(/<details[^>]*open=""[^>]*data-current-storyboard-details="true"/);
  expect(markup).toContain('Narration new');
  expect(markup).toContain('approvePlan');
  expect(markup).not.toContain('data-scene-image=');
  expect(markup).not.toContain('Narration old');
  expect(markup).toContain('value="old"');
});

it('ties all paid image actions to the active approved plan, preserving other plans as explicit choices', () => {
  const markup = render([plan('old', 'approved', '2026-10-07', 4), plan('new', 'approved', '2026-10-08')]);
  expect(markup).toContain('data-active-storyboard="new"');
  expect(markup.match(/data-scene-image=/g)).toHaveLength(1);
  expect(markup).toContain('data-image-storyboard="new"');
  expect(markup).not.toContain('Narration old');
  expect(markup).toContain('value="old"');
});

it('keeps a newer rejected plan in history without replacing a usable plan or exposing writes', () => {
  const markup = render([plan('rejected', 'rejected', '2026-10-09'), plan('current', 'approved', '2026-10-08')]);
  expect(markup).toContain('data-active-storyboard="current"');
  expect(markup).toContain('data-storyboard-history="true"');
  expect(markup.match(/data-scene-image=/g)).toHaveLength(1);
});

it.each([{ canWrite: false }, { loading: true }, { loadFailed: true }, { working: true }])(
  'does not offer a paid action or plan approval while unavailable: %j', overrides => {
    const markup = render([plan('current', 'draft', '2026-10-08')], overrides);
    expect(markup).toContain('data-active-storyboard="current"');
    expect(markup).not.toContain('approvePlan');
    expect(markup).not.toContain('data-scene-image=');
  },
);

it('uses the actual approval capability instead of interpreting transition permission as approval', () => {
  const blocked = { ...plan('blocked', 'draft', '2026-10-08'), canApprove: false };
  const markup = render([blocked]);
  expect(markup).not.toContain('approvePlan');
  expect(markup).toContain('>reject</button>');
});

it('preserves an explicit older selection until a new result arrives, without retaining a missing or rejected selection', () => {
  const old = plan('old', 'approved', '2026-10-07');
  const current = plan('current', 'draft', '2026-10-08');
  const selection = { latestId: current.id, assetId: old.id };
  expect(selectStoryboard([old, current], selection).active?.id).toBe(old.id);
  expect(selectStoryboard([old, current, plan('newer', 'draft', '2026-10-09')], selection).active?.id).toBe('newer');
  expect(selectStoryboard([current], selection).active?.id).toBe(current.id);
  expect(selectStoryboard([{ ...old, status: 'rejected' }, current], selection).active?.id).toBe(current.id);
});

it('offers a single scene choice outside collapsed approved-plan details without mixing parent ids', () => {
  const markup = render([plan('current', 'approved', '2026-10-08', 4)]);
  expect(markup.match(/data-scene-image=/g)).toHaveLength(1);
  expect(markup).toContain('data-image-storyboard="current"');
  const detailsEnd = markup.indexOf('</details>', markup.indexOf('data-current-storyboard-details="true"'));
  expect(markup.indexOf('data-scene-image=')).toBeGreaterThan(detailsEnd);
  expect(markup).toContain('selectScene');
});

it('shows a pending plan in the embedded writable workbench, with readonly media staying concise', () => {
  const assets = [plan('current', 'draft', '2026-10-08')];
  const markup = render(assets, { resultsOnly: true });
  expect(markup).toContain('data-active-storyboard="current"');
  expect(markup).toContain('approvePlan');
  expect(render(assets, { resultsOnly: true, canWrite: false })).not.toContain('data-active-storyboard=');
});

it('preserves media above the current plan and never turns a rejected-only history into a generation source', () => {
  const media: PresentationAsset = { ...plan('image', 'draft', '2026-10-08'), kind: 'image', storyboard: undefined };
  const markup = render([media, plan('rejected', 'rejected', '2026-10-08')]);
  expect(markup).not.toContain('data-active-storyboard=');
  expect(markup.indexOf('data-presentation-asset="image"')).toBeLessThan(markup.indexOf('data-storyboard-history="true"'));
  expect(markup).not.toContain('data-scene-image=');
  expect(markup).not.toContain('approvePlan');
});
