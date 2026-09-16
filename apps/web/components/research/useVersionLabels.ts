'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { VersionSummary } from '@/lib/api';

type LabeledVersion = Pick<VersionSummary, 'publicationNo' | 'createdAt' | 'commitMessage'>;

export function useVersionLabels() {
  const t = useTranslations('editHistory');
  const locale = useLocale();
  const date = (value: string | null | undefined) => {
    if (!value || !Number.isFinite(Date.parse(value))) return t('dateUnavailable');
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  };
  const summary = (value: string | null | undefined) => {
    const text = value?.trim();
    if (!text || /^(?:Draft revision|草稿修订)\s*\d+$/u.test(text) || text === 'Draft saved' || text === '草稿已保存') return t('savedDraft');
    // ingestion-service emits this prefix; the original source stays accessible in the record.
    if (/^Confirm import: [^\r\n]+$/u.test(text)) return t('importConfirmed');
    // Current and previous files.defaultCommit defaults; never strip IDs from arbitrary user summaries.
    if (['Attach evidence', '绑定证据', 'Add research materials', '添加研究材料'].includes(text)) return t('materialsAdded');
    // Older assistant-created summaries appended a source-note ID for internal traceability.
    // Hide only that explicit suffix; preserve the user's summary and all stored metadata.
    return (value ?? '').replace(/；来源科研笔记\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}。?$/iu, '。');
  };
  const label = (version: LabeledVersion) => version.publicationNo != null
    ? t('publicVersion', { number: version.publicationNo })
    : `${date(version.createdAt)} · ${summary(version.commitMessage)}`;
  return { date, summary, label };
}
