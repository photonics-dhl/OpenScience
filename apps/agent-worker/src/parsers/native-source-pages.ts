import type { ChatImageInput } from '@openscience/ai-gateway';
import type { DocumentSourceMap } from '@openscience/domain';
import type { ParserRasterResult } from './job-protocol';
import { createHash } from 'node:crypto';

type Passage = { text: string; slices: readonly { block: { page: number } }[] };
const fail = (): never => { throw new Error('[blocked] Original paper visual evidence cannot be bound to exact pages'); };
function references(text: string): string[] {
  return [...text.matchAll(/\b(Fig(?:ure)?\.?|Table|Eq(?:uation)?\.?)\s*\(?\s*(S?\d+(?:\.\d+)*)\b/giu)]
    .map(m => `${/^fig/iu.test(m[1]!) ? 'figure' : /^tab/iu.test(m[1]!) ? 'table' : 'equation'}:${m[2]!.toLowerCase()}`);
}
/** Real slice pages, never passage range gaps. Only unique persisted positional references add pages. */
export function nativeSourceReviewPages(map: DocumentSourceMap, passages: readonly Passage[], candidateText: string): { pages: number[]; unmappedEquationReferences: string[] } {
  const valid = new Set(map.pages.map(p => p.page)); const selected = new Set<number>();
  for (const p of passages) for (const slice of p.slices) {
    if (!valid.has(slice.block.page)) return fail(); selected.add(slice.block.page);
  }
  const positions = new Map<string, Set<number>>();
  const equationPages = new Set<number>();
  for (const page of map.pages) for (const block of page.blocks) {
    if (block.kind === 'equation') equationPages.add(page.page);
    const text = block.text?.trim() ?? '';
    const caption = /^(?:Fig(?:ure)?\.?|Table)\s*\(?\s*S?\d+(?:\.\d+)*\b/iu.exec(text)?.[0];
    const keys = block.kind === 'caption' && caption ? references(caption)
      : block.kind === 'equation' ? [...text.matchAll(/(?:\\tag\{(\d+)\}|\((\d+)\)\s*$)/gu)].map(m => `equation:${m[1] ?? m[2]}`) : [];
    for (const key of keys) { const pages = positions.get(key) ?? new Set<number>(); pages.add(page.page); positions.set(key, pages); }
  }
  const unmappedEquationReferences: string[] = [];
  for (const key of new Set(references([candidateText, ...passages.map(p => p.text)].join('\n')))) {
    const pages = positions.get(key);
    if (pages?.size === 1) selected.add([...pages][0]!);
    else if (key.startsWith('equation:') && equationPages.size) {
      unmappedEquationReferences.push(key); for (const page of equationPages) selected.add(page);
    } else return fail();
  }
  if (!selected.size) return fail(); return { pages: [...selected].sort((a, b) => a - b), unmappedEquationReferences: unmappedEquationReferences.sort() };
}
export function nativeSourceReviewImages(result: ParserRasterResult, expectedPages: readonly number[]): ChatImageInput[] {
  if (result.pages.length !== expectedPages.length || new Set(result.pages.map(p => p.pageNumber)).size !== expectedPages.length) return fail();
  return expectedPages.map(page => {
    const raster = result.pages.find(p => p.pageNumber === page); if (!raster || raster.mediaType !== 'image/png') return fail();
    const bytes = Buffer.from(raster.bytesBase64, 'base64');
    if (!bytes.length || bytes.toString('base64') !== raster.bytesBase64
      || createHash('sha256').update(bytes).digest('hex') !== raster.contentHash) return fail();
    return { mediaType: 'image/png', data: raster.bytesBase64 };
  });
}
