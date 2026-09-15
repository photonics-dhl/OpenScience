import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ pages: [] as Array<Record<string, unknown>> }));

vi.mock('node:module', () => ({
  createRequire: () => () => ({
    PDFParse: class {
      async load() {
        return {
          numPages: runtime.pages.length,
          getPage: async (pageNumber: number) => runtime.pages[pageNumber - 1],
        };
      }

      async destroy() {}
    },
  }),
}));

import { SafeParserWarningCode } from '../src/parsers/job-protocol';
import { parseStructuredPdfResult } from '../src/parsers/native-pdf-text-items';
import { createTextExtractor } from '../src/parsers/text-extractor';

const viewport = { width: 612, height: 792, transform: [1, 0, 0, -1, 0, 792] };

function item(str: string, width: number, x = 72, fontName = 'g_regular') {
  return { str, width, height: 10, transform: [10, 0, 0, 10, x, 700], fontName, hasEOL: false };
}

function page(items: ReturnType<typeof item>[], certifiedNotEquals = false) {
  return {
    getViewport: () => viewport,
    getTextContent: async () => ({ items }),
    getOperatorList: vi.fn(async () => certifiedNotEquals ? ({
      fnArray: [37, 40, 44, 37, 40, 44],
      argsArray: [
        ['g_cmsy', 10], [0, 0], [[{
          originalCharCode: 0x36, unicode: '6', fontChar: '\ue008', width: 0, isSpace: false,
        }]],
        ['g_equals', 10], [0, 0], [[{
          originalCharCode: 0x3d, unicode: '=', width: 777.8, isSpace: false,
        }]],
      ],
    }) : ({ fnArray: [], argsArray: [] })),
    commonObjs: {
      get: (fontName: string) => fontName === 'g_cmsy'
        ? {
          name: 'ABCDEF+CMSY10', missingFile: false, vertical: false,
          defaultWidth: 0, fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
        }
        : { name: 'CMR10', missingFile: false, vertical: false },
    },
    cleanup: vi.fn(),
  };
}

describe('native PDF text items', () => {
  beforeEach(() => { runtime.pages = []; });

  it('certifies a CMSY10 zero-advance negation overlay and composes it with same-origin equals', async () => {
    runtime.pages = [
      page([item('healthy page one', 90)]),
      page([
        item('scientific relation: ', 100),
        item('6', 0, 234.205, 'g_cmsy'),
        item(' ', 3, 234.205, 'g_cmsy'),
        item('=', 8.48509798, 234.205, 'g_equals'),
        item('0', 6, 245.848),
      ], true),
      page([item('healthy page three', 100)]),
    ];

    const result = await parseStructuredPdfResult(Buffer.from('%PDF-1.7'));

    expect(result.pages).toHaveLength(3);
    expect(result.pages[0]?.blocks.map(({ text }) => text)).toEqual(['healthy page one']);
    expect(result.pages[1]?.blocks.map(({ text }) => text)).toEqual(['scientific relation: ', '≠', '0']);
    expect(result.pages[1]?.blocks[1]?.boundingBox).toMatchObject({ x: 234.205, y: 82, height: 10 });
    expect(result.pages[1]?.blocks[1]?.boundingBox.width).toBeCloseTo(8.48509798, 10);
    expect(result.pages[2]?.blocks.map(({ text }) => text)).toEqual(['healthy page three']);
    expect(result.warnings).toEqual([]);
  });

  it('fails only the affected page closed when the zero-advance overlay is not certified', async () => {
    runtime.pages = [
      page([item('healthy page one', 90)]),
      page([item('6', 0, 234.205), item('=', 8.48509798, 234.205)]),
      page([item('healthy page three', 100)]),
    ];

    const result = await parseStructuredPdfResult(Buffer.from('%PDF-1.7'));

    expect(result.pages[0]?.blocks).toHaveLength(1);
    expect(result.pages[1]).toEqual({ page: 2, width: 612, height: 792, blocks: [] });
    expect(result.pages[2]?.blocks).toHaveLength(1);
    expect(result.warnings).toEqual([SafeParserWarningCode.PARTIAL_RESULT]);
  });

  it('does not reinterpret an ordinary positive-width digit six', async () => {
    const healthyPage = page([
      item('6', 6, 234.205, 'g_cmsy'),
      item('=', 8.48509798, 234.205, 'g_equals'),
    ], true);
    runtime.pages = [healthyPage];

    const result = await parseStructuredPdfResult(Buffer.from('%PDF-1.7'));

    expect(result.pages[0]?.blocks.map(({ text }) => text)).toEqual(['6', '=']);
    expect(result.warnings).toEqual([]);
    expect(healthyPage.getOperatorList).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong origin', [
      item('6', 0, 234.205, 'g_cmsy'),
      item('=', 8.48509798, 235.205, 'g_equals'),
    ]],
    ['non-adjacent nonblank item', [
      item('6', 0, 234.205, 'g_cmsy'),
      item('x', 5, 234.205),
      item('=', 8.48509798, 234.205, 'g_equals'),
    ]],
    ['ambiguous extra overlay', [
      item('6', 0, 234.205, 'g_cmsy'),
      item('=', 8.48509798, 234.205, 'g_equals'),
      item('6', 0, 300, 'g_cmsy'),
      item('=', 8.48509798, 300, 'g_equals'),
    ]],
  ])('fails the page closed for a certified operator with %s', async (_case, items) => {
    runtime.pages = [page(items, true)];

    const result = await parseStructuredPdfResult(Buffer.from('%PDF-1.7'));

    expect(result.pages[0]?.blocks).toEqual([]);
    expect(result.warnings).toEqual([SafeParserWarningCode.PARTIAL_RESULT]);
  });

  it('does not compose across whitespace carrying an end-of-line boundary', async () => {
    const lineBreak = { ...item(' ', 3, 234.205, 'g_cmsy'), hasEOL: true };
    runtime.pages = [page([
      item('6', 0, 234.205, 'g_cmsy'),
      lineBreak,
      item('=', 8.48509798, 234.205, 'g_equals'),
    ], true)];

    const result = await parseStructuredPdfResult(Buffer.from('%PDF-1.7'));

    expect(result.pages[0]?.blocks).toEqual([]);
    expect(result.warnings).toEqual([SafeParserWarningCode.PARTIAL_RESULT]);
  });

  it.each(['wrong fontChar', 'wrong CMSY matrix', 'missing equals font'])('%s fails closed', async (failure) => {
    const candidatePage = page([
      item('6', 0, 234.205, 'g_cmsy'),
      item('=', 8.48509798, 234.205, 'g_equals'),
    ], true);
    if (failure === 'wrong fontChar') {
      const operators = await candidatePage.getOperatorList();
      ((operators.argsArray[2] as Array<Array<Record<string, unknown>>>)[0]![0]!).fontChar = '\ue009';
      candidatePage.getOperatorList.mockResolvedValue(operators);
    } else if (failure === 'wrong CMSY matrix') {
      candidatePage.commonObjs.get = (fontName: string) => fontName === 'g_cmsy'
        ? {
          name: 'ABCDEF+CMSY10', missingFile: false, vertical: false,
          defaultWidth: 1, fontMatrix: [0.002, 0, 0, 0.001, 0, 0],
        }
        : { name: 'CMR10', missingFile: false, vertical: false };
    } else {
      candidatePage.commonObjs.get = (fontName: string) => fontName === 'g_cmsy'
        ? {
          name: 'ABCDEF+CMSY10', missingFile: false, vertical: false,
          defaultWidth: 0, fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
        }
        : { name: 'CMR10', missingFile: true, vertical: false };
    }
    runtime.pages = [candidatePage];

    const result = await parseStructuredPdfResult(Buffer.from('%PDF-1.7'));

    expect(result.pages[0]?.blocks).toEqual([]);
    expect(result.warnings).toEqual([SafeParserWarningCode.PARTIAL_RESULT]);
  });

  it('fails closed when the equals item transform basis differs from the overlay', async () => {
    const equals = item('=', 8.48509798, 234.205, 'g_equals');
    equals.transform = [9, 0, 0, 10, 234.205, 700];
    runtime.pages = [page([item('6', 0, 234.205, 'g_cmsy'), equals], true)];

    const result = await parseStructuredPdfResult(Buffer.from('%PDF-1.7'));

    expect(result.pages[0]?.blocks).toEqual([]);
    expect(result.warnings).toEqual([SafeParserWarningCode.PARTIAL_RESULT]);
  });

  it('monotonically consumes two independently certified not-equals pairs', async () => {
    const candidatePage = page([
      item('6', 0, 234.205, 'g_cmsy'), item('=', 8.48509798, 234.205, 'g_equals'),
      item('6', 0, 300, 'g_cmsy'), item('=', 8.48509798, 300, 'g_equals'),
    ], true);
    const operators = await candidatePage.getOperatorList();
    candidatePage.getOperatorList.mockResolvedValue({
      fnArray: [...operators.fnArray, ...operators.fnArray],
      argsArray: [...operators.argsArray, ...operators.argsArray],
    });
    runtime.pages = [candidatePage];

    const result = await parseStructuredPdfResult(Buffer.from('%PDF-1.7'));

    expect(result.pages[0]?.blocks.map(({ text }) => text)).toEqual(['≠', '≠']);
    expect(result.warnings).toEqual([]);
  });

  it('does not turn the block-count resource guard into a recoverable page fallback', async () => {
    runtime.pages = [page([
      item('6', 0),
      ...Array.from({ length: 10_000 }, (_, index) => item(`item-${index}`, 20)),
    ])];

    await expect(parseStructuredPdfResult(Buffer.from('%PDF-1.7')))
      .rejects.toThrow('PDF text item limit exceeded');
  });

  it('does not swallow unrelated PDF runtime failures', async () => {
    runtime.pages = [{
      getViewport: () => viewport,
      getTextContent: async () => { throw new Error('runtime decoder failed'); },
      getOperatorList: vi.fn(),
      commonObjs: { get: vi.fn() },
      cleanup: vi.fn(),
    }];

    await expect(parseStructuredPdfResult(Buffer.from('%PDF-1.7')))
      .rejects.toThrow('runtime decoder failed');
  });

  it('keeps the document-wide operator traversal budget fatal', async () => {
    const candidatePage = page([item('6', 0, 234.205, 'g_cmsy')], true);
    candidatePage.getOperatorList.mockResolvedValue({
      fnArray: new Array(100_001).fill(44),
      argsArray: new Array(100_001).fill([]),
    });
    runtime.pages = [candidatePage];

    await expect(parseStructuredPdfResult(Buffer.from('%PDF-1.7')))
      .rejects.toThrow('PDF operator limit exceeded');
  });

  it('preserves native fidelity review when every affected page is empty', async () => {
    const content = Buffer.from('%PDF-1.7');
    const extractor = createTextExtractor({
      pdf: async () => ({
        schemaVersion: 2,
        parser: { name: 'pdf-parse-pdfjs-text-items', version: '2.4.5+pdfjs-dist.5.4.296' },
        pages: [{ page: 1, width: 612, height: 792, blocks: [] }],
        warnings: [SafeParserWarningCode.PARTIAL_RESULT],
      }),
    });

    const result = await extractor.parse({
      artifactId: 'all-affected-pdf',
      contentHash: 'a'.repeat(64),
      content,
      mediaType: 'application/pdf',
    });

    expect(result.status).toBe('needs_review');
    if (result.status === 'needs_review') {
      expect(result.reasons).toEqual(['native PDF text fidelity requires review']);
    }
  });
});
