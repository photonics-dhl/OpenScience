import { describe, expect, it } from 'vitest';
import type { DocumentSourceMap } from '@openscience/domain';
import { nativeSourceReviewPages, nativeSourceReviewImages } from '../src/parsers/native-source-pages';
import { createWorkerParserCascade } from '../src/index';
import { vi } from 'vitest';
const parser = { name: 'fixture', version: '1' };
const map: DocumentSourceMap = { artifactId: 'a', contentHash: 'a'.repeat(64), parser, pages: [1, 3, 6].map(page => ({
  page, width: 100, height: 100, blocks: [{ id: `b${page}`, kind: 'caption', text: page === 6 ? 'Fig. S2|An actual caption' : `Fig. ${page}|A caption`,
    boundingBox: { x: 0, y: 0, width: 10, height: 10 }, parser, transformations: [] }],
})) };
describe('native source pixel selection', () => {
  it('stops raster accumulation at its body budget before requesting another batch', async () => {
    const raster = vi.fn(async () => ({ schemaVersion: 2 as const, kind: 'raster' as const, parser,
      pages: [{ pageNumber: 1, mediaType: 'image/png' as const, bytesBase64: 'x'.repeat(12), width: 1, height: 1, contentHash: 'a'.repeat(64) }] }));
    const cascade = createWorkerParserCascade({ ocr: vi.fn() } as never, vi.fn() as never, raster as never);
    await expect(cascade.renderPages({ artifactId: 'a', contentHash: map.contentHash, content: Buffer.from('pdf'), mediaType: 'application/pdf' },
      [1, 2, 3, 4, 5], 10)).rejects.toThrow('accumulation');
    expect(raster).toHaveBeenCalledOnce();
  });
  it('uses slice pages and adds uniquely mapped visual references without filling range gaps', () => {
    expect(nativeSourceReviewPages(map, [{ text: 'Refer to Fig. S2.', slices: [{ block: { page: 1 } }, { block: { page: 3 } }] }], '')).toEqual({ pages: [1, 3, 6], unmappedEquationReferences: [] });
  });
  it('includes the complete actual formula page set when text lost equation labels, without inferring from page footers', () => {
    const copy = structuredClone(map); copy.pages[1].blocks[0].kind = 'equation'; copy.pages[1].blocks[0].text = '\\[a+b=c\\]';
    copy.pages[2].blocks[0].kind = 'equation'; copy.pages[2].blocks[0].text = '\\[x=y\\]';
    copy.pages[0].blocks[0].kind = 'paragraph'; copy.pages[0].blocks[0].text = '(5)';
    expect(nativeSourceReviewPages(copy, [{ text: 'Eq.5 and Eq.10', slices: [{ block: { page: 1 } }] }], '')).toEqual({
      pages: [1, 3, 6], unmappedEquationReferences: ['equation:10', 'equation:5'] });
  });
  it('keeps a uniquely numbered equation scoped to its actual page', () => {
    const copy = structuredClone(map); copy.pages[1].blocks[0].kind = 'equation'; copy.pages[1].blocks[0].text = '\\[a=b\\]\\tag{5}';
    expect(nativeSourceReviewPages(copy, [{ text: 'Eq.5', slices: [{ block: { page: 1 } }] }], '')).toEqual({ pages: [1, 3], unmappedEquationReferences: [] });
  });
  it('exposes ambiguous formula labels and supplies all formula pages instead of choosing one', () => {
    const copy = structuredClone(map);
    for (const page of copy.pages.slice(1)) { page.blocks[0].kind = 'equation'; page.blocks[0].text = '\\[a=b\\]\\tag{5}'; }
    expect(nativeSourceReviewPages(copy, [{ text: 'Eq.5', slices: [{ block: { page: 1 } }] }], '')).toEqual({ pages: [1, 3, 6], unmappedEquationReferences: ['equation:5'] });
  });
  it.each(['Fig. 99', 'Eq. (5)'])('refuses unmapped evidence %s', text => {
    expect(() => nativeSourceReviewPages(map, [{ text, slices: [{ block: { page: 1 } }] }], '')).toThrow();
  });
  it('refuses an ambiguous caption rather than selecting a guessed page', () => {
    const copy = structuredClone(map); copy.pages[0].blocks[0].text = 'Fig. S2|Another caption';
    expect(() => nativeSourceReviewPages(copy, [{ text: 'Fig. S2', slices: [{ block: { page: 3 } }] }], '')).toThrow();
  });
  it('rejects omitted or duplicated raster pages before any paid call', () => {
    expect(() => nativeSourceReviewImages({ schemaVersion: 2, kind: 'raster', parser, pages: [] }, [1])).toThrow();
  });
});
