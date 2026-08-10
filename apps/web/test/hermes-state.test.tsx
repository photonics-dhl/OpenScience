import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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

  it('renders at most one Live2D mount and keeps approval/reduced fallback still', () => {
    const markup = renderToStaticMarkup(createElement(HermesVisualAdapter, { state: 'awaiting_approval', href: '/dashboard' }));
    expect(markup.match(/data-live2d-instance/g) ?? []).toHaveLength(1);
    expect(markup).toContain('data-motion="still"');
    expect(markup).toContain('data-hermes-fallback="static"');
  });
});
