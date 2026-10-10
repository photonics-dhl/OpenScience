import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
import { buildStoryboardRequest, StoryboardPanel } from '../components/presentation/StoryboardPanel';

it('shows separate spoken and visual plans with the parent comparison', () => {
  const scene = { title: 'Light', narration: 'Old narration', visualAction: 'Old visual', durationSeconds: 8, sourceClaimIds: ['claim'] };
  const base = { document: { schemaVersion: 1 as const, title: 'Original', scenes: [scene] }, locale: 'en' as const, style: 'ink' as const };
  const markup = renderToStaticMarkup(createElement(StoryboardPanel, { storyboard: { ...base, document: { ...base.document, title: 'Revision', scenes: [{ ...scene, narration: 'New narration', visualAction: 'New visual' }] } }, parent: base, claims: [], canGenerate: false }));
  for (const text of ['Old narration', 'New narration', 'Old visual', 'New visual', 'planOnly']) expect(markup).toContain(text);
  expect(markup).not.toContain('<form');
});
it('discloses the charge before a generation form and suppresses writes when unavailable', () => {
  const props = { claims: [], selectedClaimIds: ['claim'], onGenerate: vi.fn() };
  const markup = renderToStaticMarkup(createElement(StoryboardPanel, { ...props, canGenerate: true }));
  expect(markup).toContain('charge');
  expect(markup).toContain('maxLength="1000"');
  expect(renderToStaticMarkup(createElement(StoryboardPanel, { ...props, canGenerate: false }))).not.toContain('<form');
});

it('provides storyboard labels in the actual presentation namespace for both locales', async () => {
  for (const locale of ['en', 'zh']) {
    const messages = await import(`../messages/${locale}.json`);
    expect(messages.default.presentation.storyboard.style).not.toBe('');
    expect(messages.default.presentation.storyboard.defaultInstruction.length).toBeGreaterThan(0);
    expect(messages.default.presentation.storyboard.charge).toContain('1 AI credit');
  }
});

it('offers one paid image action per current scene only when authorized', () => {
  const scene = { title: 'Light', narration: 'Wave spreads', visualAction: 'Show wavefronts', durationSeconds: 8, sourceClaimIds: ['claim'] };
  const storyboard = { document: { schemaVersion: 1 as const, title: 'Plan', scenes: [scene, scene] }, locale: 'en' as const, style: 'ink' as const };
  const props = { storyboard, parent: storyboard, baseAssetId: 'parent', claims: [], selectedClaimIds: ['claim'], canGenerate: false, onGenerateImage: vi.fn() };
  const allowed = renderToStaticMarkup(createElement(StoryboardPanel, { ...props, canGenerateImage: true }));
  expect(allowed.match(/data-scene-image=/g)).toHaveLength(2);
  expect(allowed).toContain('imageCharge');
  expect(renderToStaticMarkup(createElement(StoryboardPanel, { ...props, canGenerateImage: false }))).not.toContain('data-scene-image=');
});

it('defaults new image plans to narrative-driven style and hides internal style markers', () => {
  const scene = { title: 'Relation', narration: 'One connection',
    visualAction: '构图：clear link。视觉处理：BAOYU_STYLE=article:scientific; precise ink。可见标签：Connection。',
    sourceClaimIds: ['claim'] };
  const storyboard = { document: { schemaVersion: 1 as const, title: 'Plan', scenes: [scene] }, locale: 'en' as const, style: 'auto' };
  const markup = renderToStaticMarkup(createElement(StoryboardPanel, { storyboard, claims: [], canGenerate: true, selectedClaimIds: ['claim'], onGenerate: vi.fn() }));
  const newPlan = renderToStaticMarkup(createElement(StoryboardPanel, { claims: [], canGenerate: true, selectedClaimIds: ['claim'], onGenerate: vi.fn() }));
  expect(newPlan).toContain('checked="" value="auto"');
  expect(markup).toContain('precise ink');
  expect(markup).not.toContain('BAOYU_STYLE=');
});

it('exposes the bounded art-only revision choice for an existing storyboard', async () => {
  const messages = await import('../messages/zh.json');
  const scene = { title: 'Relation', narration: 'One connection', visualAction: 'Show the relation', sourceClaimIds: ['claim'] };
  const storyboard = { document: { schemaVersion: 1 as const, title: 'Plan', scenes: [scene] }, locale: 'zh' as const, style: 'auto' };
  const markup = renderToStaticMarkup(createElement(StoryboardPanel, { storyboard, baseAssetId: 'base', claims: [], canGenerate: true, selectedClaimIds: ['claim'], onGenerate: vi.fn() }));
  expect(messages.default.presentation.storyboard.artOnly).toContain('构图');
  expect(messages.default.presentation.storyboard.artOnlyHint).toContain('科学字段');
  expect(markup).toContain('artOnly');
});

it('carries the existing narrative scope into an art-only revision payload', () => {
  const request = buildStoryboardRequest({ locale: 'zh', style: 'auto', output: 'image', instruction: ' preserve the art direction ',
    baseAssetId: 'base', artOnly: true, storyboard: { narrative: true } });
  expect(request).toMatchObject({ baseAssetId: 'base', revisionMode: 'art', artSceneIndex: 0, narrative: true, instruction: 'preserve the art direction' });
  const legacy = buildStoryboardRequest({ locale: 'zh', style: 'auto', output: 'image', instruction: 'restyle', baseAssetId: 'base', artOnly: true });
  expect(legacy).not.toHaveProperty('narrative');
});

it('sends a hard one-scene paper scope for the focused new research image', () => {
  expect(buildStoryboardRequest({ locale: 'zh', style: 'auto', output: 'image', instruction: ' Explain the core mechanism ',
    artOnly: false, singlePaperImage: true })).toEqual({ locale: 'zh', style: 'auto', output: 'image',
      instruction: 'Explain the core mechanism', narrative: true, narrativeSceneLimit: 1 });
});

it('does not replace existing revisions or video scope with the new image scene limit', () => {
  const revision = buildStoryboardRequest({ locale: 'en', style: 'ink', output: 'image', instruction: 'Keep the same science',
    baseAssetId: 'base', artOnly: true, storyboard: { narrative: true }, singlePaperImage: true });
  expect(revision).toMatchObject({ baseAssetId: 'base', revisionMode: 'art', narrative: true });
  expect(revision).not.toHaveProperty('narrativeSceneLimit');
  expect(buildStoryboardRequest({ locale: 'en', style: 'auto', output: 'video', instruction: 'Plan this video',
    artOnly: false, singlePaperImage: true })).not.toHaveProperty('narrativeSceneLimit');
});
