import { isSourceRetrieveIdentifier } from '@openscience/domain/browser-result';

import type { LiteratureAcquisitionTarget } from '@/lib/api';

const ENGLISH_VERBS = ['find', 'search for', 'search', 'locate', 'get', 'fetch', 'download', 'retrieve'] as const;
const ENGLISH_NOUNS = ['paper', 'papers', 'article', 'articles', 'publication', 'publications', 'literature', 'full text', 'full-text', 'pdf', 'pdfs'] as const;
const CHINESE_VERBS = ['查找', '搜索', '检索', '寻找', '获取', '下载', '找'] as const;
const CHINESE_NOUNS = ['论文', '文献', '文章', '全文', 'PDF', 'pdf', '来源'] as const;

export type RoutedHermesIntent =
  | { kind: 'workspace.guide'; goal: string }
  | { kind: 'literature.acquire'; input: { query: string; identifier?: string }; target: LiteratureAcquisitionTarget };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function alternatives(values: readonly string[]): string {
  return [...values].sort((left, right) => right.length - left.length).map(escapeRegex).join('|');
}

const ENGLISH_EXPLICIT_INTENT = new RegExp(
  `^(?:please\\s+)?(?:help\\s+me\\s+)?(?:${alternatives(ENGLISH_VERBS)})\\s+(?:me\\s+)?(?:(?:a|an|the)\\s+)?(?:${alternatives(ENGLISH_NOUNS)})(?:\\s+(?:titled|named|about|on|for)|\\s*[:：])?\\s+(.+)$`,
  'iu',
);
const CHINESE_EXPLICIT_INTENT = new RegExp(
  `^(?:请)?(?:帮我)?(?:${alternatives(CHINESE_VERBS)})(?:一下)?(?:这篇|一篇|该篇|这份|一份)?(?:${alternatives(CHINESE_NOUNS)})(?:题为|关于|[:：])?\\s*(.+)$`,
  'iu',
);
const DOI_CANDIDATE = /10\.\d{4,9}\/[-._;()/:a-z0-9]+/giu;
const ARXIV_CANDIDATE = /(?:arxiv:)?\d{4}\.\d{4,5}(?:v\d+)?/giu;

function identifierFromGoal(goal: string): string | undefined {
  if (isSourceRetrieveIdentifier(goal)) return goal.trim();
  for (const pattern of [DOI_CANDIDATE, ARXIV_CANDIDATE]) {
    pattern.lastIndex = 0;
    for (const match of goal.matchAll(pattern)) {
      const candidate = match[0];
      if (candidate && isSourceRetrieveIdentifier(candidate)) return candidate;
    }
  }
  return undefined;
}

function explicitTitleQuery(goal: string): string | undefined {
  for (const pattern of [ENGLISH_EXPLICIT_INTENT, CHINESE_EXPLICIT_INTENT]) {
    const query = pattern.exec(goal)?.[1]?.trim();
    if (query) return query;
  }
  return undefined;
}

export function routeHermesLiteratureIntent({
  activeResearchObjectId,
  goal,
}: {
  activeResearchObjectId: string | null;
  goal: string;
}): RoutedHermesIntent {
  const normalized = goal.trim();
  const identifier = identifierFromGoal(normalized);
  const query = identifier ?? explicitTitleQuery(normalized);
  if (!query) return { kind: 'workspace.guide', goal: normalized };
  const target: LiteratureAcquisitionTarget = activeResearchObjectId
    ? { kind: 'research_object', researchObjectId: activeResearchObjectId }
    : { kind: 'personal' };
  return {
    kind: 'literature.acquire',
    input: { query, ...(identifier ? { identifier } : {}) },
    target,
  };
}
