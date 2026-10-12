import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(), useRef: vi.fn(), useEffect: vi.fn(), useId: vi.fn(() => 'storyboard-test') };
});
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
import { buildStoryboardRequest, StoryboardPanel } from '../components/presentation/StoryboardPanel';
import { StoryboardPlans } from '../components/presentation/StoryboardPlans';
import { createPresentationStoryboardHandlers } from '../components/presentation/ResearchPresentation';

const hookStates: unknown[] = [];
const hookRefs: Array<{ current: unknown }> = [];
let stateIndex = 0;
let refIndex = 0;
vi.mocked(React.useState).mockImplementation((<T,>(initial: T | (() => T)) => {
  const index = stateIndex++;
  if (!(index in hookStates)) hookStates[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
  return [hookStates[index] as T, (next: T | ((value: T) => T)) => {
    hookStates[index] = typeof next === 'function' ? (next as (value: T) => T)(hookStates[index] as T) : next;
  }];
}) as typeof React.useState);
vi.mocked(React.useRef).mockImplementation((<T,>(initial: T) => {
  const index = refIndex++;
  hookRefs[index] ??= { current: initial };
  return hookRefs[index] as { current: T };
}) as typeof React.useRef);
vi.mocked(React.useEffect).mockImplementation(() => {});

function resetHooks() { hookStates.length = 0; hookRefs.length = 0; stateIndex = 0; refIndex = 0; }
function renderPanel(props: React.ComponentProps<typeof StoryboardPanel>) {
  stateIndex = 0; refIndex = 0;
  return StoryboardPanel(props);
}
function find(node: React.ReactNode, match: (element: React.ReactElement) => boolean): React.ReactElement {
  if (React.isValidElement(node)) {
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props.children)) {
      try { return find(child, match); } catch { /* Search the remaining siblings. */ }
    }
  }
  throw new Error('Expected storyboard control was not rendered');
}

const claim = { id: 'claim', researchObjectId: 'ro', versionId: 'v', parentClaimId: null, kind: 'core' as const,
  statement: 'A reviewed claim', assessment: 'supported' as const, conditions: [], limitations: [], provenance: {},
  extractionStatus: 'succeeded' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01' };

beforeEach(() => resetHooks());

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

it('locks storyboard submission on the first click and exposes processing then success feedback', async () => {
  const onGenerate = vi.fn(() => Promise.resolve());
  const props = { claims: [claim], selectedClaimIds: ['claim'], canGenerate: true, onGenerate };
  const form = () => find(renderPanel(props), element => element.type === 'form');
  form().props.onSubmit({ preventDefault: vi.fn() });
  const during = form();
  expect(onGenerate).toHaveBeenCalledTimes(1);
  expect(find(during, element => element.props['data-storyboard-feedback'] === 'true').props['data-write-state']).toBe('working');
  form().props.onSubmit({ preventDefault: vi.fn() });
  expect(onGenerate).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  expect(find(form(), element => element.props['data-storyboard-feedback'] === 'true').props['data-write-state']).toBe('success');
});

it('keeps the real generation promise in both storyboard wrappers', async () => {
  const generate = vi.fn((_ids: string[], storyboard?: unknown, sceneImage?: unknown) => Promise.resolve({ storyboard, sceneImage }));
  const handlers = createPresentationStoryboardHandlers(generate);
  const storyboard = { locale: 'en' as const, style: 'auto' as const, output: 'image' as const, instruction: 'Explain it' };
  const sceneImage = { storyboardAssetId: 'plan', sceneIndex: 2 };
  await expect(handlers.onGenerateStoryboard(['claim'], storyboard)).resolves.toMatchObject({ storyboard });
  await expect(handlers.onGenerateSceneImage(['claim'], sceneImage)).resolves.toMatchObject({ sceneImage });
  expect(generate).toHaveBeenNthCalledWith(1, ['claim'], storyboard);
  expect(generate).toHaveBeenNthCalledWith(2, ['claim'], undefined, sceneImage);
});

it('shows a failure and releases the storyboard lock when generation rejects or reports failure', async () => {
  const rejected = vi.fn(() => Promise.reject(new Error('network')));
  const rejectedProps = { claims: [claim], selectedClaimIds: ['claim'], canGenerate: true, onGenerate: rejected };
  find(renderPanel(rejectedProps), element => element.type === 'form').props.onSubmit({ preventDefault: vi.fn() });
  await Promise.resolve();
  expect(find(renderPanel(rejectedProps), element => element.props['data-storyboard-feedback'] === 'true').props['data-write-state']).toBe('error');

  const failed = vi.fn(() => Promise.resolve({ status: 'failed' }));
  const failedProps = { claims: [claim], selectedClaimIds: ['claim'], canGenerate: true, onGenerate: failed };
  find(renderPanel(failedProps), element => element.type === 'form').props.onSubmit({ preventDefault: vi.fn() });
  await Promise.resolve();
  expect(find(renderPanel(failedProps), element => element.props['data-storyboard-feedback'] === 'true').props['data-write-state']).toBe('error');
});

it('locks approved scene-image and draft transition writes independently', async () => {
  const scene = { title: 'Light', narration: 'Wave spreads', visualAction: 'Show wavefronts', sourceClaimIds: ['claim'] };
  const storyboard = { document: { schemaVersion: 1 as const, title: 'Plan', scenes: [scene] }, locale: 'en' as const, style: 'ink' as const };
  const asset = { id: 'plan', researchObjectId: 'ro', versionId: 'v', kind: 'interactive_html' as const, contentHash: 'a'.repeat(64),
    generator: 'Hermes', generatorVersion: 'v1', status: 'approved' as const, label: 'Plan', sourceClaimIds: ['claim'],
    createdAt: '2026-01-01', updatedAt: '2026-01-01', storyboard, canGenerateSceneImage: true };
  const onGenerateSceneImage = vi.fn(() => Promise.resolve());
  const transition = vi.fn(() => Promise.resolve());
  const common = { assets: [asset], claims: [claim], canWrite: true, unavailable: false, onGenerateSceneImage, onTransition: transition };
  const plans = () => { stateIndex = 0; refIndex = 0; return StoryboardPlans(common); };
  const image = () => find(plans(), element => element.props['data-scene-image'] === 0 && element.props['data-image-storyboard'] === 'plan');
  image().props.onClick(); image().props.onClick();
  expect(onGenerateSceneImage).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  const draft = { ...asset, status: 'draft' as const, canApprove: true, canTransition: true };
  const transitionPlans = () => { stateIndex = 0; refIndex = 0; return StoryboardPlans({ ...common, assets: [draft] }); };
  const approve = () => find(transitionPlans(), element => element.props.children === 'approvePlan');
  approve().props.onClick(); approve().props.onClick();
  expect(transition).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  expect(find(transitionPlans(), element => element.props['data-storyboard-transition-feedback'] === 'true').props['data-write-state']).toBe('success');
});
