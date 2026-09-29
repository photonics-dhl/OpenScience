import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { IllustrationStyleChoices } from '../components/presentation/IllustrationStyleChoices';
import type { PresentationAsset } from '../lib/api';
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.stubGlobal('React', React);
const base = { id: 'plan', researchObjectId: 'ro', versionId: 'v', kind: 'interactive_html', status: 'approved', sourceClaimIds: ['claim'], storyboard: { locale: 'en', output: 'image', style: 'auto', document: { schemaVersion: 1, title: 'Science', scenes: [{ title: 'Scene', narration: 'Sourced', visualAction: 'Science', sourceClaimIds: ['claim'], illustration: { schemaVersion: 2 }, styleRecommendations: { selectedStyleId: 'article:watercolor', choices: [{ styleId: 'article:watercolor', name: 'Saved watercolor name', reason: 'Saved reason for the sourced label.' }, { styleId: 'infographic:technical-schematic', name: 'Saved schematic name', reason: 'Different crisp material.' }] } }] } } } as PresentationAsset;
const render = (asset = base, canGenerate = true) => renderToStaticMarkup(<IllustrationStyleChoices actorId="actor" researchObjectId="ro" versionId="v" asset={asset} canWrite canGenerate={canGenerate} onSubmitted={vi.fn()} />);
it('shows actual saved names and reasons with one active style and explicit generate action', () => {
  const html = render(); expect(html).toContain('Saved watercolor name'); expect(html).toContain('Saved reason for the sourced label.');
  expect(html.match(/>active</g)).toHaveLength(1); expect(html).toContain('switchAndGenerate');
  expect(html).not.toContain('approve');
});
it('keeps historical plans without optional metadata usable without invented recommendations', () => {
  const old = structuredClone(base); delete old.storyboard!.document.scenes[0]!.styleRecommendations;
  expect(render(old)).toBe('');
});
it('shows a permission notice for non-admin and preserves multi-scene read-only metadata', () => {
  expect(render(base, false)).toContain('stylePermissionRequired');
  const multi = structuredClone(base); multi.storyboard!.document.scenes.push(structuredClone(multi.storyboard!.document.scenes[0]!));
  const html = render(multi); expect(html).toContain('singleSceneOnly'); expect(html).toContain('Saved watercolor name');
});
