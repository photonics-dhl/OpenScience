'use client';

import { useTranslations } from 'next-intl';

import { BeforeAfterProposal } from '@/components/research/BeforeAfterProposal';
import { EvidenceSnippet } from '@/components/research/EvidenceSnippet';
import type { AiSuggestion } from '../../lib/suggestions';

export default function SuggestionsPanel({
  suggestions,
  onApply,
  onDismiss,
  onExtract,
  extracting,
  extractProgress,
  extractError,
}: {
  suggestions: AiSuggestion[];
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
  onExtract?: () => void;
  extracting?: boolean;
  extractProgress?: number;
  extractError?: string | null;
}) {
  const t = useTranslations('editor');

  return (
    <section aria-label={t('suggestions')}>
      <div className="flex items-end justify-between border-b border-os-rule-dark pb-3">
        <div>
          <p className="m-0 font-data text-[10px] uppercase tracking-[0.15em] text-os-muted-dark">{t('hermesEvidenceLabel')}</p>
          <h2 className="mb-0 mt-2 font-editorial text-2xl font-normal text-os-paper">{t('suggestions')}</h2>
        </div>
        {onExtract && (
          <button className="min-h-10 rounded-panel border border-os-rule-dark bg-transparent px-3 text-xs text-os-paper" data-extract-sdf="true" onClick={onExtract} disabled={extracting}>
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
      {suggestions.length === 0 && <p className="border-b border-os-rule-dark py-6 text-sm leading-6 text-os-muted-dark">{t('noSuggestions')}</p>}
      {suggestions.map((suggestion) => (
        <BeforeAfterProposal
          after={suggestion.suggestion}
          before={suggestion.before}
          key={suggestion.id}
          onDismiss={() => onDismiss(suggestion.id)}
          onReview={() => onApply(suggestion.id)}
          risk={suggestion.risk}
          scope={`SDF / ${t(suggestion.field)}`}
          source={`${suggestion.sourceLocator ?? (suggestion.sourceContext === 'sdf_aggregate' ? t('currentSdfAggregate') : t('sourceLocatorUnavailable'))} · ${suggestion.source === 'extractor' ? t('hermesExtractor') : t('researcherPrompt')}`}
          status={suggestion.status}
        />
      ))}
      <div className="mt-8 space-y-3">
        <EvidenceSnippet label={t('references')} source={t('evidencePending')}>
          {t('evidencePendingDescription')}
        </EvidenceSnippet>
        <EvidenceSnippet label={t('review')} source={t('reviewPending')}>
          {t('reviewPendingDescription')}
        </EvidenceSnippet>
      </div>
    </section>
  );
}
