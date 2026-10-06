import { JOURNAL_CORE_FIELDS, validateJournalDraft, type JournalDraft, type JournalEvidence, type JournalSource } from '@openscience/domain';
import type { ExtractionResult } from '../extractor';

/** Editorial packaging only: scientific fields and Claims come from the shared paper review. */
export function projectReviewedPaperToJournalDraft(result: ExtractionResult, source: JournalSource, language: 'zh' | 'en'): JournalDraft {
  if (source.kind !== 'fulltext' || result.needsMoreInformation.length) {
    throw new Error('[blocked] Journal paper requires a complete source-reviewed six-field result');
  }
  const evidenceFor = (field: (typeof JOURNAL_CORE_FIELDS)[number], index = 0): JournalEvidence => {
    const segment = result.evidenceSegments?.[field]?.[index];
    if (!segment || typeof segment.quote !== 'string') throw new Error(`[blocked] Reviewed ${field} evidence is missing`);
    const quote = segment.quote.trim();
    if (!quote || quote.length > 2000 || !source.text.includes(quote))
      throw new Error(`[blocked] Reviewed ${field} evidence is not in the uploaded source text`);
    const page = segment.sourceLocator.page;
    return { quote, locator: page ? `page ${page}` : `block ${segment.sourceLocator.blockId ?? 'unknown'}` };
  };
  const core = Object.fromEntries(JOURNAL_CORE_FIELDS.map(field => [field, result.core[field]])) as JournalDraft['core'];
  const claims: JournalDraft['claims'] = (result.reviewedClaimSuggestions ?? []).map(claim => {
    const binding = claim.sourceBindings.find(item => item.relation === 'supports') ?? claim.sourceBindings[0];
    if (!binding) throw new Error('[blocked] Reviewed Claim lacks a source binding');
    const qualifiers = [
      ...(claim.conditions.length ? [`${language === 'zh' ? '条件：' : 'Conditions: '}${claim.conditions.join('；')}`] : []),
      ...(claim.limitations.length ? [`${language === 'zh' ? '局限：' : 'Limitations: '}${claim.limitations.join('；')}`] : []),
    ];
    return { text: [claim.statement, ...qualifiers].join('\n'), kind: 'other', evidence: evidenceFor(claim.sourceField, binding.sourceIndex) };
  });
  if (!claims.length) throw new Error('[blocked] Journal interpretation requires an actually reviewed Claim');
  const faq: JournalDraft['faq'] = [
    { question: language === 'zh' ? '这项研究的核心发现是什么？' : 'What is the central finding?', answer: core.insight, evidence: evidenceFor('insight') },
    { question: language === 'zh' ? '主要结果是什么？' : 'What are the main results?', answer: core.results, evidence: evidenceFor('results') },
  ];
  // Figure cards require a separate editorial decision about actual figures and reuse rights.
  const draft: JournalDraft = { summary: `${core.insight}\n${core.results}`.slice(0, 4000), core, claims, figures: [], faq,
    scope: 'fulltext', language };
  return validateJournalDraft(draft, source);
}
