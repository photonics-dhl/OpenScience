import { describe, expect, it } from 'vitest';

async function sourceLocatorContract() {
  return await import('../../src') as unknown as {
    createBlockSourceLocator(map: unknown, blockId: string, options?: { charRange?: { start: number; end: number } }): unknown;
    createTableCellSourceLocator(map: unknown, blockId: string, tableCell: { sheet?: string; row: number; column: number }): unknown;
    createCodeSourceLocator(artifactId: string, contentHash: string, codeRange: { commit: string; path: string; startLine: number; endLine: number }): unknown;
    resolveSourceLocator(map: unknown, locator: unknown): unknown;
    serializeSourceLocator(value: unknown): string;
    deserializeSourceLocator(json: string): unknown;
    validateSourceLocator(value: unknown): unknown;
  };
}

function sourceMap() {
  const parser = { name: 'deterministic-pdf', version: '1.0.0' };
  return {
    artifactId: 'artifact-1',
    contentHash: 'a'.repeat(64),
    parser,
    pages: [{
      page: 1,
      width: 612,
      height: 792,
      blocks: [
        { id: 'paragraph-1', kind: 'paragraph', text: 'Evidence paragraph.', boundingBox: { x: 10, y: 20, width: 200, height: 30 }, parser, transformations: [] },
        { id: 'figure-1', kind: 'figure', boundingBox: { x: 10, y: 60, width: 200, height: 120 }, parser, transformations: [] },
        { id: 'table-1', kind: 'table', boundingBox: { x: 10, y: 200, width: 200, height: 100 }, parser, transformations: [] },
      ],
    }],
  };
}

function structuredTableSourceMap() {
  const parser = { name: 'openscience-text-extractor', version: '1.0.0' };
  const virtual = { name: 'openscience-virtual-page', version: 'openscience-virtual-page-v1' };
  return {
    artifactId: 'artifact-xlsx',
    contentHash: 'b'.repeat(64),
    parser,
    pages: [{
      page: 1,
      width: 1000,
      height: 72,
      blocks: [
        { id: 'sheet-heading', kind: 'heading', text: 'Evidence', boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, parser, transformations: [{ stage: 'extract_text', processor: parser }, { stage: 'normalize', processor: virtual }] },
        { id: 'claim-cell', kind: 'table', text: 'Claim', boundingBox: { x: 0, y: 24, width: 500, height: 24 }, parser, transformations: [{ stage: 'extract_text', processor: parser }, { stage: 'normalize', processor: virtual }] },
        { id: 'value-cell', kind: 'table', text: '42', boundingBox: { x: 500, y: 48, width: 500, height: 24 }, parser, transformations: [{ stage: 'extract_text', processor: parser }, { stage: 'normalize', processor: virtual }] },
      ],
    }],
  };
}

describe('SourceLocator construction and resolution', () => {
  it('creates exact, versioned locators for paragraph, figure, table, and code evidence', async () => {
    const map = sourceMap();
    const { createBlockSourceLocator, createTableCellSourceLocator, createCodeSourceLocator } = await sourceLocatorContract();

    expect(createBlockSourceLocator(map, 'paragraph-1', { charRange: { start: 0, end: 8 } })).toEqual({
      artifactId: 'artifact-1', contentHash: 'a'.repeat(64), blockId: 'paragraph-1', page: 1,
      boundingBox: { x: 10, y: 20, width: 200, height: 30 }, charRange: { start: 0, end: 8 },
    });
    expect(createBlockSourceLocator(map, 'figure-1')).toEqual({
      artifactId: 'artifact-1', contentHash: 'a'.repeat(64), blockId: 'figure-1', page: 1,
      boundingBox: { x: 10, y: 60, width: 200, height: 120 },
    });
    expect(createTableCellSourceLocator(map, 'table-1', { sheet: 'Evidence', row: 2, column: 2 })).toEqual({
      artifactId: 'artifact-1', contentHash: 'a'.repeat(64), blockId: 'table-1', page: 1,
      boundingBox: { x: 10, y: 200, width: 200, height: 100 }, tableCell: { sheet: 'Evidence', row: 2, column: 2 },
    });
    expect(createCodeSourceLocator('artifact-1', 'a'.repeat(64), { commit: 'abc1234', path: 'src/model.py', startLine: 4, endLine: 9 })).toEqual({
      artifactId: 'artifact-1', contentHash: 'a'.repeat(64),
      codeRange: { commit: 'abc1234', path: 'src/model.py', startLine: 4, endLine: 9 },
    });
  });

  it('resolves only an unchanged locator against its versioned map', async () => {
    const map = sourceMap();
    const { createBlockSourceLocator, resolveSourceLocator } = await sourceLocatorContract();
    const locator = createBlockSourceLocator(map, 'paragraph-1', { charRange: { start: 0, end: 8 } });

    expect(resolveSourceLocator(map, locator)).toMatchObject({ id: 'paragraph-1', kind: 'paragraph' });
    expect(() => resolveSourceLocator(map, { ...locator as object, blockId: undefined })).toThrow(/blockId/);
    expect(() => resolveSourceLocator(map, { ...locator as object, artifactId: 'artifact-2' })).toThrow(/artifactId/);
    expect(() => resolveSourceLocator(map, { ...locator as object, contentHash: 'b'.repeat(64) })).toThrow(/contentHash/);
    expect(() => resolveSourceLocator(map, { ...locator as object, blockId: 'missing' })).toThrow(/blockId/);
    expect(() => resolveSourceLocator(map, { ...locator as object, boundingBox: { x: 1, y: 2, width: 3, height: 4 } })).toThrow(/boundingBox/);
    expect(() => resolveSourceLocator(map, { ...locator as object, codeRange: { commit: 'abc1234', path: 'src/model.py', startLine: 4, endLine: 9 } })).toThrow(/codeRange/);
    expect(() => resolveSourceLocator(map, { artifactId: 'artifact-1', contentHash: 'a'.repeat(64), codeRange: { commit: 'abc1234', path: 'src/model.py', startLine: 4, endLine: 9 } })).toThrow(/codeRange/);
  });

  it('canonicalizes uppercase map and locator hashes before resolution', async () => {
    const map = sourceMap();
    map.contentHash = 'A'.repeat(64);
    const { createBlockSourceLocator, resolveSourceLocator, validateSourceLocator } = await sourceLocatorContract();
    const locator = createBlockSourceLocator(map, 'paragraph-1');

    expect(locator).toMatchObject({ contentHash: 'a'.repeat(64) });
    expect(validateSourceLocator({ ...(locator as object), contentHash: 'A'.repeat(64) }))
      .toMatchObject({ contentHash: 'a'.repeat(64) });
    expect(resolveSourceLocator(map, { ...(locator as object), contentHash: 'A'.repeat(64) }))
      .toMatchObject({ id: 'paragraph-1' });
  });

  it('rejects invalid map-derived selections', async () => {
    const map = sourceMap();
    const { createBlockSourceLocator, createTableCellSourceLocator } = await sourceLocatorContract();

    expect(() => createBlockSourceLocator(map, 'paragraph-1', { charRange: { start: 0, end: 99 } })).toThrow(/charRange/);
    expect(() => createBlockSourceLocator(map, 'figure-1', { charRange: { start: 0, end: 1 } })).toThrow(/text/);
    expect(() => createTableCellSourceLocator(map, 'figure-1', { sheet: 'Evidence', row: 2, column: 2 })).toThrow(/table/);
  });

  it('validates virtual table coordinates and the XLSX sheet heading', async () => {
    const xlsx = structuredTableSourceMap();
    const valueBlock = xlsx.pages[0]!.blocks.find((block) => block.text === '42')!;
    const { createTableCellSourceLocator, resolveSourceLocator } = await sourceLocatorContract();
    const locator = createTableCellSourceLocator(xlsx, valueBlock.id, {
      sheet: 'Evidence', row: 2, column: 2,
    });

    expect(resolveSourceLocator(xlsx, locator)).toMatchObject({ id: valueBlock.id });
    expect(() => resolveSourceLocator(xlsx, {
      ...locator as object, tableCell: { sheet: 'Evidence', row: 2, column: 1 },
    })).toThrow(/tableCell/);
    expect(() => createTableCellSourceLocator(xlsx, valueBlock.id, {
      sheet: 'Evidence', row: 3, column: 2,
    })).toThrow(/tableCell/);
  });

  it('keeps physical table locators bound only to their block and bounding box', async () => {
    const map = sourceMap();
    const { createTableCellSourceLocator, resolveSourceLocator } = await sourceLocatorContract();
    const locator = createTableCellSourceLocator(map, 'table-1', { sheet: 'Evidence', row: 99, column: 99 });

    expect(resolveSourceLocator(map, locator)).toMatchObject({ id: 'table-1', kind: 'table' });
  });

  it('round-trips strict locators and rejects malformed JSON payloads', async () => {
    const map = sourceMap();
    const { createBlockSourceLocator, createTableCellSourceLocator, createCodeSourceLocator, serializeSourceLocator, deserializeSourceLocator, validateSourceLocator } = await sourceLocatorContract();
    const locators = [
      createBlockSourceLocator(map, 'paragraph-1', { charRange: { start: 0, end: 8 } }),
      createBlockSourceLocator(map, 'figure-1'),
      createTableCellSourceLocator(map, 'table-1', { sheet: 'Evidence', row: 2, column: 2 }),
      createCodeSourceLocator('artifact-1', 'a'.repeat(64), { commit: 'abc1234', path: 'src/model.py', startLine: 4, endLine: 9 }),
    ];

    for (const locator of locators) expect(deserializeSourceLocator(serializeSourceLocator(locator))).toEqual(validateSourceLocator(locator));
    expect(() => deserializeSourceLocator(JSON.stringify({ ...locators[0] as object, providerPayload: {} }))).toThrow(/unknown field/);
    expect(() => createCodeSourceLocator('artifact-1', 'a'.repeat(64), { commit: 'abc1234', path: 'src/model.py', startLine: 9, endLine: 4 })).toThrow(/codeRange/);
    expect(() => deserializeSourceLocator(`${serializeSourceLocator(locators[0])}${' '.repeat(12_000)}`)).toThrow(/limit_exceeded/);
  });

  it('serializes a canonical snapshot instead of caller toJSON hooks', async () => {
    const { serializeSourceLocator, deserializeSourceLocator } = await sourceLocatorContract();
    const locator = {
      artifactId: 'artifact-1',
      contentHash: 'a'.repeat(64),
      codeRange: { commit: 'abc1234', path: 'src/model.py', startLine: 4, endLine: 9 },
    };
    Object.defineProperty(locator, 'toJSON', { enumerable: false, value: () => ({ providerPayload: 'root-hook' }) });
    Object.defineProperty(locator.codeRange, 'toJSON', { enumerable: false, value: () => ({ providerPayload: 'nested-hook' }) });

    const json = serializeSourceLocator(locator);

    expect(json).not.toContain('providerPayload');
    expect(deserializeSourceLocator(json)).toEqual({
      artifactId: 'artifact-1', contentHash: 'a'.repeat(64),
      codeRange: { commit: 'abc1234', path: 'src/model.py', startLine: 4, endLine: 9 },
    });
  });

  it('serializes safely when Object.prototype is polluted with toJSON', async () => {
    const { serializeSourceLocator, deserializeSourceLocator } = await sourceLocatorContract();
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
    Object.defineProperty(Object.prototype, 'toJSON', {
      configurable: true,
      value: () => ({ providerPayload: 'global-hook', content: 'x'.repeat(20_000) }),
    });

    try {
      const json = serializeSourceLocator({
        artifactId: 'artifact-1',
        contentHash: 'a'.repeat(64),
        codeRange: { commit: 'abc1234', path: 'src/model.py', startLine: 4, endLine: 9 },
      });
      expect(json).not.toContain('providerPayload');
      expect(deserializeSourceLocator(json)).toEqual({
        artifactId: 'artifact-1', contentHash: 'a'.repeat(64),
        codeRange: { commit: 'abc1234', path: 'src/model.py', startLine: 4, endLine: 9 },
      });
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'toJSON', previous);
      else delete (Object.prototype as { toJSON?: unknown }).toJSON;
    }
  });
});
