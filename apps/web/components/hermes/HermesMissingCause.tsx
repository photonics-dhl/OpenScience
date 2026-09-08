'use client';

import { useTranslations } from 'next-intl';
import type { SdfCore } from '@/lib/api';

export const HERMES_MISSING_CAUSES = [
  'not_selected',
  'model_no_supported_summary',
  'validation_rejected',
  'undetermined',
] as const;

export type HermesMissingCauseCode = typeof HERMES_MISSING_CAUSES[number];
type SdfField = keyof SdfCore;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getHermesMissingCause(result: unknown, field: SdfField): HermesMissingCauseCode | null {
  if (!isRecord(result) || !isRecord(result.missingDetails)) return null;
  const detail = result.missingDetails[field];
  if (!isRecord(detail) || typeof detail.cause !== 'string') return null;
  return HERMES_MISSING_CAUSES.includes(detail.cause as HermesMissingCauseCode)
    ? detail.cause as HermesMissingCauseCode
    : null;
}

export function HermesMissingCause({ field, result }: { field: SdfField; result: unknown }) {
  const t = useTranslations('hermesReview.missingCause');
  const cause = getHermesMissingCause(result, field);
  if (!cause) return null;
  return <span className="mt-1 block text-xs leading-5 text-os-muted-paper" data-hermes-missing-cause={cause}>{t(cause)}</span>;
}
