'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { loadHermesMotionPreference, saveHermesMotionPreference } from '@/lib/hermes/motion-preference';

export function MotionPreferenceControl() {
  const t = useTranslations('myAccount');
  const [preference, setPreference] = useState<'system' | 'full' | 'reduced'>('system');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    try { setPreference(loadHermesMotionPreference(window.localStorage) ?? 'system'); } catch { setFailed(true); }
  }, []);
  return <div className="mt-6 border-t border-os-rule-paper pt-4">
    <label className="grid gap-2 text-sm text-os-ink">{t('motionTitle')}
      <select className="min-h-11 rounded-control border border-os-rule-paper bg-transparent px-3" value={preference} onChange={(event) => {
        const next = event.target.value as 'system' | 'full' | 'reduced';
        try {
          if (next === 'system') window.localStorage.removeItem('openscience.hermes.motion');
          else saveHermesMotionPreference(window.localStorage, next);
          setPreference(next); setFailed(false);
          window.dispatchEvent(new Event('openscience:motion-preference'));
        } catch { setFailed(true); }
      }}>
        <option value="system">{t('motionSystem')}</option><option value="reduced">{t('motionReduced')}</option><option value="full">{t('motionFull')}</option>
      </select>
    </label>
    <p className="mt-2 text-sm text-os-muted-paper">{t('motionScope')}</p>
    {failed ? <p role="alert" className="mt-2 text-sm text-os-vermilion-ink">{t('motionError')}</p> : null}
  </div>;
}
