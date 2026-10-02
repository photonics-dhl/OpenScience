import { readFileSync } from 'node:fs';

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `translated:${key}` }));

import { HermesPerformanceBubble } from '@/components/hermes/HermesPerformanceBubble';
import { HermesSpeechBalloon } from '@/components/hermes/HermesSpeechBalloon';
import type { HermesSpeechCue } from '@/lib/hermes/performance-beat';

const cue: HermesSpeechCue = {
  beatId: 'cap-check:42000',
  messageKey: 'performance.capCheck.one',
  tone: 'focused',
  visibleUntilMs: 46_000,
};

const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');


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
    expect(html).toContain('data-hermes-speech-origin="hat-upper-left"');
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

  it('preserves a single accessible feedback region when visual speech cannot fit', () => {
    for (const content of [
      <HermesPerformanceBubble cue={cue} visible={false} />,
      <HermesSpeechBalloon action="read" compact={false} visible={false}>Still here.</HermesSpeechBalloon>,
    ]) {
      const html = renderToStaticMarkup(content);
      expect(html).toContain('aria-hidden="true"');
      expect(html.match(/role="status"/gu)).toHaveLength(1);
      expect(html).toContain('class="sr-only" role="status"');
      expect(html).not.toContain('aria-live="polite"');
    }
  });

  it('uses one short hat speech contour, shared with menu feedback', () => {
    const html = renderToStaticMarkup(<HermesPerformanceBubble cue={cue} visible />);
    expect(html.match(/data-hermes-speech-contour=/gu)).toHaveLength(1);
    expect(html).toContain('data-hermes-speech-tail-profile="short"');
    expect(html).toContain('data-hermes-speech-tip="true"');
  });
  it('renders one short sentence without a mobile action toolbar', () => {
    const html = renderToStaticMarkup(
      <HermesPerformanceBubble cue={cue} visible />,
    );

    expect(html.match(/<p\b/gu)).toHaveLength(1);
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
