import { JOURNAL_CORE_FIELDS, validateJournalDraft, type JournalDraft, type JournalSource } from './content';
import { JournalError } from './contracts';
import { parseReviewedClaimSuggestions } from '../ingestion/reviewed-claim-suggestions';

type EvidenceSegment = { quote: string; sourceLocator: { page?: number; blockId?: string } };

/** Editorial fields are a projection of the saved, self-reviewed Native paper result. */
export function projectSharedPaperToJournalDraft(raw: unknown, source: JournalSource, language: 'zh' | 'en'): JournalDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || source.kind !== 'fulltext')
    throw new JournalError('INVALID_STATE', '共享论文理解结果不可用');
  const result = raw as Record<string, unknown>;
  const review = result.scientificReview as Record<string, unknown> | undefined;
  if (review?.kind !== 'hermes_agent_review' || review.status !== 'review_received'
    || !Array.isArray(result.needsMoreInformation)
    || result.needsMoreInformation.length) throw new JournalError('INVALID_STATE', '六字段尚未通过 Native 自校');
  const rawCore = result.core as Record<string, unknown> | undefined;
  const rawEvidence = result.evidenceSegments as Record<string, EvidenceSegment[]> | undefined;
  if (!rawCore || !rawEvidence || JOURNAL_CORE_FIELDS.some((field) => typeof rawCore[field] !== 'string' || !String(rawCore[field]).trim()))
    throw new JournalError('INVALID_STATE', '六字段或来源证据不完整');
  const core = Object.fromEntries(JOURNAL_CORE_FIELDS.map((field) => [field, rawCore[field]])) as JournalDraft['core'];
  const evidenceFor = (field: typeof JOURNAL_CORE_FIELDS[number], index = 0) => {
    const segment = rawEvidence[field]?.[index];
    const quote = segment?.quote?.trim();
    if (!quote || quote.length > 2000 || !source.text.includes(quote))
      throw new JournalError('INVALID_STATE', '六字段引文与当前正文不匹配');
    const page = segment.sourceLocator?.page;
    return { quote, locator: page ? `page ${page}` : `block ${segment.sourceLocator?.blockId ?? 'unknown'}` };
  };
  const counts = Object.fromEntries(JOURNAL_CORE_FIELDS.map((field) => [field, rawEvidence[field]?.length ?? 0]));
  const suggestions = parseReviewedClaimSuggestions(result.reviewedClaimSuggestions, counts);
  if (!suggestions?.length) throw new JournalError('INVALID_STATE', 'Native 自校未形成可核验的 Claims');
  const claims: JournalDraft['claims'] = suggestions.map((claim) => {
    const binding = claim.sourceBindings.find((item) => item.relation === 'supports') ?? claim.sourceBindings[0];
    if (!binding) throw new JournalError('INVALID_STATE', 'Claim 缺少正文证据');
    const qualifiers = [
      ...(claim.conditions.length ? [`${language === 'zh' ? '条件：' : 'Conditions: '}${claim.conditions.join('；')}`] : []),
      ...(claim.limitations.length ? [`${language === 'zh' ? '局限：' : 'Limitations: '}${claim.limitations.join('；')}`] : []),
    ];
    return { text: [claim.statement, ...qualifiers].join('\n'), kind: 'other', evidence: evidenceFor(claim.sourceField, binding.sourceIndex) };
  });
  const faq: JournalDraft['faq'] = [
    { question: language === 'zh' ? '这项研究的核心发现是什么？' : 'What is the central finding?', answer: core.insight, evidence: evidenceFor('insight') },
    { question: language === 'zh' ? '主要结果是什么？' : 'What are the main results?', answer: core.results, evidence: evidenceFor('results') },
  ];
  const summary = `${core.insight}\n${core.results}`;
  return validateJournalDraft({ summary: summary.length <= 4000 ? summary : core.insight, core, claims, figures: [], faq,
    scope: 'fulltext', language }, source);
}
