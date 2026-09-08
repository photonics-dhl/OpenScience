'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import type { HermesResearchRun, IngestionConfirmation } from '@/lib/api';
import { IngestionClaimReview } from './IngestionClaimReview';

export function HermesSourceReview({ researchObjectId, run, confirmation, onSubmitted }: { researchObjectId: string; run: HermesResearchRun; confirmation: IngestionConfirmation; onSubmitted(): void }) {
  const t = useTranslations('hermesRun');
  return <section className="mt-6 max-w-3xl" aria-label={t('sourceReviewSection')}>
    <p className="text-sm leading-6 text-os-muted-paper">{t('confirmedVersion', { number: confirmation.versionNo })}</p>
    <IngestionClaimReview researchObjectId={researchObjectId} versionId={confirmation.versionId} onComplete={() => {}} sourceReview={{ runId: run.id, expectedVersion: run.version, ingestionTaskIds: run.steps.flatMap((step) => step.ingestionTaskId ? [step.ingestionTaskId] : []), onSubmitted }} />
  </section>;
}
