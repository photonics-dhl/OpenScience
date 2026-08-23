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
  return globals.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'u'))?.[1] ?? '';
}

describe('Hermes performance bubble', () => {
  it('renders one synchronized polite annotation for the active performance beat', () => {
    const html = renderToStaticMarkup(
      <HermesPerformanceBubble cue={cue} onDismiss={() => undefined} visible />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-hidden="false"');
    expect(html).toContain('data-hermes-performance-bubble="true"');
    expect(html).toContain('data-hermes-bubble-material="ink-edge"');
    expect(html).toContain('data-hermes-performance-beat="cap-check:42000"');
    expect(html).toContain('data-hermes-speech-cue="performance.capCheck.one"');
    expect(html).toContain('translated:performance.tones.focused');
    expect(html).toContain('translated:performance.capCheck.one');
    expect(html).toContain('translated:dismissSpeech');
  });

  it('removes hidden speech controls from the tab order', () => {
    const html = renderToStaticMarkup(
      <HermesPerformanceBubble cue={cue} onDismiss={() => undefined} visible={false} />,
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('data-hermes-speech-visible="false"');
  });

  it('keeps the ink-edge annotation compact, restrained and touch accessible', () => {
    const bubble = cssRule('.hermes-companion-bubble');
    const dismiss = cssRule('.hermes-companion-dismiss');
    const tail = cssRule('.hermes-companion-bubble::after');
    const leftTail = cssRule(".hermes-workspace-stage[data-hermes-bubble-horizontal='left'] .hermes-companion-bubble::after");

    expect(bubble).toContain('max-width: 15.5rem;');
    expect(bubble).toContain('border: 1px solid rgb(241 238 231 / .14);');
    expect(bubble).toContain('border-radius: 4px;');
    expect(bubble).toContain('background: rgb(12 15 14 / .97);');
    expect(bubble).toContain('box-shadow: 0 8px 20px rgb(0 0 0 / .18);');
    expect(bubble).not.toMatch(/gradient|blur/iu);
    expect(dismiss).toContain('width: 40px;');
    expect(dismiss).toContain('height: 40px;');
    expect(tail).toContain('left: 1.25rem;');
    expect(leftTail).toContain('right: 1.25rem;');
    expect(globals).toContain("[data-hermes-stage-size='200'] .hermes-companion-bubble");
    expect(globals).not.toContain("[data-hermes-stage-size='176']");
  });

  it('renders one short sentence without a mobile action toolbar', () => {
    const html = renderToStaticMarkup(
      <HermesPerformanceBubble cue={cue} onDismiss={() => undefined} visible />,
    );

    expect(html.match(/<p>/gu)).toHaveLength(1);
    expect(html).not.toContain('hermes-companion-actions');
    expect(html).not.toContain('hermes-companion-take-me');
  });
});
