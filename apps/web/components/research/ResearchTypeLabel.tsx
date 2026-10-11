'use client';

import { useTranslations } from 'next-intl';

/** User-supplied publication context, distinct from verified source identity. */
export function ResearchTypeLabel({ core }: { core: object }) {
  const t = useTranslations('services.researchTypes');
  const values = core as Record<string, unknown>;
  if (values.researchType !== 'published' && values.researchType !== 'preprint') return null;
  const metadata = ['originalAuthors', 'originalJournal', 'originalDoi']
    .map(key => typeof values[key] === 'string' ? values[key] as string : '').filter(Boolean);
  return <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" data-research-type={values.researchType}>
    <span className="rounded-control bg-[#e7f1f2] px-2 py-1 text-xs font-medium text-[#125d66]">{t(values.researchType)}</span>
    {values.researchType === 'published' && metadata.length > 0 ? <span className="break-words text-os-muted-paper">{t('originalDetails')} {metadata.join(' · ')}</span> : null}
  </span>;
}
