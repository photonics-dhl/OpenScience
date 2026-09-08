'use client';

import { useTranslations } from 'next-intl';
import { getSuggestionEvidenceLocation, getSuggestionEvidenceSegments } from '@/lib/suggestion-evidence';

/** Read-only provenance beside the editable SDF proposal. */
export function HermesExtractionEvidence({ field, result }: { field: string; result: unknown }) {
  const t = useTranslations('ingestionClaimReview');
  const segments = getSuggestionEvidenceSegments(field, result);
  const raw = result && typeof result === 'object' ? (result as { evidence?: Record<string, { quote?: unknown }> }).evidence?.[field]?.quote : undefined;
  const location = getSuggestionEvidenceLocation(field, raw, result);
  const sources = segments.length ? segments : location.status === 'located' && typeof raw === 'string' ? [{ quote: raw, location }] : [];
  return <details className="mt-2 text-sm" data-hermes-source-evidence={field}>
    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-os-vermilion-ink">{t('reviewEvidence')}</summary>
    <p className="leading-6 text-os-muted-paper">{t('evidenceNotice')}</p>
    {sources.length ? <ol className="space-y-3 pl-5">{sources.map((source, index) => <li key={index}>
      <p className="text-xs text-os-muted-paper">{source.location.page ? t('page', { page: source.location.page }) : t('sourceLocated')}</p>
      <blockquote className="m-0 whitespace-pre-wrap break-words border-l-2 border-os-rule-paper pl-3 leading-6 text-os-ink">{source.quote}</blockquote>
    </li>)}</ol> : <p>{t('noQuote')}</p>}
  </details>;
}
