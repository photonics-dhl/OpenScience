'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { DashboardTaskApi, IngestionTaskDetail } from '@/lib/api';

interface Props { researchObjectId: string; researchTitle?: string; tasks: DashboardTaskApi[]; loading: boolean; error: string; onRetry: () => void }

export function HermesTaskEntry({ researchObjectId, researchTitle, tasks, loading, error, onRetry }: Props) {
  const t = useTranslations('hermesReview');
  const status = useTranslations('ingestion.status');
  const base = `/research-objects/${encodeURIComponent(researchObjectId)}`;
  const currentTasks = tasks.filter((task) => task.researchObjectId === researchObjectId);
  return <section className="max-w-3xl" aria-labelledby="hermes-entry-title">
    <header className="border-l-2 border-os-vermilion-ink pl-5">
      <p data-reading-role="caption" className="text-os-vermilion-ink">Hermes</p>
      <h1 id="hermes-entry-title" className="mt-2 font-reading text-4xl font-normal">{t('entryTitle')}</h1>
      {researchTitle && <p className="mt-3 break-words font-semibold">{researchTitle}</p>}
      <p className="mt-3 leading-7 text-os-muted-paper">{t('entryDescription')}</p>
    </header>
    <nav aria-label={t('entryActions')} className="my-6 flex flex-wrap gap-3">
      <Link className="inline-flex min-h-11 items-center rounded-panel bg-os-vermilion-ink px-4 py-2 font-semibold text-white" href={`${base}/edit`}>{t('continueEditing')}</Link>
      <Link className="inline-flex min-h-11 items-center rounded-panel border border-os-rule-paper px-4 py-2 font-semibold text-os-ink no-underline hover:bg-os-paper-strong" href={`${base}/files`}>{t('openFiles')}</Link>
    </nav>
    {error ? <div className="border-l-2 border-red-700 bg-red-50 p-4 text-red-900"><p role="alert">{error}</p><button type="button" className="mt-2 min-h-11 font-semibold underline" onClick={onRetry}>{t('retry')}</button></div>
      : loading ? <p role="status" className="py-6 text-os-muted-paper">{t('loading')}</p>
        : currentTasks.length === 0 ? <p className="border-y border-os-rule-paper py-6 leading-7 text-os-muted-paper">{t('entryEmpty')}</p>
          : <ul className="divide-y divide-os-rule-paper border-y border-os-rule-paper">{currentTasks.map((task) => <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div className="min-w-0"><p className="break-words font-semibold">{task.logicalPath}</p><p className="mt-1 text-sm text-os-muted-paper">{status(task.state)}</p></div>
            <Link className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink hover:underline" aria-label={`${t(task.state === 'needs_review' ? 'reviewTask' : 'openFiles')}: ${task.logicalPath}`} href={task.state === 'needs_review' ? `${base}/hermes?task=${encodeURIComponent(task.id)}` : `${base}/files`}>{t(task.state === 'needs_review' ? 'reviewTask' : 'openFiles')}</Link>
          </li>)}</ul>}
  </section>;
}

export async function loadScopedHermesReview(researchObjectId: string, taskId: string, load: (id: string) => Promise<IngestionTaskDetail>): Promise<IngestionTaskDetail> {
  const detail = await load(taskId);
  if (detail.researchObjectId !== researchObjectId || detail.task.id !== taskId) throw new Error('HERMES_TASK_SCOPE_MISMATCH');
  return detail;
}
