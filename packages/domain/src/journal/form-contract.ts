/** Browser-safe journal onboarding rules shared with the domain write paths. */
export const JOURNAL_SERVICE_OPTIONS = [
  { value: 'AI 标准解读包', key: 'ai' },
  { value: '批量导入与材料整理', key: 'import' },
  { value: '持续运营与基础统计', key: 'operations' },
] as const;

export const JOURNAL_ENGLISH_FIELDS = [
  'nameEn', 'publisherName', 'sponsorName', 'description',
  'applicantName', 'applicantTitle', 'representationEvidence',
] as const;
export type JournalEnglishField = typeof JOURNAL_ENGLISH_FIELDS[number] | 'subjects';
export type JournalEnglishMetadata = Partial<Record<typeof JOURNAL_ENGLISH_FIELDS[number], string | null>> & { subjects?: string[] | null };
export const JOURNAL_HOMEPAGE_REQUIRED_FIELDS: readonly JournalEnglishField[] = ['nameEn', 'publisherName', 'subjects'];
export const JOURNAL_APPLICATION_REQUIRED_FIELDS: readonly JournalEnglishField[] = [
  ...JOURNAL_HOMEPAGE_REQUIRED_FIELDS, 'description', 'applicantName', 'applicantTitle', 'representationEvidence',
];

/** Checks script, not natural language; staff still verify official English names.
 * Accented Latin names, initials, punctuation, numbers and symbols are accepted.
 */
export function isEnglishJournalText(value: string): boolean {
  return /\p{Script=Latin}/u.test(value)
    && !/[^\p{Script=Latin}\p{Mark}\p{Number}\p{Punctuation}\p{Symbol}\p{Separator}\s]/u.test(value);
}

export function journalEnglishMetadataIssues(
  input: JournalEnglishMetadata,
  requiredFields: readonly JournalEnglishField[] = [],
): Array<{ field: JournalEnglishField; reason: 'required' | 'english' }> {
  const issues: Array<{ field: JournalEnglishField; reason: 'required' | 'english' }> = [];
  for (const field of JOURNAL_ENGLISH_FIELDS) {
    const value = input[field]?.trim() ?? '';
    if (!value && requiredFields.includes(field)) issues.push({ field, reason: 'required' });
    else if (value && !isEnglishJournalText(value)) issues.push({ field, reason: 'english' });
  }
  if (!input.subjects?.length && requiredFields.includes('subjects')) issues.push({ field: 'subjects', reason: 'required' });
  else if (input.subjects?.some((value) => !isEnglishJournalText(value.trim()))) issues.push({ field: 'subjects', reason: 'english' });
  return issues;
}

export function journalDisplayName(journal: { nameEn?: string | null; nameZh?: string | null }): string {
  return journal.nameEn?.trim() || journal.nameZh?.trim() || '';
}

export function suggestJournalSlug(englishName?: string | null): string {
  return (englishName ?? '').normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/g, '');
}
