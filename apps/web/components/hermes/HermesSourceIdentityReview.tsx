'use client';

import { useTranslations } from 'next-intl';
import type { SourceIdentityField, SourceIdentityProposal, SourceIdentitySnapshot } from '@/lib/api';

const fields: SourceIdentityField[] = ['title', 'authors', 'doi', 'articleLicense'];

export function HermesSourceIdentityReview({ proposal, acceptedFields, disabled, onToggle }: {
  proposal: SourceIdentityProposal | SourceIdentitySnapshot;
  acceptedFields: SourceIdentityField[];
  disabled: boolean;
  onToggle: (field: SourceIdentityField, accepted: boolean) => void;
}) {
  const t = useTranslations('hermesReview');
  return <section className="mt-7 border-y border-os-rule-paper bg-os-paper-strong px-4 py-6 sm:px-6" aria-labelledby="source-identity-title" data-source-identity-review>
    <h2 id="source-identity-title" className="font-reading text-2xl text-os-ink">{t('sourceIdentityTitle')}</h2>
    <p className="mt-2 max-w-[68ch] text-sm leading-6 text-os-muted-paper">{t('sourceIdentityDescription')}</p>
    <div className="mt-5 divide-y divide-os-rule-paper">
      {fields.map((field) => {
        const item = proposal[field];
        const accepted = acceptedFields.includes(field);
        const value = Array.isArray(item.value) ? item.value.join('; ') : item.value;
        return <div key={field} className="py-5" data-source-identity-field={field} data-source-identity-state={item.state}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-os-ink">{t(`sourceIdentityField.${field}`)}</h3>
              <p className="mt-1 break-words font-reading text-base text-os-ink">{value || t('sourceIdentityEmpty')}</p>
              <p className="mt-1 text-xs text-os-muted-paper">{t(`sourceIdentityState.${item.state}`)}</p>
            </div>
            {item.state === 'proposed' ? <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-os-ink">
              <input type="checkbox" checked={accepted} disabled={disabled} onChange={(event) => onToggle(field, event.target.checked)} />
              {t('sourceIdentityAccept')}
            </label> : null}
          </div>
          {item.evidenceSegments.length ? <div className="mt-4 space-y-3">
            {item.evidenceSegments.map((segment, index) => <blockquote key={`${segment.sourceLocator.blockId}:${segment.sourceLocator.charRange.start}:${index}`} className="border-l-2 border-os-vermilion-ink pl-4 text-sm leading-6 text-os-muted-paper">
              <p className="whitespace-pre-wrap">{segment.quote}</p>
              <p className="mt-1 font-data text-xs">{t('sourceIdentityPage', { page: segment.sourceLocator.page })}</p>
            </blockquote>)}
            <a className="inline-flex min-h-11 items-center text-sm font-semibold text-os-vermilion-ink underline" href={`/api/artifacts/${encodeURIComponent(item.evidenceSegments[0].sourceLocator.artifactId)}/download`} target="_blank" rel="noreferrer">{t('sourceIdentityOpenPdf')}</a>
          </div> : <p className="mt-3 text-sm text-os-muted-paper">{t('sourceIdentityNoEvidence')}</p>}
        </div>;
      })}
    </div>
  </section>;
}
