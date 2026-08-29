'use client';

import { Maximize2, Minimize2, Settings2, VolumeX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export type HermesPresenceMode = 'original' | 'compact' | 'quiet';

export function HermesPresenceControl({ mode, onChange }: {
  mode: HermesPresenceMode;
  onChange: (mode: HermesPresenceMode) => void;
}) {
  const t = useTranslations('hermesCompanion.presenceControl');
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  const summaryRef = React.useRef<HTMLElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const choices = [
    { icon: Maximize2, key: 'original' as const },
    { icon: Minimize2, key: 'compact' as const },
    { icon: VolumeX, key: 'quiet' as const },
  ];

  return (
    <details className="hermes-presence-control" data-hermes-presence-control="true" ref={detailsRef}>
      <summary aria-label={t('label')} ref={summaryRef} title={t('label')}>
        <Settings2 aria-hidden="true" size={16} />
      </summary>
      <div
        aria-label={t('label')}
        className="hermes-presence-options"
        onKeyDown={(event) => {
          const current = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
          if (event.key === 'Escape') {
            event.preventDefault();
            detailsRef.current?.removeAttribute('open');
            summaryRef.current?.focus();
            return;
          }
          const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1
            : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
          if (!direction && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
            : (current + direction + choices.length) % choices.length;
          optionRefs.current[next]?.focus();
        }}
        role="menu"
      >
        {choices.map(({ icon: Icon, key }, index) => (
          <button
            aria-checked={mode === key}
            key={key}
            onClick={() => {
              onChange(key);
              detailsRef.current?.removeAttribute('open');
              window.requestAnimationFrame(() => summaryRef.current?.focus());
            }}
            ref={(node) => { optionRefs.current[index] = node; }}
            role="menuitemradio"
            type="button"
          >
            <Icon aria-hidden="true" size={16} />
            <span>{t(key)}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
