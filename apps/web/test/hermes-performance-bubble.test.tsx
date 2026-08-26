import { readFileSync } from 'node:fs';

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `translated:${key}` }));

import { HermesPerformanceBubble } from '@/components/hermes/HermesPerformanceBubble';
import type { HermesSpeechCue } from '@/lib/hermes/performance-beat';

const cue: HermesSpeechCue = {
  beatId: 'cap-check:42000',
  messageKey: 'performance.capCheck.one',
  tone: 'focused',
  visibleUntilMs: 46_000,
};

const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return globals.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'u'))?.[1] ?? '';
}

describe('Hermes performance bubble', () => {
  it('renders one synchronized polite annotation for the active performance beat', () => {
    const html = renderToStaticMarkup(
      <HermesPerformanceBubble cue={cue} visible />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-hidden="false"');
    expect(html).toContain('data-hermes-performance-bubble="true"');
    expect(html).toContain('data-hermes-bubble-material="warm-paper"');
    expect(html).toContain('data-hermes-performance-beat="cap-check:42000"');
    expect(html).toContain('data-hermes-speech-cue="performance.capCheck.one"');
    expect(html).toContain('data-hermes-speech-copy="single"');
    expect(html).toContain('data-hermes-speech-origin="mouth"');
    expect(html).toContain('translated:performance.capCheck.one');
    expect(html).not.toContain('translated:performance.tones.focused');
    expect(html).not.toContain('translated:dismissSpeech');
    expect(html).not.toContain('<button');
  });

  it('hides an inactive sentence without leaving a speech control behind', () => {
    const html = renderToStaticMarkup(
      <HermesPerformanceBubble cue={cue} visible={false} />,
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-hermes-speech-visible="false"');
    expect(html).not.toContain('tabindex=');
  });

  it('uses a compact warm-paper speech oval with a mouth-pointing tail', () => {
    const bubble = cssRule('.hermes-performance-bubble');
    const tail = cssRule('.hermes-performance-bubble::after');
    const leftBelow = cssRule(".hermes-workspace-stage[data-hermes-bubble-horizontal='left'][data-hermes-bubble-vertical='below'] .hermes-performance-bubble::after");
    const mobileBelow = cssRule(".hermes-workspace-stage[data-hermes-stage-size='200'][data-hermes-bubble-vertical='below'] .hermes-performance-bubble::after");
    const rightAbove = cssRule(".hermes-workspace-stage[data-hermes-bubble-horizontal='right'][data-hermes-bubble-vertical='above'] .hermes-performance-bubble::after");
    const reducedFeedback = cssRule(".hermes-workspace-stage[data-hermes-motion-preference='reduced'] .hermes-menu-feedback");
    const speakingFooter = cssRule(".hermes-workspace-stage[data-hermes-bubble-safe='true'][data-hermes-speech-visible='true'] .hermes-visual-invoke-label");
    const visibleCta = cssRule(".hermes-workspace-stage[data-hermes-anchored='true'][data-hermes-speech-visible='false'] .hermes-visible-invoke-cta");

    expect(bubble).toContain('max-width: 13.25rem;');
    expect(bubble).toContain('border-radius: 50% 47% 52% 46% / 55% 51% 49% 45%;');
    expect(bubble).toContain('background: var(--os-paper-strong);');
    expect(bubble).toContain('font-size: .9375rem;');
    expect(bubble).not.toMatch(/gradient|blur/iu);
    expect(tail).toContain('clip-path: polygon(0 0, 100% 0, 100% 100%);');
    expect(tail).toContain('background: var(--os-paper-strong);');
    expect(tail).toContain('border-right: 1px solid var(--os-ink);');
    expect(globals).toContain("[data-hermes-bubble-horizontal='left'] .hermes-performance-bubble::after");
    expect(leftBelow).toContain('clip-path: polygon(0 100%, 100% 100%, 100% 0);');
    expect(leftBelow).toContain('top: -2.7rem;');
    expect(mobileBelow).toContain('top: -1.85rem;');
    expect(mobileBelow).toContain('bottom: auto;');
    expect(rightAbove).toContain('clip-path: polygon(0 0, 100% 0, 0 100%);');
    expect(reducedFeedback).toContain('animation: none;');
    expect(speakingFooter).toContain('display: none;');
    expect(visibleCta).toContain('pointer-events: auto;');
    expect(globals).toContain("[data-hermes-stage-size='200'] .hermes-performance-bubble");
    expect(globals).not.toContain("[data-hermes-stage-size='176']");
  });

  it('renders one short sentence without a mobile action toolbar', () => {
    const html = renderToStaticMarkup(
      <HermesPerformanceBubble cue={cue} visible />,
    );

    expect(html.match(/<p>/gu)).toHaveLength(1);
    expect(html).not.toContain('hermes-companion-actions');
    expect(html).not.toContain('hermes-companion-take-me');
  });

  it('keeps the renderer recovery control accessible while Hermes feedback is visible', () => {
    expect(globals).toContain(
      ".hermes-workspace-stage:has([data-hermes-menu-feedback='true']) .hermes-motion-enable:not([data-motion-runtime='fallback'])",
    );
    expect(globals).not.toContain(
      ".hermes-workspace-stage:has([data-hermes-menu-feedback='true']) .hermes-motion-enable,",
    );
  });
});
