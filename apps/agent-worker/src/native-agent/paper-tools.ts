import type { DocumentSourceMap } from '@openscience/domain';
import { isDeepStrictEqual } from 'node:util';
import { canonicalPassages } from '../extractor';

const parameters = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const LEGACY_SEARCH_DESCRIPTION = 'Locate literal words, symbols or figure numbers in this paper. This is lexical lookup, not semantic search. Read matching IDs to obtain complete evidence.';
export const NATIVE_PAPER_TOOLS = [
  { name: 'paper_overview', description: 'Inspect this paper structure, headings, figure captions and available evidence IDs before choosing focused reads.', parameters: parameters({}) },
  { name: 'paper_search', description: LEGACY_SEARCH_DESCRIPTION + ' Word and symbol boundaries rank above incidental inner-word fragments. Excerpts show original context around a hit, not the paragraph prefix. An omitted search result never proves the paper omits a fact; follow its outline or refine the literal query.',
    parameters: parameters({ query: { type: 'string', minLength: 1, maxLength: 300 } }, ['query']) },
  { name: 'paper_read', description: 'Read complete original passages from this paper, preserving their source IDs and page locations. Follow derivation, captions and appendices when needed.',
    parameters: parameters({ passageIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 12 } }, ['passageIds']) },
  { name: 'paper_view', description: 'Inspect actual original page pixels for equations, plots, geometry and scientific relations. Pixels will appear in your next turn, with exact paper and page identity.',
    parameters: parameters({ pages: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1, maxItems: 2 } }, ['pages']) },
] as const;
export const LEGACY_NATIVE_PAPER_TOOLS = NATIVE_PAPER_TOOLS.map(tool => tool.name === 'paper_search'
  ? { ...tool, description: LEGACY_SEARCH_DESCRIPTION } : tool);
export type NativePaperImage = { pageNumber: number; mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; bytesBase64: string };
type Arguments = Record<string, unknown>;
const record = (value: unknown): value is Arguments => !!value && typeof value === 'object' && !Array.isArray(value);

/** Bound to the already parsed map. No provider, OCR, filesystem path or URL is exposed to the Agent. */
export function createNativePaperTools(sourceMap: DocumentSourceMap, renderPages: (pages: number[]) => Promise<NativePaperImage[]>,
  definitions?: readonly { name: string; description?: string; parameters?: unknown }[]) {
  const search = definitions?.find(tool => tool.name === 'paper_search');
  const currentSearch = NATIVE_PAPER_TOOLS.find(tool => tool.name === 'paper_search')!;
  const focusedSearch = search?.description === currentSearch.description && isDeepStrictEqual(search.parameters, currentSearch.parameters);
  const map = structuredClone(sourceMap);
  const passages = canonicalPassages(map);
  const byId = new Map(passages.map(p => [p.id, p]));
  const seen = new Set<string>();
  const viewedPages = new Set<number>();
  const validPages = new Set(map.pages.map(p => p.page));
  const source = { artifactId: map.artifactId, documentSha256: map.contentHash };
  const describe = (p: (typeof passages)[number]) => ({ id: p.id, pageStart: p.pageStart, pageEnd: p.pageEnd, text: p.text });
  function pageSelection(value: unknown) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 2 || new Set(value).size !== value.length
      || value.some(p => !Number.isSafeInteger(p) || !validPages.has(p))) return null;
    return [...value] as number[];
  }
  return {
    get observedPassageIds() { return [...seen]; },
    async call(name: string, args: unknown): Promise<Record<string, unknown>> {
      if (!record(args)) return { error: 'Use the advertised tool arguments.' };
      if (name === 'paper_overview' && Object.keys(args).length === 0) {
        const headings = map.pages.flatMap(page => page.blocks.filter(b => b.kind === 'heading' || b.kind === 'caption')
          .map(b => ({ page: page.page, kind: b.kind, text: b.text ?? '' }))).filter(b => b.text.trim());
        return { source, pages: map.pages.map(p => ({ page: p.page, passageIds: passages.filter(s => s.pageStart <= p.page && s.pageEnd >= p.page).map(s => s.id) })),
          outline: headings, totalPassages: passages.length,
          guidance: 'Understand the contribution and its scope first; then read full evidence and view relevant plots/equations. A parsing or tool failure does not mean the paper omits the information.' };
      }
      if (name === 'paper_search' && Object.keys(args).join(',') === 'query' && typeof args.query === 'string' && args.query.trim() && args.query.length <= 300) {
        const words = [...new Set(args.query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
        const terms = focusedSearch ? words.map(word => ({ literal: new RegExp(word, 'iu'),
          boundary: new RegExp('(?<![\\p{L}\\p{N}])' + word + (/\p{N}$/u.test(word) ? '(?![\\p{L}\\p{N}])' : '(?!\\p{L})'), 'iu') })) : [];
        const ranked = passages.map(p => {
          const lower = p.text.toLocaleLowerCase();
          const positions = terms.map(term => p.text.search(term.boundary));
          const anchor = positions.find(position => position >= 0) ?? terms.map(term => p.text.search(term.literal)).find(position => position >= 0) ?? 0;
          return { p, score: words.reduce((n, word) => n + (lower.includes(word) ? 1 : 0), 0),
            boundaryScore: positions.filter(position => position >= 0).length, start: Math.max(0, anchor - 120) };
        }).filter(p => p.score > 0).sort((a, b) => b.boundaryScore - a.boundaryScore || b.score - a.score || a.p.id.localeCompare(b.p.id)).slice(0, 12);
        // An excerpt locates evidence; only a full paper_read may authorize a complete passage citation.
        return { source, matches: ranked.map(({ p, start }) => ({ ...describe(p), text: p.text.slice(start, start + 500) })) };
      }
      if (name === 'paper_read' && Object.keys(args).join(',') === 'passageIds' && Array.isArray(args.passageIds)
        && args.passageIds.length >= 1 && args.passageIds.length <= 12 && new Set(args.passageIds).size === args.passageIds.length
        && args.passageIds.every(id => typeof id === 'string' && byId.has(id))) {
        for (const id of args.passageIds) seen.add(id as string);
        return { source, passages: args.passageIds.map(id => describe(byId.get(id as string)!)) };
      }
      if (name === 'paper_view' && Object.keys(args).join(',') === 'pages') {
        const pages = pageSelection(args.pages);
        if (pages) return { status: 'page_view_ready', source, pages };
      }
      return { error: 'Unknown passage/page or unsupported arguments. Use paper_overview or paper_search to find evidence in this paper.' };
    },
    async images(args: unknown, result: unknown) {
      if (!record(args) || Object.keys(args).join(',') !== 'pages' || !record(result)) throw new Error('[blocked] Native page result changed');
      const pages = pageSelection(args.pages);
      if (!pages || result.status !== 'page_view_ready' || JSON.stringify(result.source) !== JSON.stringify(source)
        || JSON.stringify(result.pages) !== JSON.stringify(pages)) throw new Error('[blocked] Native page identity changed');
      const images = await renderPages(pages);
      if (images.length !== pages.length || images.some(image => !pages.includes(image.pageNumber)) || new Set(images.map(i => i.pageNumber)).size !== pages.length)
        throw new Error('[blocked] Native page raster is incomplete');
      const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];
      for (const page of pages) {
        const image = images.find(i => i.pageNumber === page)!;
        viewedPages.add(page);
        for (const p of passages.filter(p => p.slices.every(slice => viewedPages.has(slice.block.page)))) seen.add(p.id);
        content.push({ type: 'text', text: `Original paper ${source.documentSha256}; page ${page}. Read this actual page before drawing scientific conclusions.` },
          { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.bytesBase64}` } });
      }
      return { content };
    },
  };
}
