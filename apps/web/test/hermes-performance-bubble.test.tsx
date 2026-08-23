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

describe('Hermes performance bubble', () => {
  it('renders one synchronized polite annotation for the active performance beat', () => {
    const html = renderToStaticMarkup(
      <HermesPerformanceBubble cue={cue} onDismiss={() => undefined} visible />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-hidden="false"');
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
});
