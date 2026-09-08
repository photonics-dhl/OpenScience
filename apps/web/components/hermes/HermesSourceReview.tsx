'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import { listVersions, type HermesResearchRun, type VersionSummary } from '@/lib/api';
import { IngestionClaimReview } from './IngestionClaimReview';

export function HermesSourceReview({ researchObjectId, run, onSubmitted }: { researchObjectId: string; run: HermesResearchRun; onSubmitted(): void }) {
  const t = useTranslations('hermesRun');
  const [versions, setVersions] = React.useState<VersionSummary[]>([]);
  const [versionId, setVersionId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    const controller = new AbortController();
    void listVersions(researchObjectId).then((result) => {
      if (controller.signal.aborted) return;
      const drafts = result.versions.filter((version) => version.status === 'draft');
      setVersions(drafts);
      setVersionId(drafts[0]?.versionId ?? '');
    }).catch(() => { if (!controller.signal.aborted) setError(t('versionLoadError')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [researchObjectId, t]);
  if (loading) return <p role="status" className="mt-5 text-os-muted-paper">{t('loadingVersions')}</p>;
  if (error) return <p role="alert" className="mt-5 text-sm text-os-vermilion-ink">{error}</p>;
  if (!versions.length) return <p className="mt-5 border-l-2 border-os-rule-paper pl-4 text-sm leading-6 text-os-muted-paper">{t('noDraftVersion')}</p>;
  return <section className="mt-6 max-w-3xl" aria-label={t('sourceReviewSection')}>
    <label className="grid max-w-lg gap-2 text-sm font-semibold text-os-ink">{t('versionLabel')}
      <select className="min-h-11 rounded-panel border border-os-rule-paper bg-os-paper px-3 font-normal" value={versionId} onChange={(event) => setVersionId(event.target.value)}>
        {versions.map((version) => <option key={version.versionId} value={version.versionId}>{t('versionOption', { number: version.versionNo })}</option>)}
      </select>
    </label>
    {versionId ? <IngestionClaimReview researchObjectId={researchObjectId} versionId={versionId} onComplete={() => {}} sourceReview={{ runId: run.id, expectedVersion: run.version, ingestionTaskIds: run.steps.flatMap((step) => step.ingestionTaskId ? [step.ingestionTaskId] : []), onSubmitted }} /> : null}
  </section>;
}
