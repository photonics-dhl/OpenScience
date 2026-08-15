import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { HermesRail } from '../components/hermes/HermesRail';
import { HermesVisualAdapter } from '../components/hermes/HermesVisualAdapter';
import { deriveHermesVisualState, hermesTaskHref } from '../components/hermes/hermes-state';

describe('Hermes dashboard guidance', () => {
  it('derives six honest visual states from real task state', () => {
    expect(deriveHermesVisualState([])).toBe('idle');
    expect(deriveHermesVisualState([{ state: 'queued' }])).toBe('guiding');
    expect(deriveHermesVisualState([{ state: 'parsing' }])).toBe('scanning');
    expect(deriveHermesVisualState([{ state: 'stored' }])).toBe('suggesting');
    expect(deriveHermesVisualState([{ state: 'needs_review' }])).toBe('awaiting_approval');
    expect(deriveHermesVisualState([{ state: 'failed_retryable' }])).toBe('failed');
  });

  it('uses the same ingestion-task deep link for the visual and actionable row', () => {
    const task = { id: 'ingestion-1', researchObjectId: 'ro-1' };
    const href = hermesTaskHref(task);
    const rail = renderToStaticMarkup(createElement(HermesRail, { tasks: [{ ...task, researchTitle: 'Study', logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null }] }));
    const visual = renderToStaticMarkup(createElement(HermesVisualAdapter, { state: 'awaiting_approval', href }));
    expect(href).toBe('/research-objects/ro-1/hermes?task=ingestion-1');
    expect(rail).toContain(`href="${href}"`);
    expect(visual).toContain(`href="${href}"`);
  });

  it('renders one honest Hermes mount and keeps approval/reduced fallback still', () => {
    const markup = renderToStaticMarkup(createElement(HermesVisualAdapter, { state: 'awaiting_approval', href: '/dashboard' }));
    expect(markup.match(/data-hermes-instance/g) ?? []).toHaveLength(1);
    expect(markup).not.toContain('data-live2d-instance');
    expect(markup).toContain('data-motion="still"');
    expect(markup).toContain('data-hermes-fallback="static"');
    expect(markup).toContain('data-hermes-renderer="original-vector"');
    expect(markup).toContain('data-hermes-state="awaiting_approval"');
    expect(markup).toContain('data-hermes-gaze="true"');
  });

  it('exposes all six visual states without depending on a licensed binary', () => {
    const expectedActions = {
      idle: 'Hermes_Idle',
      guiding: 'Hermes_Guiding',
      scanning: 'Hermes_Scanning',
      suggesting: 'Hermes_Suggesting',
      awaiting_approval: 'Hermes_AwaitingApproval',
      failed: 'Hermes_Failed',
    } as const;

    for (const state of ['idle', 'guiding', 'scanning', 'suggesting', 'awaiting_approval', 'failed'] as const) {
      const markup = renderToStaticMarkup(createElement(HermesVisualAdapter, { state, href: '/dashboard' }));
      expect(markup).toContain(`data-hermes-state="${state}"`);
      expect(markup).toContain('data-hermes-renderer="original-vector"');
      expect(markup).toContain('data-hermes-3d-host="true"');
      expect(markup).toContain(`data-hermes-action="${expectedActions[state]}"`);
      expect(markup).not.toContain('.moc3');
    }
  });

  it('keeps the original portrait as the first-frame fallback and marks approval as still', () => {
    const markup = renderToStaticMarkup(createElement(HermesVisualAdapter, { state: 'awaiting_approval', href: '/dashboard' }));
    expect(markup).toContain('data-hermes-fallback-visible="true"');
    expect(markup).toContain('data-hermes-3d-policy="still"');
    expect(markup).not.toContain('<canvas');
  });

  it('resets fallback readiness on teardown and owns async renderers by generation', () => {
    const mountSource = readFileSync(fileURLToPath(new URL('../components/hermes/Hermes3DMount.tsx', import.meta.url)), 'utf8');
    const adapterSource = readFileSync(fileURLToPath(new URL('../components/hermes/HermesVisualAdapter.tsx', import.meta.url)), 'utf8');
    expect(mountSource).toContain('onUnavailable(): void');
    expect(mountSource).toContain('generationRef.current');
    expect(mountSource).toContain('rendererRef.current === ownedRenderer');
    expect(adapterSource).toContain('onUnavailable={() => setThreeReady(false)}');
  });

  it('keeps failed non-looping and drives state-specific scholarly light semantics', () => {
    const rendererSource = readFileSync(fileURLToPath(new URL('../lib/hermes/hermes-3d-renderer.ts', import.meta.url)), 'utf8');
    expect(rendererSource).toContain("state !== 'awaiting_approval' && state !== 'failed'");
    expect(rendererSource).toContain('uStateMode');
    expect(rendererSource).toContain('uMaterialRole');
    expect(rendererSource).toContain('scanningSweep');
    expect(rendererSource).toContain('guidingPulse');
  });
});
