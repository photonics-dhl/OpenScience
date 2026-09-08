'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import { getVersionEvidenceSource, listVersionClaims, listVersionEvidence, verifyVersionEvidence, type HermesResearchRun, type PresentationClaim, type VersionEvidence } from '@/lib/api';

export function scopeWorkflowClaimReview(sourceClaimIds: string[], claims: PresentationClaim[], evidence: VersionEvidence[]) {
  const scopedClaims = claims.filter((claim) => sourceClaimIds.includes(claim.id));
  if (scopedClaims.length !== sourceClaimIds.length) throw new Error('Missing workflow claim');
  return { claims: scopedClaims, evidence: evidence.filter((row) => sourceClaimIds.includes(row.claimId)) };
}

export function HermesClaimEvidenceReview({ researchObjectId, run, onDone }: { researchObjectId: string; run: HermesResearchRun; onDone(): void }) {
  const t = useTranslations('hermesRun');
  const [evidence, setEvidence] = React.useState<VersionEvidence[]>([]);
  const [claims, setClaims] = React.useState<PresentationClaim[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [sourceRowId, setSourceRowId] = React.useState('');
  const [sourceText, setSourceText] = React.useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = React.useState(false);
  const versionId = run.versionId ?? '';
  React.useEffect(() => {
    if (!versionId) return;
    const controller = new AbortController();
    void Promise.all([listVersionClaims(researchObjectId, versionId, controller.signal), listVersionEvidence(researchObjectId, versionId, controller.signal)]).then(([claimResult, evidenceResult]) => {
      if (controller.signal.aborted) return;
      const scoped = scopeWorkflowClaimReview(run.sourceClaimIds, claimResult.claims, evidenceResult.evidence);
      setClaims(scoped.claims);
      setEvidence(scoped.evidence);
    }).catch(() => { if (!controller.signal.aborted) setError(t('claimLoadError')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [researchObjectId, run.sourceClaimIds, t, versionId]);
  async function verify(row: VersionEvidence) {
    if (!versionId || busy || loading || error) return;
    setBusy(row.id); setError('');
    try {
      const result = await verifyVersionEvidence(researchObjectId, versionId, row.id, row.updatedAt);
      setEvidence((current) => current.map((item) => item.id === row.id ? result.evidence : item));
    } catch { setError(t('claimVerifyError')); }
    finally { setBusy(''); }
  }
  async function viewSource(row: VersionEvidence) {
    if (!versionId || sourceLoading) return;
    setSourceRowId(row.id); setSourceText(null); setSourceLoading(true); setError('');
    try {
      const result = await getVersionEvidenceSource(researchObjectId, versionId, row.id);
      setSourceText(result.source.text ?? null);
    } catch { setError(t('claimSourceError')); }
    finally { setSourceLoading(false); }
  }
  const pending = evidence.filter((row) => !row.verifiedByUserId);
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  return <section className="surface-folio-sheet mt-7 max-w-3xl border-y border-os-rule-paper px-5 py-6" aria-labelledby="hermes-claim-review-title">
    <p data-reading-role="caption" className="text-os-vermilion-ink">Hermes</p><h2 id="hermes-claim-review-title" className="mt-2 text-2xl font-medium">{t('claimReviewTitle')}</h2>
    <p className="mt-3 text-sm leading-6 text-os-muted-paper">{t('claimReviewDescription')}</p>
    {loading ? <p role="status" className="mt-4 text-os-muted-paper">{t('loading')}</p> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-os-vermilion-ink">{error}</p> : null}
    {evidence.map((row) => {
      const claim = claimsById.get(row.claimId);
      return <article key={row.id} className="mt-4 border-t border-os-rule-paper pt-4">
        <p data-reading-role="caption" className="text-os-vermilion-ink">{t('claimStatement')}</p>
        <p className="mt-1 font-semibold leading-6">{claim?.statement}</p>
        {claim?.conditions.length ? <p className="mt-2 text-sm leading-6 text-os-muted-paper"><span className="font-semibold text-os-ink">{t('claimConditions')}:</span> {claim.conditions.join('; ')}</p> : null}
        {claim?.limitations.length ? <p className="mt-2 text-sm leading-6 text-os-muted-paper"><span className="font-semibold text-os-ink">{t('claimLimitations')}:</span> {claim.limitations.join('; ')}</p> : null}
        <p className="mt-4 font-semibold">{row.title}</p>
        {row.exactQuote ? <blockquote className="mt-2 border-l-2 border-os-rule-paper pl-3 text-sm leading-6">{row.exactQuote}</blockquote> : null}
        <p className="mt-2 text-sm text-os-muted-paper">{row.locator.page ? t('sourcePage', { page: row.locator.page }) : t('sourceLocation')}</p>
        <button type="button" disabled={sourceLoading} onClick={() => void viewSource(row)} className="mt-2 min-h-11 text-sm font-semibold text-os-vermilion-ink underline disabled:opacity-40">{sourceLoading && sourceRowId === row.id ? t('loadingSource') : t('viewSource')}</button>
        {sourceRowId === row.id && !sourceLoading ? sourceText ? <blockquote className="mt-2 border-l-2 border-os-rule-paper pl-3 text-sm leading-6">{sourceText}</blockquote> : <p className="mt-2 text-sm text-os-muted-paper">{t('claimSourceUnavailable')}</p> : null}
        {row.verifiedByUserId ? <p className="mt-3 text-sm text-os-muted-paper">{t('evidenceVerified')}</p> : <button type="button" disabled={Boolean(busy) || loading || Boolean(error)} onClick={() => void verify(row)} className="mt-3 min-h-11 rounded-panel border border-os-vermilion-ink px-4 py-2 text-sm font-semibold text-os-vermilion-ink disabled:opacity-40">{busy === row.id ? t('verifying') : t('verifyEvidence')}</button>}
      </article>;
    })}
    {!loading && !evidence.length ? <p className="mt-4 text-sm text-os-muted-paper">{t('claimReviewEmpty')}</p> : null}
    {!loading && !pending.length && evidence.length ? <button type="button" onClick={onDone} className="mt-5 min-h-11 font-semibold text-os-vermilion-ink underline">{t('returnToRun')}</button> : null}
  </section>;
}
