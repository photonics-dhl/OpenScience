import { describe, expect, it } from 'vitest';
import { createNativePaperTools } from '../src/native-agent/paper-tools';
import type { DocumentSourceMap } from '@openscience/domain';
const parser = { name: 'fixture', version: '1' };
const map: DocumentSourceMap = { artifactId: 'paper', contentHash: 'a'.repeat(64), parser, pages: [1, 2].map(page => ({ page, width: 100, height: 100,
  blocks: [{ id: `block-${page}`, kind: 'paragraph', text: page === 1 ? 'Main contribution: emission from moving electrons.' : 'Appendix: electron y is homogeneous; field varies along x.',
    boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] })) };
describe('bound native paper tools', () => {
  it('does not authorize a cross-page passage after seeing only one of its actual pages', async () => {
    const tools = createNativePaperTools(map, async pages => pages.map(pageNumber =>
      ({ pageNumber, mediaType: 'image/png', bytesBase64: 'fixture' })));
    const first = { pages: [1] }; const second = { pages: [2] };
    await tools.images(first, await tools.call('paper_view', first)); expect(tools.observedPassageIds).toEqual([]);
    await tools.images(second, await tools.call('paper_view', second)); expect(tools.observedPassageIds).toContain('P00001');
  });
  it('lets the Agent find and read appendix evidence without a full-window model pipeline', async () => {
    const tools = createNativePaperTools(map, async () => []);
    const overview = await tools.call('paper_overview', {}); expect(overview.totalPassages).toBeGreaterThan(0);
    const search = await tools.call('paper_search', { query: 'homogeneous' });
    const matches = search.matches as Array<{ id: string; text: string }>;
    expect(matches[0]!.text).toContain('electron y is homogeneous');
    const read = await tools.call('paper_read', { passageIds: [matches[0]!.id] });
    expect(JSON.stringify(read)).toContain('field varies along x'); expect(tools.observedPassageIds).toContain(matches[0]!.id);
  });
  it('does not accept arbitrary file paths, URLs, foreign pages or unknown passage IDs', async () => {
    let calls = 0; const tools = createNativePaperTools(map, async () => { calls++; return []; });
    for (const [name, args] of [['paper_view', { pages: [3] }], ['paper_view', { pages: [1], path: '/root/secret' }],
      ['paper_read', { passageIds: ['P99999'] }], ['paper_read', { url: 'https://foreign.invalid' }]] as const) {
      expect(await tools.call(name, args)).toHaveProperty('error');
    }
    expect(calls).toBe(0);
  });
  it('returns exact original pixels in requested page order without OCR or provider calls', async () => {
    const selected: number[][] = []; const tools = createNativePaperTools(map, async pages => {
      selected.push(pages); return [...pages].reverse().map(pageNumber => ({ pageNumber, mediaType: 'image/png', bytesBase64: `original-${pageNumber}` }));
    });
    const args = { pages: [2, 1] }; const result = await tools.call('paper_view', args);
    const images = await tools.images(args, result);
    expect(selected).toEqual([[2, 1]]); expect(images.content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,original-2' } });
    expect(images.content[3]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,original-1' } });
  });
  it('rejects changed source results or missing page rasters before releasing images', async () => {
    const tools = createNativePaperTools(map, async () => []); const args = { pages: [2] }; const result = await tools.call('paper_view', args);
    await expect(tools.images(args, { ...result, source: { artifactId: 'foreign' } })).rejects.toThrow('identity');
    await expect(tools.images(args, result)).rejects.toThrow('incomplete');
  });
});
