import { describe, expect, it } from 'vitest';
import { createNativePaperTools, NATIVE_PAPER_TOOLS, mapNativePaperSearchHits } from '../src/native-agent/paper-tools';
import { canonicalPassages } from '../src/extractor';
import type { DocumentSourceMap, SourceLocator } from '@openscience/domain';
const parser = { name: 'fixture', version: '1' };
const map: DocumentSourceMap = { artifactId: 'paper', contentHash: 'a'.repeat(64), parser, pages: [1, 2].map(page => ({ page, width: 100, height: 100,
  blocks: [{ id: `block-${page}`, kind: 'paragraph', text: page === 1 ? 'Main contribution: emission from moving electrons.' : 'Appendix: electron y is homogeneous; field varies along x.',
    boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] })) };
describe('current native passage locator mapper', () => {
  const oneBlock = (text: string): DocumentSourceMap => ({ ...structuredClone(map), pages: [{
    ...structuredClone(map.pages[0]!), blocks: [{ ...structuredClone(map.pages[0]!.blocks[0]!), text }],
  }] });
  const locator = (doc: DocumentSourceMap, charRange?: SourceLocator['charRange']): SourceLocator => ({
    artifactId: doc.artifactId, contentHash: doc.contentHash, page: 1, blockId: doc.pages[0]!.blocks[0]!.id,
    ...(charRange === undefined ? {} : { charRange }),
  });
  const long = () => oneBlock(' \t' + 'A'.repeat(1_200) + 'B'.repeat(1_200) + '  ');

  it('maps actual split canonical passages many-to-many, deduplicating in current P order', () => {
    const doc = long(), before = structuredClone(doc), passages = canonicalPassages(doc);
    expect(passages).toHaveLength(2);
    const hits = [{ id: 'f'.repeat(64), locators: [locator(doc, { start: 1_500, end: 1_700 })] },
      { id: 'P99999', locators: [locator(doc, { start: 1_100, end: 1_300 }), locator(doc, { start: 1_700, end: 1_900 })] }];
    const result = mapNativePaperSearchHits(doc, hits);
    expect(result.map(p => p.id)).toEqual(passages.map(p => p.id));
    expect(result.every(p => p.text.length <= 500)).toBe(true);
    expect(result[1]!.text).toContain('B');
    expect(doc).toEqual(before);
  });

  it.each([
    [{ start: 0, end: 2 }, []],
    [{ start: 2, end: 1_202 }, ['P00001']],
    [{ start: 1_201, end: 1_202 }, ['P00001']],
    [{ start: 1_202, end: 1_203 }, ['P00002']],
    [{ start: 2_402, end: 2_404 }, []],
  ] as const)('uses raw trimmed offsets and half-open overlap %j', (range, ids) => {
    const doc = long();
    expect(mapNativePaperSearchHits(doc, [{ locators: [locator(doc, range)] }]).map(p => p.id)).toEqual(ids);
  });

  it('treats absent charRange as the whole original block, without casting the chunk id', () => {
    const doc = long(), hits = [{ id: '0'.repeat(64), locators: [locator(doc)] }];
    expect(mapNativePaperSearchHits(doc, hits).map(p => p.id)).toEqual(canonicalPassages(doc).map(p => p.id));
  });

  it('locates the original interval inside a merged passage without losing its block separator', () => {
    const doc = oneBlock('A'.repeat(700));
    doc.pages[0]!.blocks.push({ ...structuredClone(doc.pages[0]!.blocks[0]!), id: 'second-block',
      text: '     ' + 'B'.repeat(300) + '  ' });
    const passages = canonicalPassages(doc);
    expect(passages).toHaveLength(1);
    const item = { ...locator(doc, { start: 25, end: 35 }), blockId: 'second-block' };
    expect(mapNativePaperSearchHits(doc, [{ locators: [item] }]))
      .toEqual([{ id: passages[0]!.id, pageStart: 1, pageEnd: 1, text: passages[0]!.text.slice(601, 1_101) }]);
  });

  it.each(['artifact', 'content', 'page', 'block', 'no-page', 'no-block', 'negative', 'too-long',
    'empty', 'reverse', 'fraction', 'nan'] as const)('does not map a wrong or invalid %s locator', failure => {
      const doc = long(), item = locator(doc, { start: 2, end: 3 });
      if (failure === 'artifact') item.artifactId = 'foreign';
      if (failure === 'content') item.contentHash = 'b'.repeat(64);
      if (failure === 'page') item.page = 2;
      if (failure === 'block') item.blockId = 'old-block';
      if (failure === 'no-page') delete item.page;
      if (failure === 'no-block') delete item.blockId;
      if (failure === 'negative') item.charRange = { start: -1, end: 4 };
      if (failure === 'too-long') item.charRange = { start: 0, end: 2_405 };
      if (failure === 'empty') item.charRange = { start: 2, end: 2 };
      if (failure === 'reverse') item.charRange = { start: 4, end: 2 };
      if (failure === 'fraction') item.charRange = { start: 2.5, end: 4 };
      if (failure === 'nan') item.charRange = { start: NaN, end: 4 };
      expect(mapNativePaperSearchHits(doc, [{ locators: [item] }])).toEqual([]);
    });

  it('skips the suppressed native block rather than matching its page or bbox to vision', () => {
    const doc = oneBlock('Native transcription');
    doc.pages[0]!.blocks.push({ ...structuredClone(doc.pages[0]!.blocks[0]!), id: 'vision-block', text: 'Correct visual transcription',
      parser: { name: 'llm_ocr_candidate', version: '1' } });
    expect(canonicalPassages(doc)[0]!.text).toBe('Correct visual transcription');
    expect(mapNativePaperSearchHits(doc, [{ locators: [locator(doc)] }])).toEqual([]);
    expect(mapNativePaperSearchHits(doc, [{ locators: [{ ...locator(doc), blockId: 'vision-block' }] }])[0]!.text)
      .toBe('Correct visual transcription');
  });

  it('does not choose among ambiguous same-id/page original blocks', () => {
    const doc = oneBlock('First original');
    doc.pages[0]!.blocks.push({ ...structuredClone(doc.pages[0]!.blocks[0]!), text: 'Second original' });
    expect(mapNativePaperSearchHits(doc, [{ locators: [locator(doc)] }])).toEqual([]);
  });

  it('bounds hits, locators, passage results and current excerpts', () => {
    const doc = oneBlock('A'.repeat(1_200)), bad = { ...locator(doc), artifactId: 'foreign' };
    expect(mapNativePaperSearchHits(doc, [...Array.from({ length: 12 }, () => ({ locators: [bad] })), { locators: [locator(doc)] }])).toEqual([]);
    expect(mapNativePaperSearchHits(doc, [{ locators: [...Array.from({ length: 64 }, () => bad), locator(doc)] }])).toEqual([]);
    const many: DocumentSourceMap = { ...doc, pages: Array.from({ length: 14 }, (_, index) => ({ ...doc.pages[0]!, page: index + 1,
      blocks: [{ ...doc.pages[0]!.blocks[0]!, id: 'block-' + index, text: 'X'.repeat(900) }] })) };
    const locators = many.pages.map(page => ({ artifactId: many.artifactId, contentHash: many.contentHash, page: page.page, blockId: page.blocks[0]!.id }));
    const result = mapNativePaperSearchHits(many, [{ locators }]);
    expect(result).toHaveLength(12);
    expect(result.map(p => p.id)).toEqual(canonicalPassages(many).slice(0, 12).map(p => p.id));
    expect(result.every(p => p.text.length === 500 && Object.keys(p).sort().join(',') === 'id,pageEnd,pageStart,text')).toBe(true);
  });

  it('does not mark a retrieval reference read; only existing paper_read observes it', async () => {
    const doc = long(), tools = createNativePaperTools(doc, async () => []);
    const result = mapNativePaperSearchHits(doc, [{ locators: [locator(doc)] }]);
    expect(tools.observedPassageIds).toEqual([]);
    await tools.call('paper_read', { passageIds: [result[0]!.id] });
    expect(tools.observedPassageIds).toEqual([result[0]!.id]);
  });
});

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
