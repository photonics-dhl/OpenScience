'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

export function EvidenceReadingPreferenceControl({
  busy,
  checked,
  onChange,
  status,
}: {
  busy: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  status: 'idle' | 'saved' | 'conflict' | 'error';
}) {
  const t = useTranslations('productSurfaces.settings');
  return <div className="mt-5 border-y border-os-rule-paper py-4" data-evidence-reading-preference="true">
    <label className="flex cursor-pointer items-start justify-between gap-5 text-base">
      <span>
        <strong className="block font-medium text-os-ink">{t('evidenceCollapsed')}</strong>
        <span className="mt-1 block text-sm leading-6 text-os-muted-paper">{t('evidenceCollapsedHint')}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 accent-os-vermilion"
        checked={checked}
        disabled={busy}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
    <p className="mt-2 min-h-5 text-sm text-os-muted-paper" aria-live="polite">
      {status === 'saved' ? t('preferenceSaved') : status === 'conflict' ? t('preferenceConflict') : status === 'error' ? t('preferenceError') : ''}
    </p>
  </div>;
}

