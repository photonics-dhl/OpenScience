'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { PublicEvidence, PublicEvidenceSource } from '../../lib/api';

export function EvidenceSourceBody({ evidence, source, loading, error }: { evidence: PublicEvidence | null; source: PublicEvidenceSource | null; loading: boolean; error: boolean }) {
  const t = useTranslations('public.claimReader');
  if (!evidence) return <p className="pub-rail-muted">{t('selectEvidence')}</p>;
  return <>
    <p className="pub-evidence-relation">{t(`relation.${evidence.relation}`)}</p>
    <h3>{evidence.title}</h3>
    {loading && <p aria-live="polite">{t('loadingSource')}</p>}
    {error && <p role="alert">{t('sourceUnavailable')}</p>}
    {source && <div className="pub-source-record">
      <blockquote>{source.text}</blockquote>
      {source.region && <figure className="pub-source-region" data-source-region="normalized" aria-label={t('sourceRegion')}>
        <span style={{ left: `${source.region.x * 100}%`, top: `${source.region.y * 100}%`, width: `${source.region.width * 100}%`, height: `${source.region.height * 100}%` }} />
        <figcaption>{t('sourceRegion')}</figcaption>
      </figure>}
      <dl>
        <div><dt>{t('sourceFile')}</dt><dd>{source.artifact.logicalPath}</dd></div>
        {source.page !== null && <div><dt>{t('sourcePage')}</dt><dd>{source.page}</dd></div>}
        {Object.entries(source.locator).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'string' || typeof value === 'number' ? value : JSON.stringify(value)}</dd></div>)}
      </dl>
    </div>}
  </>;
}

export function EvidenceRail({ evidence, source, loading, error }: { evidence: PublicEvidence | null; source: PublicEvidenceSource | null; loading: boolean; error: boolean }) {
  const t = useTranslations('public.claimReader');
  return <aside className="pub-evidence-rail" data-evidence-rail="true" aria-label={t('sourceInspector')}>
    <p className="pub-rail-label">{t('sourceInspector')}</p>
    <EvidenceSourceBody evidence={evidence} source={source} loading={loading} error={error} />
  </aside>;
}
