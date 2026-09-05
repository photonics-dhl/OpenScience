import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
import { StoryboardPanel } from '../components/presentation/StoryboardPanel';

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
