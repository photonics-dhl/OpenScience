import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { HermesRail } from '../components/hermes/HermesRail';
import { HermesAssistantDrawer } from '../components/hermes/HermesAssistantDrawer';
import { HermesVisualAdapter } from '../components/hermes/HermesVisualAdapter';
import { deriveHermesGuide } from '../components/hermes/hermes-guide';
import { deriveHermesCompositeVisualState, deriveHermesVisualState, hermesTaskHref } from '../components/hermes/hermes-state';

const neutralSuggestion = {
  kind: 'neutral' as const,
  titleKey: 'guide.neutral.title',
  bodyKey: 'guide.neutral.body',
};

describe('Hermes dashboard guidance', () => {
  it('renders an accessible assistant drawer with a real goal composer and task link', () => {
    const markup = renderToStaticMarkup(createElement(HermesAssistantDrawer, {
      open: true,
      onOpenChange: () => undefined,
      locale: 'zh',
      suggestion: {
        kind: 'actionable-task', titleKey: 'guide.actionable.title', bodyKey: 'guide.actionable.body',
        href: '/research-objects/ro-1/hermes?task=task-1', taskId: 'task-1', researchObjectId: 'ro-1',
      },
      dashboardContext: { tasks: [], researchObjects: [] },
    }));

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('guide.eyebrow');
    expect(markup).toContain('<textarea');
    expect(markup).toContain('href="/research-objects/ro-1/hermes?task=task-1"');
  });

  it('derives a truthful guide suggestion from real dashboard priority', () => {
    const task = {
      id: 'ingestion-1', researchObjectId: 'ro-1', researchTitle: 'Study',
      logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null,
    };
    const research = { id: 'ro-2', title: 'Optical memory', status: 'draft' };

    expect(deriveHermesGuide({ tasks: [task], researchObjects: [] })).toEqual({
      kind: 'actionable-task', titleKey: 'guide.review.title', bodyKey: 'guide.review.body',
      href: '/research-objects/ro-1/hermes?task=ingestion-1', taskId: 'ingestion-1', researchObjectId: 'ro-1',
    });
    expect(deriveHermesGuide({ tasks: [{ ...task, state: 'failed_retryable' }], researchObjects: [] }).titleKey).toBe('guide.failed.title');
    expect(deriveHermesGuide({ tasks: [{ ...task, state: 'parsing' }], researchObjects: [] }).titleKey).toBe('guide.processing.title');
    expect(deriveHermesGuide({ tasks: [{ ...task, state: 'queued' }], researchObjects: [] }).titleKey).toBe('guide.queued.title');
    expect(deriveHermesGuide({ tasks: [], researchObjects: [research] })).toEqual({
      kind: 'continue-research', titleKey: 'guide.continue.title', bodyKey: 'guide.continue.body',
      href: '/research-objects/ro-2/edit', researchObjectId: 'ro-2',
    });
    expect(deriveHermesGuide({ tasks: [], researchObjects: [] })).toEqual({
      kind: 'neutral', titleKey: 'guide.neutral.title', bodyKey: 'guide.neutral.body',
    });
  });

  it('derives six honest visual states from real task state', () => {
    expect(deriveHermesVisualState([])).toBe('idle');
    expect(deriveHermesVisualState([{ state: 'queued' }])).toBe('guiding');
    expect(deriveHermesVisualState([{ state: 'parsing' }])).toBe('scanning');
    expect(deriveHermesVisualState([{ state: 'stored' }])).toBe('suggesting');
    expect(deriveHermesVisualState([{ state: 'needs_review' }])).toBe('awaiting_approval');
    expect(deriveHermesVisualState([{ state: 'failed_retryable' }])).toBe('failed');
  });

  it('uses the same ingestion-task deep link for the actionable row', () => {
    const task = { id: 'ingestion-1', researchObjectId: 'ro-1' };
    const href = hermesTaskHref(task);
    const rail = renderToStaticMarkup(createElement(HermesRail, { tasks: [{ ...task, researchTitle: 'Study', logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null }] }));
    expect(href).toBe('/research-objects/ro-1/hermes?task=ingestion-1');
    expect(rail).toContain(`href="${href}"`);
  });

  it('keeps approval fully still even while a guide task is active', () => {
    expect(deriveHermesCompositeVisualState([{ state: 'needs_review' }], true)).toBe('awaiting_approval');
    expect(deriveHermesCompositeVisualState([], true)).toBe('scanning');
  });

  it('renders one honest Hermes mount and keeps approval/reduced fallback still', () => {
    const markup = renderToStaticMarkup(createElement(HermesVisualAdapter, { state: 'awaiting_approval', suggestion: neutralSuggestion, onInvoke: () => undefined }));
    expect(markup.match(/data-hermes-instance/g) ?? []).toHaveLength(1);
    expect(markup).not.toContain('data-live2d-instance');
    expect(markup).toContain('data-motion="still"');
    expect(markup).toContain('data-hermes-fallback="static"');
    expect(markup).toContain('data-hermes-renderer="articulated-mesh"');
    expect(markup).toContain('data-hermes-state="awaiting_approval"');
    expect(markup).toContain('data-hermes-rig="mesh-2d"');
    expect(markup).toContain('data-hermes-rig-status="fallback"');
    expect(markup).toContain('data-hermes-input-ready="false"');
    expect(markup).not.toContain('data-runtime-ready');
    expect(markup.match(/data-hermes-frame=/g) ?? []).toHaveLength(1);
  });

  it('exposes all six visual states without depending on a licensed binary', () => {
    for (const state of ['idle', 'guiding', 'scanning', 'suggesting', 'awaiting_approval', 'failed'] as const) {
      const markup = renderToStaticMarkup(createElement(HermesVisualAdapter, { state, suggestion: neutralSuggestion, onInvoke: () => undefined }));
      expect(markup).toContain(`data-hermes-state="${state}"`);
      expect(markup).toContain('data-hermes-renderer="articulated-mesh"');
      expect(markup).toContain(state === 'scanning' ? 'hermes-pet-working.png' : 'hermes-pet-idle.png');
      expect(markup).toContain('data-hermes-rig="mesh-2d"');
      expect(markup).not.toContain('.moc3');
    }
  });

  it('removes fake CSS part signals and exposes one character-pixel rig owner', () => {
    const idle = renderToStaticMarkup(createElement(HermesVisualAdapter, { state: 'idle', suggestion: neutralSuggestion, onInvoke: () => undefined }));
    const scanning = renderToStaticMarkup(createElement(HermesVisualAdapter, { state: 'scanning', suggestion: neutralSuggestion, onInvoke: () => undefined }));

    expect(idle).not.toContain('data-hermes-part-signal');
    expect(scanning).not.toContain('data-hermes-part-signal');
    expect(idle.match(/data-hermes-rig=/g) ?? []).toHaveLength(1);
    expect(scanning.match(/data-hermes-rig=/g) ?? []).toHaveLength(1);
    expect(idle.match(/<canvas/g) ?? []).toHaveLength(1);
    expect(scanning.match(/<canvas/g) ?? []).toHaveLength(1);
  });

  it('exposes the assistant presence state without decorative motion masquerading as articulation', () => {
    const idle = renderToStaticMarkup(createElement(HermesVisualAdapter, {
      assistantOpen: false, state: 'idle', suggestion: neutralSuggestion, onInvoke: () => undefined,
    }));
    const open = renderToStaticMarkup(createElement(HermesVisualAdapter, {
      assistantOpen: true, state: 'idle', suggestion: neutralSuggestion, onInvoke: () => undefined,
    }));

    expect(idle).not.toContain('data-hermes-idle-signal');
    expect(idle).toContain('data-hermes-presence="idle"');
    expect(open).toContain('data-hermes-presence="open"');
  });
});
