'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useTranslations('public');
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    window.setTimeout(() => setStatus('idle'), 2000);
  };
  return <button type="button" onClick={handleCopy} className="copy-btn" title={label ?? t('copy')} aria-live="polite">
    {status === 'copied' ? t('copied') : status === 'failed' ? t('copyFailed') : t('copy')}
  </button>;
}

export function ProvenanceCaption({ label, value, landmark }: { label: string; value: string; landmark?: 'citation' | 'provenance' }) {
  return <p className="pub-provenance-caption" data-print-landmark={landmark}>
    <span>{label}</span><code>{value}</code>
  </p>;
}
