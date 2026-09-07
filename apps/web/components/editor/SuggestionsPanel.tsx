'use client';

import { useTranslations } from 'next-intl';

import { BeforeAfterProposal } from '@/components/research/BeforeAfterProposal';
import type { SuggestionEvidenceLocation } from '../../lib/suggestion-evidence';
import type { AiSuggestion, SdfField } from '../../lib/suggestions';
import styles from './editor.module.css';

function evidenceLocationLabel(t: ReturnType<typeof useTranslations>, location: SuggestionEvidenceLocation) {
  const labels = {
    located: 'evidenceLocationLocated',
    ambiguous: 'evidenceLocationAmbiguous',
    cross_block: 'evidenceLocationCrossBlock',
    missing: 'evidenceLocationMissing',
    unverified: 'evidenceLocationUnverified',
  } as const;
  const detail = location.status === 'located'
    ? [
      location.page === undefined ? null : t('evidenceLocationPage', { page: location.page }),
      t('evidenceLocationBlock', { blockId: location.blockId }),
    ].filter(Boolean).join(' · ')
    : null;
  return detail ? `${t(labels[location.status])} · ${detail}` : t(labels[location.status]);
}

export default function SuggestionsPanel({
  suggestions,
  onApply,
  onDismiss,
  onExtract,
  extracting,
  extractProgress,
  extractError,
  missingFields,
  onAcknowledgeMissing,
}: {
  suggestions: AiSuggestion[];
  onApply: (id: string, value: string) => void;
  onDismiss: (id: string) => void;
  missingFields: SdfField[];
  onAcknowledgeMissing: (field: SdfField) => void;
  onExtract?: () => void;
  extracting?: boolean;
  extractProgress?: number;
  extractError?: string | null;
}) {
  const t = useTranslations('editor');

  return (
    <section aria-label={t('suggestions')} className={styles.suggestions}>
      <div className="flex items-end justify-between border-b border-os-rule-dark pb-3">
        <div>
          <p data-reading-role="caption" className="m-0 font-data uppercase tracking-[0.1em] text-os-muted-dark">{t('hermesEvidenceLabel')}</p>
          <h2 className="mb-0 mt-2 font-editorial text-2xl font-normal text-os-paper">{t('suggestions')}</h2>
        </div>
        {onExtract && (
          <button className="min-h-10 rounded-panel border border-os-rule-dark bg-transparent px-3 text-sm text-os-paper" data-extract-sdf="true" data-reading-role="control" onClick={onExtract} disabled={extracting}>
            {extracting ? t('extracting') : t('extract')}
          </button>
        )}
      </div>
      {extracting && extractProgress !== undefined && (
        <div className="mt-4 h-1 bg-os-rule-dark" role="progressbar" aria-valuenow={extractProgress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-os-paper transition-[width] motion-reduce:transition-none" style={{ width: `${extractProgress}%` }} />
        </div>
      )}
      {extractError && <div className="mt-4 border-l-2 border-os-vermilion pl-3 text-sm text-os-paper" role="alert">{extractError}</div>}
      {missingFields.map((field) => (
        <article className="mt-4 border-l-2 border-os-vermilion bg-os-black-1 p-4" data-missing-evidence={field} key={field}>
          <p className="m-0 font-data text-xs uppercase tracking-[0.1em] text-os-vermilion">{t('missingEvidenceTitle', { field: t(field) })}</p>
          <p data-reading-role="body" className="mb-0 mt-2 text-base leading-[var(--leading-body)] text-os-paper">
            {field === 'results' ? t('missingResultsEvidence') : t('missingEvidenceDescription', { field: t(field) })}
          </p>
          <button className="mt-3 min-h-10 rounded-panel border border-os-rule-dark bg-transparent px-3 text-sm text-os-paper" onClick={() => onAcknowledgeMissing(field)}>{t('acknowledgeMissingEvidence')}</button>
        </article>
      ))}
      {suggestions.length === 0 && !extracting && <p data-reading-role="body" className={styles.guide}>{t('suggestionsGuide')}</p>}
      {suggestions.map((suggestion) => {
        const evidenceLocation = suggestion.source === 'extractor'
          ? suggestion.evidenceLocation ?? { status: 'unverified' as const }
          : undefined;
        return (
          <div key={suggestion.id}>
          {evidenceLocation && (
            <div className="mt-4 border-l-2 border-os-rule-dark pl-4" data-suggestion-evidence-location={evidenceLocation.status}>
              <p className="m-0 font-data text-xs uppercase tracking-[0.08em] text-os-muted-dark">{evidenceLocationLabel(t, evidenceLocation)}</p>
              {suggestion.evidence?.quote && <blockquote className="mb-0 mt-2 text-base leading-[var(--leading-body)] text-os-paper" data-suggestion-evidence-quote="true">{suggestion.evidence.quote}</blockquote>}
              <p className="mb-0 mt-2 text-sm leading-[var(--leading-body)] text-os-muted-dark">{t('evidenceLocationNotice')}</p>
            </div>
          )}
          <BeforeAfterProposal
            after={suggestion.suggestion}
            before={suggestion.before}
            evidenceLocator={suggestion.source === 'manual' ? suggestion.evidence?.locator : undefined}
            evidenceQuote={suggestion.source === 'manual' ? suggestion.evidence?.quote : undefined}
            key={suggestion.id}
            onDismiss={() => onDismiss(suggestion.id)}
            onReview={(value) => onApply(suggestion.id, value)}
            risk={suggestion.risk}
            scope={`SDF / ${t(suggestion.field)}`}
            source={`${suggestion.source === 'manual' && suggestion.sourceLocator
              ? suggestion.sourceLocator
              : suggestion.sourceContext === 'sdf_aggregate'
                ? t('currentSdfAggregate')
                : t('sourceLocatorUnavailable')} · ${suggestion.source === 'extractor' ? t('hermesExtractor') : t('researcherPrompt')}`}
            status={suggestion.status}
          />
        </div>
        );
      })}
    </section>
  );
}
