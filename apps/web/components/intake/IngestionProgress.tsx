import * as React from 'react';
import { useTranslations } from 'next-intl';

import type { IntakeMaterialStatus } from './intake-model';

const STAGES = ['scan', 'upload', 'parse', 'map', 'review'] as const;

function currentStage(status: IntakeMaterialStatus): (typeof STAGES)[number] {
  if (status === 'local' || status === 'failed_blocked') return 'scan';
  if (status === 'uploading') return 'upload';
  if (status === 'queued' || status === 'stored' || status === 'parsing' || status === 'failed_retryable') return 'parse';
  if (status === 'needs_review') return 'review';
  return 'review';
}

export function IngestionProgress({ status, progress }: { status: IntakeMaterialStatus; progress: number }) {
  const t = useTranslations('ingestion.intake');
  const active = currentStage(status);
  const activeIndex = STAGES.indexOf(active);
  return (
    <div data-current-stage={active}>
      <div
        aria-label={t('progressLabel')}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress}
        className="h-px bg-os-rule-paper"
        role="progressbar"
      >
        <span className="block h-px bg-os-vermilion-ink transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>
      <ol className="mt-2 grid grid-cols-5 gap-2 text-xs text-os-muted-paper">
        {STAGES.map((stage, index) => (
          <li className={index <= activeIndex ? 'font-medium text-os-ink' : undefined} key={stage}>{t(`stage.${stage}`)}</li>
        ))}
      </ol>
    </div>
  );
}
