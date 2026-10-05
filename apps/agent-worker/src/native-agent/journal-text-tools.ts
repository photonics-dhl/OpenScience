import { createHash } from 'node:crypto';
import { journalEvidenceAnchors, type JournalSource } from '@openscience/domain';

const object = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: 'object', properties, required, additionalProperties: false });

/** The installed Agent receives text spans and offsets, never invented PDF pages. */
export const NATIVE_JOURNAL_TEXT_TOOLS = [
  { name: 'paper_overview', description: 'Inspect the bound journal source scope, size and ordered text sections. These are source-text offsets, not PDF pages.', parameters: object({}) },
  { name: 'paper_search', description: 'Find literal words or symbols in the bound source text. Search snippets only locate evidence; call paper_read for exact full spans.',
    parameters: object({ query: { type: 'string', minLength: 1, maxLength: 300 } }, ['query']) },
  { name: 'paper_read', description: 'Read exact numbered source-text spans, retaining their J IDs and character offsets for evidence. No source outside this job is accessible.',
    parameters: object({ passageIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 12 } }, ['passageIds']) },
] as const;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function createNativeJournalTextTools(source: JournalSource) {
  const anchors = journalEvidenceAnchors(source);
  const byId = new Map(anchors.map(anchor => [anchor.id, anchor]));
  const seen = new Set<string>();
  const sourceTextSha256 = createHash('sha256').update(source.text, 'utf8').digest('hex');
  const identity = { kind: 'journal-text', scope: source.kind, sourceTextSha256 };
  const span = (anchor: (typeof anchors)[number]) => ({ id: anchor.id, start: anchor.start, end: anchor.end, text: anchor.quote });
  return {
    get observedPassageIds() { return [...seen]; },
    async call(name: string, args: unknown): Promise<Record<string, unknown>> {
      if (!record(args)) return { error: 'Use the advertised tool arguments.' };
      if (name === 'paper_overview' && Object.keys(args).length === 0) {
        const groups = [];
        for (let index = 0; index < anchors.length; index += 20) {
          const first = anchors[index]!; const last = anchors[Math.min(index + 19, anchors.length - 1)]!;
          groups.push({ firstId: first.id, lastId: last.id, start: first.start, end: last.end, preview: first.quote.slice(0, 180) });
        }
        return { source: identity, totalSpans: anchors.length, totalCharacters: source.text.length, groups,
          guidance: 'The source is supplied text. Read exact spans before citing them; absence from a search is not proof of absence. No PDF page image is available in this tool profile.' };
      }
      if (name === 'paper_search' && Object.keys(args).join(',') === 'query' && typeof args.query === 'string' && args.query.trim() && args.query.length <= 300) {
        const query = args.query.trim().toLocaleLowerCase();
        const matches = anchors.map(anchor => ({ anchor, at: anchor.quote.toLocaleLowerCase().indexOf(query) }))
          .filter(item => item.at >= 0).slice(0, 12).map(({ anchor, at }) => ({ id: anchor.id, start: anchor.start, end: anchor.end,
            excerpt: anchor.quote.slice(Math.max(0, at - 120), Math.min(anchor.quote.length, at + query.length + 180)) }));
        return { source: identity, matches, truncated: matches.length === 12 };
      }
      if (name === 'paper_read' && Object.keys(args).join(',') === 'passageIds' && Array.isArray(args.passageIds)
        && args.passageIds.length >= 1 && args.passageIds.length <= 12 && new Set(args.passageIds).size === args.passageIds.length
        && args.passageIds.every(id => typeof id === 'string' && byId.has(id))) {
        for (const id of args.passageIds) seen.add(id as string);
        return { source: identity, passages: args.passageIds.map(id => span(byId.get(id as string)!)) };
      }
      return { error: 'Unknown source span or unsupported arguments. Use paper_overview, paper_search and paper_read.' };
    },
    async images(): Promise<never> { throw new Error('[blocked] Journal text has no authorized page pixels'); },
  };
}
