import { describe, expect, it } from 'vitest';
import { createNativePaperTools, NATIVE_PAPER_TOOLS } from '../src/native-agent/paper-tools';
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

describe('Native literal search shows the actual term rather than a prefix or word fragment', () => {
  const makeMap = (texts: string[]): DocumentSourceMap => ({ ...map, pages: texts.map((text, index) => ({ ...map.pages[0]!, page: index + 1,
    blocks: [{ ...map.pages[0]!.blocks[0]!, id: `lookup-${index}`, text }] })) });
  const rankedMap = () => makeMap([
    ...Array.from({ length: 12 }, () => 'A generated waveguide slit mode is described. ' + 'Unrelated background. '.repeat(150)),
    'The TE₀-like waveguide slit mode is reported. ' + 'Relevant context. '.repeat(150),
  ]);
  it('puts a scientific symbol boundary above incidental short-word substrings within top12', async () => {
    const tools = createNativePaperTools(rankedMap(), async () => [], NATIVE_PAPER_TOOLS);
    const result = await tools.call('paper_search', { query: 'TE mode waveguide slit' });
    const matches = result.matches as Array<{ id: string; text: string }>;
    expect(matches).toHaveLength(12);
    expect(matches[0]!.text).toContain('TE₀-like');
    expect(tools.observedPassageIds).toEqual([]);
    await tools.call('paper_read', { passageIds: [matches[0]!.id] });
    expect(tools.observedPassageIds).toEqual([matches[0]!.id]);
  });
  it('returns original text around a late hit and keeps reading authority separate', async () => {
    const text = 'Introductory background. '.repeat(35) + 'The waveguide slit mode has the reported property.';
    const tools = createNativePaperTools(makeMap([text]), async () => [], NATIVE_PAPER_TOOLS);
    const matches = (await tools.call('paper_search', { query: 'waveguide slit mode' })).matches as Array<{ id: string; text: string }>;
    expect(matches[0]!.text).toContain('waveguide slit mode');
    expect(matches[0]!.text.length).toBeLessThanOrEqual(500);
    expect(text).toContain(matches[0]!.text);
    expect(tools.observedPassageIds).toEqual([]);
  });
  it('retains substring lookup as a fallback instead of treating a word ending as absence', async () => {
    const tools = createNativePaperTools(makeMap(['A generated response is reported.']), async () => [], NATIVE_PAPER_TOOLS);
    expect(JSON.stringify(await tools.call('paper_search', { query: 'generat' }))).toContain('generated response');
  });
  it.each(['absent', 'old-description', 'unknown', 'changed-schema'])('preserves the old result for %s saved definitions', async mode => {
    const definitions = structuredClone(NATIVE_PAPER_TOOLS) as Array<{ name: string; description: string; parameters: unknown }>;
    const search = definitions.find(tool => tool.name === 'paper_search')!;
    if (mode === 'old-description') search.description = 'Locate literal words, symbols or figure numbers in this paper. This is lexical lookup, not semantic search. Read matching IDs to obtain complete evidence.';
    if (mode === 'unknown') search.description = 'Unknown saved lookup';
    if (mode === 'changed-schema') search.parameters = { type: 'object' };
    const old = createNativePaperTools(rankedMap(), async () => []);
    const restored = createNativePaperTools(rankedMap(), async () => [], mode === 'absent' ? undefined : definitions);
    const args = { query: 'TE mode waveguide slit' };
    expect(await restored.call('paper_search', args)).toEqual(await old.call('paper_search', args));
    expect(old.observedPassageIds).toEqual([]);
  });
});
