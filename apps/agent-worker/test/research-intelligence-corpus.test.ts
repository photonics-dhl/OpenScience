import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import { buildGateway, createWorkerParserCascade } from '../src/index';
import { sourceMapToManuscriptText } from '../src/extractor';
import { TRANSITION_PARSER_METADATA } from '../src/parser-job-isolation';
import { createParserSelfTestFixtures } from '../src/parser-self-test';
import {
  buildCurrentParserBaseline,
  buildResearchIntelligenceExport,
  buildResearchIntelligenceManifest,
  parseResearchCorpusCase,
  RESEARCH_INTELLIGENCE_CORPUS,
} from './support/research-intelligence-corpus';

const manifestPath = new URL('../../../test/research-intelligence/manifest.json', import.meta.url);
const baselinePath = new URL('../../../test/research-intelligence/out/current-parser.json', import.meta.url);

describe('research-intelligence fixture contract', () => {
  it('returns fresh deterministic copies', () => {
    const first = createParserSelfTestFixtures();
    const second = createParserSelfTestFixtures();

    expect(first.pdf).not.toBe(second.pdf);
    expect(first.docx).not.toBe(second.docx);
    expect(createHash('sha256').update(first.pdf).digest('hex'))
      .toBe(createHash('sha256').update(second.pdf).digest('hex'));
    expect(createHash('sha256').update(first.docx).digest('hex'))
      .toBe(createHash('sha256').update(second.docx).digest('hex'));
    expect(createHash('sha256').update(first.scanPdf).digest('hex'))
      .toBe('b327e6fece61a3e5bd52842250c51012b7672d81ff3dd4f11107b0e4aee6d2e0');
    expect(RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === 'scan-pdf-image-only')?.content)
      .toEqual(first.scanPdf);
  });
});

describe('research-intelligence corpus contract', () => {
  it('routes corpus Markdown and scan OCR through canonical cascade statuses without candidate fallback', async () => {
    const markdown = RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === 'markdown-mixed')!;
    const scan = RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === 'scan-png-empty')!;
    const parserJobAdapter = vi.fn(async (request) => ({
      schemaVersion: 2 as const,
      parser: TRANSITION_PARSER_METADATA,
      pages: [{
        page: 1, width: 1000, height: 24,
        blocks: request.mediaType === 'image/png' ? [] : [{
          kind: 'paragraph' as const, text: 'unexpected',
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, confidence: 1,
        }],
      }],
      warnings: [],
    }));
    const ocr = vi.fn();
    const cascade = createWorkerParserCascade({ ocr } as never, parserJobAdapter);
    const authorization = {
      trustedAuthorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: false,
    };
    const parse = (corpusCase: typeof markdown, mediaType: string) => cascade({
      artifactId: corpusCase.id,
      contentHash: createHash('sha256').update(corpusCase.content).digest('hex'),
      content: corpusCase.content,
      mediaType,
    }, authorization);

    const markdownResult = await parse(markdown, 'text/markdown');
    const scanResult = await parse(scan, 'image/png');

    expect(markdownResult.status).toBe('succeeded');
    expect(markdownResult.status === 'succeeded' && sourceMapToManuscriptText(markdownResult.sourceMap))
      .toContain(markdown.expectedText);
    expect(scanResult.status).toBe('needs_review');
    expect(parserJobAdapter).toHaveBeenCalledTimes(1);
    expect(ocr).not.toHaveBeenCalled();
  });

  it('hard-disables the Vision provider in production even when env and policy request enablement', async () => {
    const scan = RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === 'scan-png-empty')!;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: 'candidate text', base_resp: { status_code: 0 },
    }), { status: 200 }));
    const gateway = buildGateway({
      NODE_ENV: 'production',
      MINIMAX_API_KEY: 'test-key',
      MINIMAX_VISION_ENABLED: 'true',
      MINIMAX_VISION_USD_MICROS_PER_PAGE: '1',
      MINIMAX_VISION_PRICING_VERSION: 'test-v1',
      MINIMAX_VISION_PRICING_EFFECTIVE_DATE: '2026-08-28',
      MINIMAX_VISION_SERVICE_TIER: 'test',
    }, fetchMock as never, undefined, async () => true);

    const result = await gateway.ocr({
      authorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'actor-1' },
      source: {
        artifactId: scan.id,
        documentSha256: createHash('sha256').update(scan.content).digest('hex'),
      },
      pages: [{
        pageNumber: 1, mediaType: 'image/png', bytes: scan.content,
        width: 1, height: 1, selectionReason: 'low_confidence',
      }],
    });

    expect(result.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('covers the Taskmaster fixture matrix with locators and unique hashes', () => {
    const requiredFeatures = [
      'native_text',
      'scan',
      'dual_column',
      'table',
      'formula',
      'references',
      'docx',
      'markdown',
      'tex',
      'csv',
      'xlsx',
      'notebook',
      'code',
    ];
    const features = RESEARCH_INTELLIGENCE_CORPUS.flatMap(({ features: itemFeatures }) => itemFeatures);

    expect(RESEARCH_INTELLIGENCE_CORPUS.length).toBe(16);
    expect(new Set(RESEARCH_INTELLIGENCE_CORPUS.map(({ id }) => id)).size)
      .toBe(RESEARCH_INTELLIGENCE_CORPUS.length);
    expect(features).toEqual(expect.arrayContaining(requiredFeatures));
    expect(RESEARCH_INTELLIGENCE_CORPUS.every(({ rights }) => rights === 'self-authored')).toBe(true);
    expect(RESEARCH_INTELLIGENCE_CORPUS.every(({ expectedLocators }) => (
      expectedLocators.length > 0
    ))).toBe(true);

    const hashes = RESEARCH_INTELLIGENCE_CORPUS.map(({ content }) => (
      createHash('sha256').update(content).digest('hex')
    ));
    expect(new Set(hashes).size).toBe(RESEARCH_INTELLIGENCE_CORPUS.length);
    expect(hashes.every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);

    const xlsx = RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === 'table-xlsx-en');
    expect(xlsx?.content.readUInt32LE(0)).toBe(0x04034b50);
    expect(xlsx?.content.readUInt32LE((xlsx?.content.length ?? 22) - 22)).toBe(0x06054b50);
    expect(xlsx?.content.includes(Buffer.from('xl/worksheets/sheet1.xml'))).toBe(true);

    const notebook = RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === 'notebook-en');
    expect(JSON.parse(notebook?.content.toString('utf8') ?? '{}')).toMatchObject({ nbformat: 4 });

    const scannedPdf = RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === 'scan-pdf-image-only');
    expect(scannedPdf?.expectedLocators).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'page-text', quote: 'PULSE 42 FS' }),
    ]));
    for (const id of ['table-pdf-en', 'formula-pdf-en', 'references-pdf-en']) {
      const layoutCase = RESEARCH_INTELLIGENCE_CORPUS.find((item) => item.id === id);
      expect(layoutCase?.filename.endsWith('.pdf'), id).toBe(true);
      expect(layoutCase?.expectedLocators).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'page-text-order' }),
        expect.objectContaining({ kind: 'page-region-text' }),
      ]));
    }
    expect(buildResearchIntelligenceManifest()).toMatchObject({
      schemaVersion: 2,
      locatorContract: {
        indexBase: 1,
        bboxOrder: ['x0', 'y0', 'x1', 'y1'],
        coordinateSpace: 'fixture-native',
      },
    });
    const manifestCases = buildResearchIntelligenceManifest().cases;
    expect(manifestCases.every(({ filename }) => (
      typeof filename === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(filename)
    ))).toBe(true);
    expect(manifestCases.map(({ filename }) => filename).sort()).toEqual(
      RESEARCH_INTELLIGENCE_CORPUS.map(({ filename }) => filename).sort(),
    );
  });

  it('builds a content-addressed export without absolute paths', () => {
    const exported = buildResearchIntelligenceExport();

    expect(exported.files).toHaveLength(RESEARCH_INTELLIGENCE_CORPUS.length);
    expect(exported.files.map(({ filename }) => filename).sort()).toEqual(
      RESEARCH_INTELLIGENCE_CORPUS.map(({ filename }) => filename).sort(),
    );
    for (const file of exported.files) {
      const manifestCase = exported.manifest.cases.find(({ filename }) => filename === file.filename);
      expect(manifestCase?.sha256).toBe(createHash('sha256').update(file.content).digest('hex'));
    }
    expect(JSON.stringify(exported.manifest)).not.toContain(process.cwd());
  });

  it('keeps the tracked manifest content stable across checkout line endings', async () => {
    const expected = `${JSON.stringify(buildResearchIntelligenceManifest(), null, 2)}\n`;
    if (process.env.WRITE_RESEARCH_INTELLIGENCE_MANIFEST === '1') {
      await mkdir(new URL('../../../test/research-intelligence/', import.meta.url), { recursive: true });
      await writeFile(manifestPath, expected, 'utf8');
    }

    const tracked = await readFile(manifestPath, 'utf8');
    expect(tracked.replaceAll('\r\n', '\n')).toBe(expected);
  });

  it('matches the current parser status and expected text contract', async () => {
    for (const corpusCase of RESEARCH_INTELLIGENCE_CORPUS) {
      const parsed = await parseResearchCorpusCase(corpusCase);
      expect(parsed.status, corpusCase.id).toBe(corpusCase.expectedCurrentStatus);
      if (corpusCase.expectedText) {
        expect(parsed.status, corpusCase.id).toBe('ready');
        expect(parsed.status === 'ready' && parsed.text.includes(corpusCase.expectedText), corpusCase.id).toBe(true);
      }
    }
  }, 30_000);

  it('writes a bounded current-parser baseline report', async () => {
    const report = await buildCurrentParserBaseline();

    expect(report).toMatchObject({
      schemaVersion: 1,
      runtime: 'current-agent-worker',
      cases: expect.arrayContaining([
        expect.objectContaining({
          id: 'native-pdf-en',
          status: 'ready',
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({ id: 'scan-png-empty', status: 'needs_review' }),
      ]),
    });
    expect(report.cases).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'scan-pdf-image-only',
        status: 'needs_review',
        textMatched: undefined,
      }),
    ]));
    const allowedCaseKeys = new Set([
      'id',
      'contentHash',
      'status',
      'reason',
      'textMatched',
      'elapsedMs',
      'rssDeltaBytes',
    ]);
    expect(report.cases.every((item) => (
      Object.keys(item).every((key) => allowedCaseKeys.has(key))
    ))).toBe(true);
    expect(JSON.stringify(report)).not.toContain('OpenScience evidence document');
    expect(JSON.stringify(report)).not.toContain(process.cwd());

    await mkdir(new URL('../../../test/research-intelligence/out/', import.meta.url), { recursive: true });
    await writeFile(baselinePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }, 30_000);
});
