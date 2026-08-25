import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ push: vi.fn() }) }));

import { HermesRail } from '../components/hermes/HermesRail';
import { HermesAssistantDrawer } from '../components/hermes/HermesAssistantDrawer';
import { HermesVisualAdapter } from '../components/hermes/HermesVisualAdapter';
import { HermesPresenceControl } from '../components/hermes/HermesPresenceControl';
import { deriveHermesGuide } from '../components/hermes/hermes-guide';
import { deriveHermesCompositeVisualState, deriveHermesVisualState, hermesTaskHref } from '../components/hermes/hermes-state';
import { HERMES_CONTEXT_ACTIONS, resolveHermesIntroSequence, resolveHermesResearchHref } from '../lib/hermes/context-menu-actions';
import { HERMES_ACTION_CATALOG } from '../lib/hermes/action-catalog';

const neutralSuggestion = {
  kind: 'neutral' as const,
  titleKey: 'guide.neutral.title',
  bodyKey: 'guide.neutral.body',
};

describe('Hermes dashboard guidance', () => {
  it('offers eight companion gestures and four truthful research actions from the real action catalog', () => {
    const companion = HERMES_CONTEXT_ACTIONS.filter((item) => item.group === 'companion');
    const research = HERMES_CONTEXT_ACTIONS.filter((item) => item.group === 'research');

    expect(companion).toHaveLength(8);
    expect(research).toHaveLength(4);
    expect(new Set(HERMES_CONTEXT_ACTIONS.map((item) => item.key)).size).toBe(12);
    expect(HERMES_CONTEXT_ACTIONS.every((item) => HERMES_ACTION_CATALOG[item.action])).toBe(true);
    expect(HERMES_CONTEXT_ACTIONS.every((item) => item.labelKey && item.feedbackKey && item.icon)).toBe(true);
    expect(resolveHermesResearchHref('continue', {
      href: '/research-objects/ro-1/edit', researchObjectId: 'ro-1',
    })).toBe('/research-objects/ro-1/edit');
    expect(resolveHermesResearchHref('evidence', { researchObjectId: 'ro-1' })).toBe('/research-objects/ro-1/hermes');
    expect(resolveHermesResearchHref('sources', { researchObjectId: 'ro-1' })).toBe('/research-objects/ro-1/files');
    expect(resolveHermesResearchHref('compare', { researchObjectId: 'ro-1' })).toBe('/research-objects/ro-1/versions');
    expect(resolveHermesResearchHref('sources', {})).toBe('/research-objects/new?mode=import');
    expect(resolveHermesResearchHref('compare', { researchObjectId: 'ro / 1' })).toBe('/research-objects/ro%20%2F%201/versions');
  });

  it('introduces Hermes with two sequential short lines: presence first, truthful context second', () => {
    expect(resolveHermesIntroSequence('actionable-task')).toEqual([
      { action: 'ear-perk', messageKey: 'guide.menu.intro.presence' },
      { action: 'evidence-check', messageKey: 'guide.menu.intro.actionable' },
    ]);
    expect(resolveHermesIntroSequence('continue-research')[1]?.messageKey).toBe('guide.menu.intro.continue');
    expect(resolveHermesIntroSequence('neutral')[1]?.messageKey).toBe('guide.menu.intro.neutral');
  });

  it('keeps an explicit original, compact and quiet presence control in work surfaces', () => {
    const markup = renderToStaticMarkup(createElement(HermesPresenceControl, {
      mode: 'compact', onChange: () => undefined,
    }));
    expect(markup).toContain('data-hermes-presence-control="true"');
    expect(markup.match(/role="menuitemradio"/g) ?? []).toHaveLength(3);
    expect(markup).toContain('>original</span>');
    expect(markup).toContain('>compact</span>');
    expect(markup).toContain('>quiet</span>');
    expect(markup).toContain('aria-checked="true"');
  });

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
    expect(deriveHermesVisualState([{ state: 'needs_review' }])).toBe('suggesting');
    expect(deriveHermesVisualState([{ state: 'failed_retryable' }])).toBe('failed');
  });

  it('uses the same ingestion-task deep link for the actionable row', () => {
    const task = { id: 'ingestion-1', researchObjectId: 'ro-1' };
    const href = hermesTaskHref(task);
    const rail = renderToStaticMarkup(createElement(HermesRail, { tasks: [{ ...task, researchTitle: 'Study', logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null }] }));
    expect(href).toBe('/research-objects/ro-1/hermes?task=ingestion-1');
    expect(rail).toContain(`href="${href}"`);
  });

  it('keeps a queued review alive on the dashboard instead of treating it as an open approval surface', () => {
    expect(deriveHermesCompositeVisualState([{ state: 'needs_review' }], false)).toBe('suggesting');
    expect(deriveHermesCompositeVisualState([{ state: 'needs_review' }], true)).toBe('scanning');
    expect(deriveHermesCompositeVisualState([], true)).toBe('scanning');
  });

  it('renders one honest Hermes mount and keeps approval/reduced fallback still', () => {
    const markup = renderToStaticMarkup(createElement(HermesVisualAdapter, { state: 'awaiting_approval', suggestion: neutralSuggestion, onInvoke: () => undefined }));
    expect(markup.match(/data-hermes-instance/g) ?? []).toHaveLength(1);
    expect(markup).toContain('data-live2d-instance="wanko"');
    expect(markup).toContain('data-motion="still"');
    expect(markup).toContain('data-hermes-fallback="static"');
    expect(markup).toContain('data-hermes-renderer="articulated-mesh"');
    expect(markup).toContain('data-hermes-state="awaiting_approval"');
    expect(markup).toContain('data-hermes-rig="live2d-wanko"');
    expect(markup).toContain('data-hermes-rig-status="starting"');
    expect(markup).toContain('data-hermes-input-ready="false"');
    expect(markup).not.toContain('data-runtime-ready');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('<picture');
    expect(markup.match(/<svg/g) ?? []).toHaveLength(1);
    expect(markup).toContain('class="hermes-portrait');
    expect(markup).not.toContain('poster-');

    const reduced = renderToStaticMarkup(createElement(HermesVisualAdapter, {
      reducedMotion: true, state: 'idle', suggestion: neutralSuggestion, onInvoke: () => undefined,
    }));
    expect(reduced).not.toContain('<img');
    expect(reduced).not.toContain('<picture');
    expect(reduced.match(/<svg/g) ?? []).toHaveLength(1);
    expect(reduced).toContain('class="hermes-portrait');
    expect(reduced).not.toContain('poster-');
    expect(reduced).not.toContain('/hermes/pet/');
  });

  it('exposes all six visual states without depending on a licensed binary', () => {
    for (const state of ['idle', 'guiding', 'scanning', 'suggesting', 'awaiting_approval', 'failed'] as const) {
      const markup = renderToStaticMarkup(createElement(HermesVisualAdapter, { state, suggestion: neutralSuggestion, onInvoke: () => undefined }));
      expect(markup).toContain(`data-hermes-state="${state}"`);
      expect(markup).toContain('data-hermes-renderer="articulated-mesh"');
      expect(markup).not.toContain('<img');
      expect(markup).not.toContain('<picture');
      expect(markup.match(/<svg/g) ?? []).toHaveLength(1);
      expect(markup).toContain('class="hermes-portrait');
      expect(markup).not.toContain('poster-');
      expect(markup).not.toContain('/hermes/pet/');
      expect(markup).toContain('data-hermes-rig="live2d-wanko"');
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

  it('renders the selected action feedback as one mouth-origin sentence without a detached label', () => {
    const markup = renderToStaticMarkup(createElement(HermesVisualAdapter, {
      menuFeedback: { action: 'read', messageKey: 'guide.menu.actions.read-together.feedback' },
      state: 'idle', suggestion: neutralSuggestion, onInvoke: () => undefined,
    }));

    expect(markup).toContain('data-hermes-menu-feedback="true"');
    expect(markup).toContain('data-hermes-feedback-action="read"');
    expect(markup).toContain('data-hermes-speech-copy="single"');
    expect(markup).toContain('data-hermes-speech-origin="mouth"');
    expect(markup).toContain('data-hermes-speech-silhouette="true"');
    expect(markup.match(/data-hermes-speech-contour=/g) ?? []).toHaveLength(1);
    expect(markup).toContain('data-hermes-speech-contour="single"');
    expect(markup).toContain('data-hermes-speech-tail-profile="slender"');
    expect(markup).toContain('data-hermes-speech-tip="true"');
    expect(markup).toContain('data-hermes-visible-mouth-anchor="true"');
    expect(markup).toContain('data-hermes-visible-crown-anchor="true"');
    expect(markup).toContain('guide.menu.actions.read-together.feedback');
    expect(markup).not.toContain('<span>guide.menu.companion</span>');
    expect(markup).not.toContain('data-hermes-mouth-anchor=');
  });
});
