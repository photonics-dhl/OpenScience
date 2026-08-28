import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { DocumentSourceMap } from '@openscience/domain';

import {
  CANONICAL_CORPUS_MANIFEST_SHA256,
  buildFinalAcceptanceReport,
  cleanupAcceptanceRun,
  classifyAcceptanceHandlerResult,
  createAcceptanceGatewaySeam,
  deriveFixedAcceptancePaths,
  parseCanonicalManifest,
  prepareAcceptancePaths,
  readBoundedAcceptanceJson,
  reproduceAcceptanceLocator,
  validateAcceptanceDraft,
  validateRuntimeEvidence,
  writeAtomicAcceptanceReport,
} from '../src/parser-acceptance-contract';

const canonicalManifest = readFileSync(new URL('../../../test/research-intelligence/manifest.json', import.meta.url));
const canonicalIds = [
  'corrupt-pdf-en', 'dual-column-pdf-en', 'formula-pdf-en', 'markdown-mixed',
  'native-docx-en', 'native-pdf-en', 'notebook-en', 'python-code-en',
  'references-markdown-en', 'references-pdf-en', 'scan-pdf-image-only', 'scan-png-empty',
  'table-csv-mixed', 'table-pdf-en', 'table-xlsx-en', 'tex-formula-en',
];

const parser = { name: 'openscience-text-extractor', version: '1.0.0' };
const virtualParser = { name: 'openscience-virtual-page', version: 'openscience-virtual-page-v1' };

function sourceBlock(options: {
  id: string;
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  tesseract?: boolean;
  virtual?: boolean;
  layout?: boolean;
}) {
  const blockParser = options.tesseract
    ? { name: 'tesseract', version: '5.3.0' }
    : options.layout
      ? { name: 'normalized-layout-fixture', version: '2.0.0' }
      : parser;
  return {
    id: options.id,
    kind: 'paragraph' as const,
    text: options.text,
    boundingBox: {
      x: options.x ?? 0, y: options.y ?? 0,
      width: options.width ?? 1000, height: options.height ?? 24,
    },
    ...(options.tesseract ? { confidence: 0.97 } : {}),
    parser: blockParser,
    transformations: options.tesseract
      ? [{ stage: 'ocr' as const, processor: blockParser }]
      : options.layout
        ? [{ stage: 'detect_layout' as const, processor: blockParser }]
        : options.virtual === false
          ? [{ stage: 'extract_text' as const, processor: parser }]
          : [
        { stage: 'extract_text' as const, processor: parser },
        { stage: 'normalize' as const, processor: virtualParser },
      ],
  };
}

function sourceMap(contentHash: string, blocks: ReturnType<typeof sourceBlock>[], page = 1): DocumentSourceMap {
  return {
    artifactId: 'acceptance-artifact', contentHash, parser,
    pages: [{ page, width: 1000, height: 1000, blocks }],
  };
}

function validDraft() {
  const identities = [
    ['corrupt-pdf-en', 'needs_review', 0, 1],
    ['dual-column-pdf-en', 'succeeded', 5, 5],
    ['formula-pdf-en', 'succeeded', 2, 2],
    ['markdown-mixed', 'succeeded', 2, 2],
    ['native-docx-en', 'succeeded', 1, 1],
    ['native-pdf-en', 'succeeded', 1, 1],
    ['notebook-en', 'needs_review', 0, 1],
    ['python-code-en', 'needs_review', 0, 1],
    ['references-markdown-en', 'succeeded', 1, 1],
    ['references-pdf-en', 'succeeded', 2, 2],
    ['scan-pdf-image-only', 'succeeded', 2, 2],
    ['scan-png-empty', 'needs_review', 0, 1],
    ['table-csv-mixed', 'needs_review', 1, 1],
    ['table-pdf-en', 'succeeded', 3, 3],
    ['table-xlsx-en', 'needs_review', 1, 1],
    ['tex-formula-en', 'succeeded', 1, 1],
  ] as const;
  const manifest = parseCanonicalManifest(canonicalManifest);
  const cases = identities.map(([id, status, locatorMatches, locatorTotal], index) => ({
    id,
    contentHash: manifest.cases[index]!.sha256,
    status,
    handlerStatus: status === 'succeeded' ? 'completed' : 'needs_review',
    locatorMatches,
    locatorTotal,
    falseReady: false,
    elapsedMs: index + 1,
    stages: status === 'succeeded' ? [{
      parser: id === 'scan-pdf-image-only' ? 'tesseract' : 'v1-text-transition',
      version: id === 'scan-pdf-image-only' ? '5.3.0' : '2.0.0',
      confidence: id === 'scan-pdf-image-only' ? 0.97 : null,
      boundingBox: { x: 10, y: 20, width: 30, height: 40 },
      transformations: [{
        stage: id === 'scan-pdf-image-only' ? 'ocr' : 'extract_text',
        parser: id === 'scan-pdf-image-only' ? 'tesseract' : 'v1-text-transition',
        version: id === 'scan-pdf-image-only' ? '5.3.0' : '2.0.0',
      }],
    }] : [],
  }));
  return {
    schemaVersion: 2,
    sourceSha: 'a'.repeat(40),
    manifestSha256: CANONICAL_CORPUS_MANIFEST_SHA256,
    images: { worker: `sha256:${'b'.repeat(64)}`, parser: `sha256:${'c'.repeat(64)}` },
    runtimeProcess: { uid: 1000, gid: 1000, effectiveEnvCount: 0 },
    gatewayCalls: {
      structuredFake: 10, externalProvider: 0,
      forbidden: { complete: 0, ocr: 0, stream: 0, unknown: 0 },
    },
    summary: { falseReadyCount: 0, failed: 0, succeeded: 10, needsReview: 6, p50ElapsedMs: 8, p95ElapsedMs: 16 },
    cases,
  };
}

function validResources(draft = validDraft()) {
  const releaseRoot = `/opt/openscience-releases/${draft.sourceSha}`;
  const acceptanceRoot = `/opt/openscience-acceptance/document-parser/${draft.sourceSha}`;
  const runRoot = `${acceptanceRoot}/.run-${draft.sourceSha.slice(0, 12)}-1234`;
  const workerOutputRoot = `${runRoot}/worker-output`;
  const jobVolume = `openscience-parser-accept-jobs-${draft.sourceSha.slice(0, 12)}-1234`;
  const common = {
    user: '1000:1000', effectiveEnvCount: 0, networkMode: 'none', readOnlyRootfs: true,
    capDrop: ['ALL'], noNewPrivileges: true, nanoCpus: 2_000_000_000, pidsLimit: 64,
    tmpfsBytes: 67_108_864, jobVolumeBytes: 67_108_864,
  };
  const workerSampling = {
    source: 'host-cgroup-v2', clock: 'host-monotonic', cgroupVersion: 2, hostPid: 4123,
    cgroupPath: `/sys/fs/cgroup/system.slice/docker-${'d'.repeat(64)}.scope`,
    cgroupIdentity: '0:30:40123',
    samples: [
      { elapsedMs: 0, cpuUsageMicros: 12_345, memoryPeakBytes: 134_217_728, terminal: false },
      { elapsedMs: 200, cpuUsageMicros: 52_345, memoryPeakBytes: 268_435_456, terminal: true },
    ],
  };
  const parserSampling = {
    source: 'host-cgroup-v2', clock: 'host-monotonic', cgroupVersion: 2, hostPid: 4124,
    cgroupPath: `/sys/fs/cgroup/system.slice/docker-${'e'.repeat(64)}.scope`,
    cgroupIdentity: '0:30:40124',
    samples: [
      { elapsedMs: 0, cpuUsageMicros: 23_456, memoryPeakBytes: 67_108_864, terminal: false },
      { elapsedMs: 400, cpuUsageMicros: 63_456, memoryPeakBytes: 134_217_728, terminal: true },
    ],
  };
  const runtimeEntries = [
    { path: 'apps/agent-worker/dist/index.js', sha256: '3'.repeat(64) },
    { path: 'apps/agent-worker/dist/parser-acceptance-contract.js', sha256: '4'.repeat(64) },
    { path: 'apps/agent-worker/dist/parser-acceptance-runner.js', sha256: '5'.repeat(64) },
    { path: 'apps/agent-worker/dist/parser-job-isolation.js', sha256: '6'.repeat(64) },
    { path: 'apps/agent-worker/dist/parsers/text-extractor.js', sha256: '7'.repeat(64) },
    { path: 'packages/ai-gateway/dist/index.js', sha256: '8'.repeat(64) },
    { path: 'packages/domain/dist/index.js', sha256: '9'.repeat(64) },
  ];
  const runtimePayload = JSON.stringify({ schemaVersion: 1, entries: runtimeEntries });
  const runtimeGraph = {
    schemaVersion: 1,
    manifestSha256: createHash('sha256').update(runtimePayload).digest('hex'),
    entries: runtimeEntries,
  };
  return {
    build: {
      sourceSha: draft.sourceSha,
      runnerSha256: '1'.repeat(64),
      contractSha256: '2'.repeat(64),
      runtimeGraph,
    },
    worker: {
      ...common, containerId: 'd'.repeat(64), imageId: draft.images.worker,
      running: false, exitCode: 0,
      memoryBytes: 1_073_741_824, memorySwapBytes: 1_073_741_824,
      sampling: workerSampling, cumulativeCpuUsageMicros: 52_345,
      peakCpuQuotaPercent: 10, peakMemoryBytes: 268_435_456,
      mounts: [
        { type: 'volume', source: jobVolume, destination: '/parser-jobs', readOnly: false },
        { type: 'bind', source: releaseRoot, destination: '/opt/openscience', readOnly: true },
        { type: 'bind', source: `${acceptanceRoot}/corpus`, destination: '/acceptance-corpus', readOnly: true },
        { type: 'bind', source: workerOutputRoot, destination: '/acceptance-output', readOnly: false },
      ],
    },
    parser: {
      ...common, containerId: 'e'.repeat(64), imageId: draft.images.parser,
      running: true, exitCode: 0,
      memoryBytes: 536_870_912, memorySwapBytes: 536_870_912,
      sampling: parserSampling, cumulativeCpuUsageMicros: 63_456,
      peakCpuQuotaPercent: 5, peakMemoryBytes: 134_217_728,
      mounts: [{ type: 'volume', source: jobVolume, destination: '/parser-jobs', readOnly: false }],
    },
    maxima: {
      peakCpuQuotaPercent: 10, cumulativeCpuUsageMicros: 63_456,
      peakMemoryBytes: 268_435_456,
    },
  };
}

describe('Task 8 acceptance contract', () => {
  it('provides a dedicated strict contract boundary for the runner and launcher', async () => {
    await expect(import('../src/parser-acceptance-contract')).resolves.toHaveProperty('parseCanonicalManifest');
  });

  it('accepts only the byte-exact canonical schema-v2 corpus identity', () => {
    expect(CANONICAL_CORPUS_MANIFEST_SHA256).toBe('34b46c5405c7d2114183cfb8e3b938a392ddf1e43941fed0818f7a3ab3b7fae6');
    expect(parseCanonicalManifest(canonicalManifest).cases.map(({ id }) => id)).toEqual(canonicalIds);

    const duplicate = JSON.parse(canonicalManifest.toString('utf8'));
    duplicate.cases[1] = duplicate.cases[0];
    expect(() => parseCanonicalManifest(Buffer.from(JSON.stringify(duplicate)))).toThrow(/canonical manifest hash/i);

    const wrongFilename = JSON.parse(canonicalManifest.toString('utf8'));
    wrongFilename.cases[0].filename = '../corrupt.pdf';
    expect(() => parseCanonicalManifest(Buffer.from(JSON.stringify(wrongFilename)))).toThrow(/canonical manifest hash/i);
  });

  it('accepts only a complete hard-gate draft with exact calls, statuses, locators and provenance', () => {
    expect(validateAcceptanceDraft(validDraft())).toMatchObject({
      summary: { failed: 0, falseReadyCount: 0, succeeded: 10, needsReview: 6 },
      gatewayCalls: { structuredFake: 10, externalProvider: 0 },
    });
  });

  it('does not reproduce a file-level evidence locator from an empty corrupt-document source map', () => {
    const corruptHash = '75de1813b71e3d6612c90ea885ecbbcf5455b45ca6f8338503c047c91dd71ad9';
    expect(reproduceAcceptanceLocator(sourceMap(corruptHash, []), { kind: 'file' })).toBe(false);
    expect(reproduceAcceptanceLocator(sourceMap(corruptHash, [sourceBlock({
      id: 'recovered-evidence', text: 'Recovered evidence',
    })]), { kind: 'file' })).toBe(true);
  });

  it('binds line and paragraph quotes to their exact virtual coordinates', () => {
    const markdownHash = '66f861e5049bd0e33e68ae11aec6965928853e0c95c7a4c88a7f99c1f7497406';
    const docxHash = '9641d86b9ed1e3614b448ca4159d4943c11d9d08e8561d0ae01a8357c579ea3c';
    const line = { kind: 'line-text', line: 3, quote: 'OpenScience evidence supports' };
    const paragraph = { kind: 'paragraph-text', paragraph: 1, quote: 'OpenScience evidence document' };
    expect(reproduceAcceptanceLocator(sourceMap(markdownHash, [sourceBlock({
      id: 'line-3', text: 'OpenScience evidence supports exact locators.', y: 48,
    })]), line)).toBe(true);
    expect(reproduceAcceptanceLocator(sourceMap(markdownHash, [sourceBlock({
      id: 'line-4', text: 'OpenScience evidence supports exact locators.', y: 72,
    })]), line)).toBe(false);
    expect(reproduceAcceptanceLocator(sourceMap(docxHash, [sourceBlock({
      id: 'paragraph-1', text: 'OpenScience evidence document', y: 0,
    })]), paragraph)).toBe(true);
    expect(reproduceAcceptanceLocator(sourceMap(docxHash, [sourceBlock({
      id: 'paragraph-2', text: 'OpenScience evidence document', y: 24,
    })]), paragraph)).toBe(false);
    expect(reproduceAcceptanceLocator(sourceMap(docxHash, [sourceBlock({
      id: 'physical-paragraph-1', text: 'OpenScience evidence document', y: 0, virtual: false,
    })]), paragraph)).toBe(false);
  });

  it('requires geometry-capable provenance and meaningful physical-region intersection', () => {
    const hash = '84c2c268eab3dd978e4514c9042ed7f3e580e9a61d9e4f978c1697080aa0f913';
    const locator = {
      kind: 'page-region-text', page: 1, bbox: [0, 0, 306, 792], quote: 'Left claim',
    };
    expect(reproduceAcceptanceLocator(sourceMap(hash, [sourceBlock({
      id: 'layout-left', text: 'Left claim', x: 20, y: 100, width: 200, height: 40, layout: true,
    })]), locator)).toBe(true);
    expect(reproduceAcceptanceLocator(sourceMap(hash, [sourceBlock({
      id: 'layout-wrong-column', text: 'Left claim', x: 250, y: 100, width: 200, height: 40, layout: true,
    })]), locator)).toBe(false);
    expect(reproduceAcceptanceLocator(sourceMap(hash, [sourceBlock({
      id: 'layout-full-width', text: 'Left claim', x: 0, y: 100, width: 612, height: 40, layout: true,
    })]), locator)).toBe(false);
    expect(reproduceAcceptanceLocator(sourceMap(hash, [sourceBlock({
      id: 'transition-full-width', text: 'Left claim', x: 0, y: 100, width: 1000, height: 40, virtual: false,
    })]), locator)).toBe(false);
    expect(reproduceAcceptanceLocator(sourceMap(hash, [sourceBlock({
      id: 'unproven-physical-left', text: 'Left claim', x: 20, y: 100, width: 200, height: 40, virtual: false,
    })]), locator)).toBe(false);
  });

  it('reproduces ordered page quotes within one block without crossing block boundaries', () => {
    const hash = 'e2048391202205cffe5132331b85148d23109add51130ac280a817ef0f583a48';
    const locator = { kind: 'page-text-order', page: 1, quotes: ['Fitted signal', 'I(t) = I0 exp(-t/tau)'] };
    expect(reproduceAcceptanceLocator(sourceMap(hash, [sourceBlock({
      id: 'formula', text: 'Fitted signal\nI(t) = I0 exp(-t/tau)', y: 0,
    })]), locator)).toBe(true);
    expect(reproduceAcceptanceLocator(sourceMap(hash, [sourceBlock({
      id: 'reversed', text: 'I(t) = I0 exp(-t/tau)\nFitted signal', y: 0,
    })]), locator)).toBe(false);
    expect(reproduceAcceptanceLocator(sourceMap(hash, [
      sourceBlock({ id: 'left', text: 'Fitted sig', y: 0 }),
      sourceBlock({ id: 'right', text: 'nal\nI(t) = I0 exp(-t/tau)', y: 24 }),
    ]), locator)).toBe(false);
  });

  it('binds table quotes to the exact row, column and sheet geometry', () => {
    const markdownHash = '66f861e5049bd0e33e68ae11aec6965928853e0c95c7a4c88a7f99c1f7497406';
    const csvHash = 'e71f6e5c40db4f3e257ee99961e81b899c817a7b00ed2e03b9c055d537aefa20';
    const xlsxHash = 'c371bc99687ba51d51d4081f2ae09274f1a52b95839c543870008d9fc34f4b1f';
    const csv = { kind: 'table-cell', row: 2, column: 2, quote: '42' };
    const xlsx = { kind: 'table-cell', sheet: 'Evidence', row: 2, column: 2, quote: '42' };
    const markdown = sourceMap(markdownHash, [
      sourceBlock({ id: 'table-header', text: '| Metric | Value |', y: 72 }),
      sourceBlock({ id: 'table-separator', text: '| --- | --- |', y: 96 }),
      sourceBlock({ id: 'table-row', text: '| pulse | 42 fs |', y: 120 }),
    ]);
    expect(reproduceAcceptanceLocator(markdown, {
      kind: 'table-cell', row: 2, column: 2, quote: '42 fs',
    })).toBe(true);
    expect(reproduceAcceptanceLocator(sourceMap(markdownHash, [
      sourceBlock({ id: 'table-header', text: '| Metric | Value |', y: 72 }),
      sourceBlock({ id: 'table-separator', text: '| --- | --- |', y: 96 }),
      sourceBlock({ id: 'wrong-cell', text: '| 42 fs | pulse |', y: 120 }),
    ]), { kind: 'table-cell', row: 2, column: 2, quote: '42 fs' })).toBe(false);
    expect(reproduceAcceptanceLocator(sourceMap(csvHash, [sourceBlock({
      id: 'csv-r2-c2', text: '42', x: 500, y: 24, width: 500,
    })]), csv)).toBe(true);
    expect(reproduceAcceptanceLocator(sourceMap(csvHash, [sourceBlock({
      id: 'csv-r3-c1', text: '42', x: 0, y: 48, width: 500,
    })]), csv)).toBe(false);
    const workbook = sourceMap(xlsxHash, [
      sourceBlock({ id: 'sheet-name', text: 'Evidence', y: 0 }),
      sourceBlock({ id: 'xlsx-r2-c2', text: '42', x: 500, y: 48, width: 500 }),
    ]);
    expect(reproduceAcceptanceLocator(workbook, xlsx)).toBe(true);
    expect(reproduceAcceptanceLocator(sourceMap(xlsxHash, [
      sourceBlock({ id: 'wrong-sheet', text: 'Other', y: 0 }),
      sourceBlock({ id: 'xlsx-r2-c2', text: '42', x: 500, y: 48, width: 500 }),
    ]), xlsx)).toBe(false);
    expect(reproduceAcceptanceLocator(sourceMap(xlsxHash, [
      sourceBlock({ id: 'containing-sheet', text: 'Evidence Archive', y: 0 }),
      sourceBlock({ id: 'xlsx-r2-c2', text: '42', x: 500, y: 48, width: 500 }),
    ]), xlsx)).toBe(false);
    expect(reproduceAcceptanceLocator(sourceMap(xlsxHash, [
      sourceBlock({ id: 'sheet-name', text: 'Evidence', y: 0 }),
      sourceBlock({ id: 'xlsx-r3-c1', text: '42', x: 0, y: 72, width: 500 }),
    ]), xlsx)).toBe(false);
  });

  it('binds a scanned-PDF quote and region to the matching Tesseract block', () => {
    const scanHash = 'b327e6fece61a3e5bd52842250c51012b7672d81ff3dd4f11107b0e4aee6d2e0';
    const quote = { kind: 'page-text', page: 1, quote: 'PULSE 42 FS' };
    const region = { kind: 'page-region', page: 1, bbox: [72, 600, 432, 645] };
    const wrong = sourceMap(scanHash, [
      sourceBlock({ id: 'native-quote', text: 'PULSE 42 FS', x: 72, y: 600, width: 360, height: 45 }),
      sourceBlock({ id: 'ocr-other', text: 'OTHER', x: 500, y: 700, width: 100, height: 20, tesseract: true }),
    ]);
    expect(reproduceAcceptanceLocator(wrong, quote)).toBe(false);
    expect(reproduceAcceptanceLocator(wrong, region)).toBe(false);
    const correct = sourceMap(scanHash, [sourceBlock({
      id: 'ocr-quote', text: 'PULSE 42 FS', x: 72, y: 600, width: 360, height: 45, tesseract: true,
    })]);
    expect(reproduceAcceptanceLocator(correct, quote)).toBe(true);
    expect(reproduceAcceptanceLocator(correct, region)).toBe(true);
    const splitLine = sourceMap(scanHash, [
      sourceBlock({ id: 'ocr-pulse', text: 'PULSE', x: 76, y: 603, width: 155, height: 38, tesseract: true }),
      sourceBlock({ id: 'ocr-42', text: '42', x: 268, y: 602, width: 59, height: 38, tesseract: true }),
      sourceBlock({ id: 'ocr-fs', text: 'FS', x: 364, y: 604, width: 59, height: 38, tesseract: true }),
    ]);
    expect(reproduceAcceptanceLocator(splitLine, quote)).toBe(true);
    expect(reproduceAcceptanceLocator(splitLine, region)).toBe(true);
    const brokenLine = sourceMap(scanHash, [
      sourceBlock({ id: 'ocr-pulse', text: 'PULSE', x: 76, y: 603, width: 155, height: 38, tesseract: true }),
      sourceBlock({ id: 'ocr-42', text: '42', x: 268, y: 603, width: 59, height: 38, tesseract: true }),
      sourceBlock({ id: 'ocr-fs', text: 'FS', x: 364, y: 700, width: 59, height: 38, tesseract: true }),
    ]);
    expect(reproduceAcceptanceLocator(brokenLine, quote)).toBe(false);
    const distantSameLine = sourceMap(scanHash, [
      sourceBlock({ id: 'ocr-pulse', text: 'PULSE', x: 76, y: 603, width: 155, height: 38, tesseract: true }),
      sourceBlock({ id: 'ocr-42', text: '42', x: 800, y: 603, width: 59, height: 38, tesseract: true }),
      sourceBlock({ id: 'ocr-fs', text: 'FS', x: 896, y: 603, width: 59, height: 38, tesseract: true }),
    ]);
    expect(reproduceAcceptanceLocator(distantSameLine, quote)).toBe(false);
    const tallBoxBridge = sourceMap(scanHash, [
      sourceBlock({ id: 'ocr-pulse', text: 'PULSE', x: 76, y: 603, width: 155, height: 38, tesseract: true }),
      sourceBlock({ id: 'ocr-42', text: '42', x: 268, y: 550, width: 59, height: 200, tesseract: true }),
      sourceBlock({ id: 'ocr-fs', text: 'FS', x: 364, y: 700, width: 59, height: 38, tesseract: true }),
    ]);
    expect(reproduceAcceptanceLocator(tallBoxBridge, quote)).toBe(false);
  });

  it('builds a deterministic complete runtime manifest and rejects transitive output tampering', async () => {
    const contract = await import('../src/parser-acceptance-contract');
    expect(contract).toHaveProperty('buildAcceptanceRuntimeGraphManifest');
    expect(contract).toHaveProperty('verifyAcceptanceRuntimeGraphManifest');
    const buildManifest = Reflect.get(contract, 'buildAcceptanceRuntimeGraphManifest') as (
      releaseRoot: string,
    ) => Promise<{ entries: Array<{ path: string; sha256: string }> }>;
    const verifyManifest = Reflect.get(contract, 'verifyAcceptanceRuntimeGraphManifest') as (
      releaseRoot: string,
      manifest: unknown,
    ) => Promise<void>;
    const releaseRoot = await mkdtemp(join(tmpdir(), 'task8-runtime-graph-'));
    const outputs = [
      'apps/agent-worker/dist/index.js',
      'apps/agent-worker/dist/parser-acceptance-contract.js',
      'apps/agent-worker/dist/parser-acceptance-runner.js',
      'apps/agent-worker/dist/parser-job-isolation.js',
      'apps/agent-worker/dist/parsers/text-extractor.js',
      'packages/ai-gateway/dist/index.js',
      'packages/domain/dist/index.js',
    ];
    for (const [index, relative] of outputs.entries()) {
      const path = join(releaseRoot, ...relative.split('/'));
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, `module.exports = ${index};\n`);
    }

    const manifest = await buildManifest(releaseRoot);
    expect(manifest.entries.map(({ path }) => path)).toEqual(outputs);
    await expect(verifyManifest(releaseRoot, manifest)).resolves.toBeUndefined();
    for (const relative of [
      'apps/agent-worker/dist/index.js',
      'apps/agent-worker/dist/parser-job-isolation.js',
      'packages/domain/dist/index.js',
    ]) {
      const path = join(releaseRoot, ...relative.split('/'));
      const original = await readFile(path, 'utf8');
      await writeFile(path, `${original}// tampered\n`);
      await expect(verifyManifest(releaseRoot, manifest)).rejects.toThrow(/runtime graph|build output|identity/i);
      await writeFile(path, original);
    }
  });

  it('binds locator reproduction to the exact source identity', () => {
    const map = sourceMap('66f861e5049bd0e33e68ae11aec6965928853e0c95c7a4c88a7f99c1f7497406', [
      sourceBlock({ id: 'line-3', text: 'OpenScience evidence supports exact locators.', y: 48 }),
    ]);
    const reproduce = reproduceAcceptanceLocator as unknown as (
      source: DocumentSourceMap,
      locator: { kind: string; line: number; quote: string },
      identity: { artifactId: string; contentHash: string },
    ) => boolean;
    expect(reproduce(map, { kind: 'line-text', line: 3, quote: 'OpenScience evidence supports' }, {
      artifactId: map.artifactId, contentHash: map.contentHash,
    })).toBe(true);
    expect(reproduce(map, { kind: 'line-text', line: 3, quote: 'OpenScience evidence supports' }, {
      artifactId: 'wrong-artifact', contentHash: map.contentHash,
    })).toBe(false);
  });

  it.each([
    ['all handler failures', (draft: ReturnType<typeof validDraft>) => {
      draft.cases = draft.cases.map((item) => ({ ...item, status: 'failed' as const, handlerStatus: 'failed', failureStatus: 'injected' }));
    }, /status|handler failure/i],
    ['wrong fixture content hash', (draft: ReturnType<typeof validDraft>) => { draft.cases[0]!.contentHash = 'f'.repeat(64); }, /content hash/i],
    ['status mismatch', (draft: ReturnType<typeof validDraft>) => { draft.cases[1]!.status = 'needs_review'; }, /status mismatch/i],
    ['locator miss', (draft: ReturnType<typeof validDraft>) => { draft.cases[1]!.locatorMatches = 4; }, /locator/i],
    ['false ready', (draft: ReturnType<typeof validDraft>) => { draft.cases[1]!.falseReady = true; }, /false-ready/i],
    ['missing stage', (draft: ReturnType<typeof validDraft>) => { draft.cases[1]!.stages = []; }, /stage provenance/i],
    ['missing Tesseract provenance', (draft: ReturnType<typeof validDraft>) => { draft.cases[10]!.stages[0]!.parser = 'v1-text-transition'; }, /Tesseract provenance/i],
    ['hidden structured call', (draft: ReturnType<typeof validDraft>) => { draft.gatewayCalls.structuredFake = 11; }, /structured fake/i],
    ['forbidden OCR call', (draft: ReturnType<typeof validDraft>) => { draft.gatewayCalls.forbidden.ocr = 1; }, /forbidden gateway/i],
    ['missing runtime identity', (draft: ReturnType<typeof validDraft>) => { delete (draft as Partial<typeof draft>).runtimeProcess; }, /runtime process identity/i],
  ])('rejects $0', (_name, mutate, expected) => {
    const draft = validDraft();
    mutate(draft);
    expect(() => validateAcceptanceDraft(draft)).toThrow(expected);
  });

  it('requires independent, bounded worker/parser cgroup and effective topology evidence', () => {
    const draft = validDraft();
    const resources = validResources(draft);
    expect(validateRuntimeEvidence(resources, draft)).toMatchObject({
      worker: { cumulativeCpuUsageMicros: 52_345, peakCpuQuotaPercent: 10, peakMemoryBytes: 268_435_456 },
      parser: { cumulativeCpuUsageMicros: 63_456, peakCpuQuotaPercent: 5, peakMemoryBytes: 134_217_728 },
      maxima: { cumulativeCpuUsageMicros: 63_456, peakCpuQuotaPercent: 10, peakMemoryBytes: 268_435_456 },
    });
    expect(buildFinalAcceptanceReport(draft, resources)).toMatchObject({
      schemaVersion: 2, resources: { worker: { user: '1000:1000' }, parser: { effectiveEnvCount: 0 } },
    });
  });

  it('labels deterministic structured fakes separately and counts every forbidden gateway seam', async () => {
    const seam = createAcceptanceGatewaySeam({ schemaVersion: '0.1.0', fields: {} });
    await expect(seam.gateway.completeStructured()).resolves.toMatchObject({ schemaVersion: '0.1.0' });
    await expect(seam.gateway.ocr()).rejects.toThrow(/forbidden gateway seam/i);
    await expect((seam.gateway as Record<string, () => Promise<unknown>>).hiddenProvider()).rejects.toThrow(/forbidden gateway seam/i);
    expect(seam.snapshot()).toEqual({
      structuredFake: 1, externalProvider: 0,
      forbidden: { complete: 0, ocr: 1, stream: 0, unknown: 1 },
    });
  });

  it('accepts only exact sdf.extract success and needs-review handler result shapes', () => {
    const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
    const completed = {
      core: { schemaVersion: '0.1.0', ...Object.fromEntries(fields.map((field) => [field, ''])) },
      evidence: Object.fromEntries(fields.map((field) => [field, { quote: '', locator: '' }])),
      needsMoreInformation: fields,
    };
    expect(classifyAcceptanceHandlerResult(completed)).toBe('completed');
    expect(classifyAcceptanceHandlerResult({ status: 'needs_review', format: 'pdf', reason: 'corrupt' }))
      .toBe('needs_review');
    expect(() => classifyAcceptanceHandlerResult({ status: 'failed' })).toThrow(/handler result/i);
    expect(() => classifyAcceptanceHandlerResult({ ...completed, evidence: {} })).toThrow(/handler result/i);
    expect(() => classifyAcceptanceHandlerResult({
      ...completed, core: { ...completed.core, schemaVersion: '9.9.9' },
    })).toThrow(/handler result/i);
    expect(() => classifyAcceptanceHandlerResult('completed')).toThrow(/handler result/i);
  });

  it.each([
    ['missing parser resource', (resources: ReturnType<typeof validResources>) => { delete (resources as Partial<typeof resources>).parser; }, /parser resource/i],
    ['wrong fresh build identity', (resources: ReturnType<typeof validResources>) => { resources.build.sourceSha = 'f'.repeat(40); }, /build identity/i],
    ['missing complete runtime graph', (resources: ReturnType<typeof validResources>) => {
      delete (resources.build as Partial<typeof resources.build>).runtimeGraph;
    }, /runtime graph/i],
    ['missing transitive runtime output', (resources: ReturnType<typeof validResources>) => {
      resources.build.runtimeGraph.entries = resources.build.runtimeGraph.entries.filter(({ path }) => (
        path !== 'apps/agent-worker/dist/index.js'
      ));
    }, /runtime graph/i],
    ['wrong runtime graph digest', (resources: ReturnType<typeof validResources>) => {
      resources.build.runtimeGraph.manifestSha256 = 'f'.repeat(64);
    }, /runtime graph/i],
    ['invalid worker image', (resources: ReturnType<typeof validResources>) => { resources.worker.imageId = `sha256:${'f'.repeat(64)}`; }, /image identity/i],
    ['parser release bind', (resources: ReturnType<typeof validResources>) => { resources.parser.mounts.push(resources.worker.mounts[1]!); }, /parser mount/i],
    ['worker mounts root evidence directory writable', (resources: ReturnType<typeof validResources>) => {
      resources.worker.mounts[3]!.source = resources.worker.mounts[3]!.source.replace('/worker-output', '');
    }, /worker output mount/i],
    ['hidden environment', (resources: ReturnType<typeof validResources>) => { resources.parser.effectiveEnvCount = 1; }, /effective environment/i],
    ['root user', (resources: ReturnType<typeof validResources>) => { resources.worker.user = '0:0'; }, /numeric non-root/i],
    ['missing memory peak', (resources: ReturnType<typeof validResources>) => {
      resources.parser.sampling.samples[1]!.memoryPeakBytes = 0;
      resources.parser.peakMemoryBytes = 0;
    }, /cgroup sampling series/i],
    ['missing host series', (resources: ReturnType<typeof validResources>) => {
      delete (resources.worker as Partial<typeof resources.worker>).sampling;
    }, /host cgroup|sampling series/i],
    ['missing monotonic clock identity', (resources: ReturnType<typeof validResources>) => {
      delete (resources.worker.sampling as Partial<typeof resources.worker.sampling>).clock;
    }, /monotonic|sampling series/i],
    ['wrong interval CPU formula', (resources: ReturnType<typeof validResources>) => {
      resources.worker.peakCpuQuotaPercent = 9;
    }, /CPU.*formula|sampling series/i],
    ['missing terminal sample', (resources: ReturnType<typeof validResources>) => {
      resources.parser.sampling.samples[1]!.terminal = false;
    }, /terminal/i],
    ['wrong cgroup version', (resources: ReturnType<typeof validResources>) => {
      resources.parser.sampling.cgroupVersion = 1;
    }, /cgroup v2/i],
    ['cgroup container identity mismatch', (resources: ReturnType<typeof validResources>) => {
      resources.worker.sampling.cgroupPath = '/sys/fs/cgroup/system.slice/docker-not-the-worker.scope';
    }, /cgroup.*identity/i],
    ['noncanonical cgroup path', (resources: ReturnType<typeof validResources>) => {
      resources.worker.sampling.cgroupPath = `/sys/fs/cgroup/../docker-${'d'.repeat(64)}.scope`;
    }, /cgroup.*identity/i],
    ['failed parser lifecycle', (resources: ReturnType<typeof validResources>) => { resources.parser.running = false; resources.parser.exitCode = 137; }, /lifecycle/i],
    ['unbounded swap', (resources: ReturnType<typeof validResources>) => { resources.worker.memorySwapBytes = -1; }, /runtime limit/i],
  ])('rejects $0 evidence', (_name, mutate, expected) => {
    const draft = validDraft();
    const resources = validResources(draft);
    mutate(resources);
    expect(() => validateRuntimeEvidence(resources, draft)).toThrow(expected);
  });

  it('canonicalizes exact owned release/corpus roots and rejects traversal, symlinks and wrong ownership', async () => {
    const sha = 'a'.repeat(40);
    const sandbox = await mkdtemp(join(tmpdir(), 'task8-acceptance-paths-'));
    const releaseBase = join(sandbox, 'openscience-releases');
    const acceptanceBase = join(sandbox, 'acceptance');
    const releaseRoot = join(releaseBase, sha);
    const acceptanceRoot = join(acceptanceBase, sha);
    await mkdir(releaseRoot, { recursive: true, mode: 0o700 });
    await writeFile(join(releaseRoot, '.env.example'), 'template-only');
    await mkdir(join(acceptanceRoot, 'corpus'), { recursive: true, mode: 0o700 });
    const expectedUid = (await stat(releaseRoot)).uid;
    const paths = await prepareAcceptancePaths({
      sourceSha: sha, runId: `${sha.slice(0, 12)}-1234`, releaseBase, acceptanceBase, expectedUid,
      enforceMode: false,
    });
    expect(paths).toMatchObject({
      releaseRoot, acceptanceRoot, corpusRoot: join(acceptanceRoot, 'corpus'),
      workerOutputRoot: join(paths.runRoot, 'worker-output'),
      draftReportPath: join(paths.runRoot, 'worker-output', 'report.draft.json'),
    });
    expect((await lstat(paths.runRoot)).isSymbolicLink()).toBe(false);
    expect((await lstat(paths.workerOutputRoot)).isSymbolicLink()).toBe(false);

    await writeFile(join(acceptanceRoot, 'report.json'), 'already-published');
    const rejectedRunRoot = join(acceptanceRoot, `.run-${sha.slice(0, 12)}-4321`);
    await expect(prepareAcceptancePaths({
      sourceSha: sha, runId: `${sha.slice(0, 12)}-4321`, releaseBase, acceptanceBase, expectedUid,
      enforceMode: false,
    })).rejects.toThrow(/already exists/i);
    await expect(access(rejectedRunRoot)).rejects.toThrow();

    await expect(prepareAcceptancePaths({
      sourceSha: sha, runId: '../escape', releaseBase, acceptanceBase, expectedUid,
      enforceMode: false,
    })).rejects.toThrow(/run id/i);
    await expect(prepareAcceptancePaths({
      sourceSha: sha, runId: `${sha.slice(0, 12)}-5678`, releaseBase, acceptanceBase, expectedUid: expectedUid + 1,
      enforceMode: false,
    })).rejects.toThrow(/owner/i);

    const symlinkSandbox = await mkdtemp(join(tmpdir(), 'task8-acceptance-symlink-'));
    const symlinkReleaseBase = join(symlinkSandbox, 'releases');
    const realRelease = join(symlinkSandbox, 'real-release');
    await mkdir(realRelease, { recursive: true });
    await mkdir(symlinkReleaseBase, { recursive: true });
    await symlink(realRelease, join(symlinkReleaseBase, sha), 'junction');
    await expect(prepareAcceptancePaths({
      sourceSha: sha, runId: `${sha.slice(0, 12)}-9999`, releaseBase: symlinkReleaseBase,
      acceptanceBase, expectedUid, enforceMode: false,
    })).rejects.toThrow(/symlink|canonical/i);
  });

  it('derives no cleanup/finalization path from unvalidated CLI identity', () => {
    expect(() => deriveFixedAcceptancePaths('../escape', 'aaaaaaaaaaaa-1234')).toThrow(/source SHA/i);
    expect(() => deriveFixedAcceptancePaths('a'.repeat(40), '../escape')).toThrow(/run id/i);
    expect(deriveFixedAcceptancePaths('a'.repeat(40), 'aaaaaaaaaaaa-1234')).toMatchObject({
      unpublishedReportPath: '/opt/openscience-acceptance/document-parser/'
        + `${'a'.repeat(40)}/.report-unpublished-aaaaaaaaaaaa-1234.json`,
    });
  });

  it('keeps the validated report unpublished until strict run cleanup succeeds', async () => {
    const contract = await import('../src/parser-acceptance-contract');
    expect(contract).toHaveProperty('writeUnpublishedAcceptanceCandidate');
    expect(contract).toHaveProperty('publishAcceptanceCandidate');
    const writeCandidate = Reflect.get(contract, 'writeUnpublishedAcceptanceCandidate') as (
      path: string, report: unknown, requiredUid?: number,
    ) => Promise<void>;
    const publishCandidate = Reflect.get(contract, 'publishAcceptanceCandidate') as (
      candidate: string, final: string, requiredUid?: number,
    ) => Promise<void>;
    const testUid = process.getuid?.() ?? 0;
    const acceptanceRoot = await mkdtemp(join(tmpdir(), 'task8-acceptance-unpublished-'));
    const runId = 'aaaaaaaaaaaa-1234';
    const runRoot = join(acceptanceRoot, `.run-${runId}`);
    const candidate = join(acceptanceRoot, `.report-unpublished-${runId}.json`);
    const final = join(acceptanceRoot, 'report.json');
    await mkdir(runRoot);
    const report = buildFinalAcceptanceReport(validDraft(), validResources());
    await writeCandidate(candidate, report, testUid);
    await expect(access(candidate)).resolves.toBeUndefined();
    await expect(access(final)).rejects.toThrow();

    await cleanupAcceptanceRun(runRoot, acceptanceRoot, true);
    await expect(access(runRoot)).rejects.toThrow();
    await expect(access(candidate)).resolves.toBeUndefined();
    await expect(access(final)).rejects.toThrow();
    await publishCandidate(candidate, final, testUid);
    await expect(access(candidate)).rejects.toThrow();
    expect(JSON.parse(await readFile(final, 'utf8'))).toMatchObject({ schemaVersion: 2 });
  });

  it('reverifies the embedded runtime graph at the atomic publication boundary', async () => {
    const contract = await import('../src/parser-acceptance-contract');
    expect(contract).toHaveProperty('verifyAndPublishAcceptanceCandidate');
    const buildManifest = Reflect.get(contract, 'buildAcceptanceRuntimeGraphManifest') as (
      releaseRoot: string,
    ) => Promise<unknown>;
    const verifyAndPublish = Reflect.get(contract, 'verifyAndPublishAcceptanceCandidate') as (
      releaseRoot: string, candidatePath: string, finalPath: string, requiredUid?: number,
    ) => Promise<void>;
    const testUid = process.getuid?.() ?? 0;
    const releaseRoot = await mkdtemp(join(tmpdir(), 'task8-publication-runtime-'));
    const outputs = [
      'apps/agent-worker/dist/index.js',
      'apps/agent-worker/dist/parser-acceptance-contract.js',
      'apps/agent-worker/dist/parser-acceptance-runner.js',
      'apps/agent-worker/dist/parser-job-isolation.js',
      'apps/agent-worker/dist/parsers/text-extractor.js',
      'packages/ai-gateway/dist/index.js',
      'packages/domain/dist/index.js',
    ];
    for (const [index, relative] of outputs.entries()) {
      const path = join(releaseRoot, ...relative.split('/'));
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, `module.exports = ${index};\n`);
    }
    const runtimeGraph = await buildManifest(releaseRoot);
    const acceptanceRoot = await mkdtemp(join(tmpdir(), 'task8-publication-boundary-'));
    const runId = 'aaaaaaaaaaaa-1234';
    const candidate = join(acceptanceRoot, `.report-unpublished-${runId}.json`);
    const final = join(acceptanceRoot, 'report.json');
    const resources = validResources();
    resources.build.runtimeGraph = runtimeGraph as typeof resources.build.runtimeGraph;
    const report = buildFinalAcceptanceReport(validDraft(), resources);
    await (Reflect.get(contract, 'writeUnpublishedAcceptanceCandidate') as (
      path: string, value: unknown, requiredUid?: number,
    ) => Promise<void>)(candidate, report, testUid);

    await writeFile(join(releaseRoot, 'packages/domain/dist/index.js'), 'module.exports = "tampered";\n');
    await expect(verifyAndPublish(releaseRoot, candidate, final, testUid))
      .rejects.toThrow(/runtime graph|build output|identity/i);
    await expect(access(candidate)).resolves.toBeUndefined();
    await expect(access(final)).rejects.toThrow();

    await writeFile(join(releaseRoot, 'packages/domain/dist/index.js'), 'module.exports = 6;\n');
    await expect(verifyAndPublish(releaseRoot, candidate, final, testUid)).resolves.toBeUndefined();
    await expect(access(candidate)).rejects.toThrow();
    await expect(access(final)).resolves.toBeUndefined();
  });

  it('aborts an unpublished candidate after injected cleanup failure and permits a clean retry', async () => {
    const contract = await import('../src/parser-acceptance-contract');
    expect(contract).toHaveProperty('writeUnpublishedAcceptanceCandidate');
    const writeCandidate = Reflect.get(contract, 'writeUnpublishedAcceptanceCandidate') as (
      path: string, report: unknown, requiredUid?: number,
    ) => Promise<void>;
    const testUid = process.getuid?.() ?? 0;
    const acceptanceRoot = await mkdtemp(join(tmpdir(), 'task8-acceptance-retry-'));
    const runId = 'aaaaaaaaaaaa-1234';
    const runRoot = join(acceptanceRoot, `.run-${runId}`);
    const candidate = join(acceptanceRoot, `.report-unpublished-${runId}.json`);
    const final = join(acceptanceRoot, 'report.json');
    const temp = join(acceptanceRoot, `report.json.tmp-${runId}`);
    const report = buildFinalAcceptanceReport(validDraft(), validResources());
    await mkdir(runRoot);
    await writeFile(temp, 'injected-partial');
    await writeCandidate(candidate, report, testUid);

    await cleanupAcceptanceRun(runRoot, acceptanceRoot);
    for (const path of [runRoot, candidate, final, temp]) await expect(access(path)).rejects.toThrow();

    await mkdir(runRoot);
    await writeCandidate(candidate, report, testUid);
    await cleanupAcceptanceRun(runRoot, acceptanceRoot, true);
    await (Reflect.get(contract, 'publishAcceptanceCandidate') as (
      candidatePath: string, finalPath: string, requiredUid?: number,
    ) => Promise<void>)(candidate, final, testUid);
    await expect(access(final)).resolves.toBeUndefined();
  });

  it('removes the exact adjacent temp report when atomic publication fails', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'task8-acceptance-report-'));
    const finalPath = join(outputRoot, 'report.json');
    await writeFile(finalPath, 'preserve-existing-report');
    await expect(writeAtomicAcceptanceReport(finalPath, buildFinalAcceptanceReport(validDraft(), validResources())))
      .rejects.toThrow();
    expect(await readFile(finalPath, 'utf8')).toBe('preserve-existing-report');
    expect((await readdir(outputRoot)).filter((name) => name.startsWith('report.json.tmp-'))).toEqual([]);
  });

  it('rejects a worker-controlled symlink instead of following it as root during finalization', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'task8-acceptance-draft-'));
    const outside = join(outputRoot, 'outside.json');
    const workerDraft = join(outputRoot, 'report.draft.json');
    await writeFile(outside, JSON.stringify(validDraft()));
    await symlink(outside, workerDraft);
    await expect(readBoundedAcceptanceJson(workerDraft)).rejects.toThrow(/regular|symlink/i);
  });

  it('cleans an injected failed run root without touching the final report or an arbitrary sibling', async () => {
    const acceptanceRoot = await mkdtemp(join(tmpdir(), 'task8-acceptance-cleanup-'));
    const runRoot = join(acceptanceRoot, '.run-aaaaaaaaaaaa-1234');
    const sibling = join(acceptanceRoot, 'operator-evidence');
    const finalReport = join(acceptanceRoot, 'report.json');
    const exactTemporaryReport = join(acceptanceRoot, 'report.json.tmp-aaaaaaaaaaaa-1234');
    const unrelatedTemporaryReport = join(acceptanceRoot, 'report.json.tmp-bbbbbbbbbbbb-5678');
    await mkdir(runRoot);
    await mkdir(sibling);
    await writeFile(join(runRoot, 'report.draft.json.tmp-injected'), 'partial');
    await writeFile(finalReport, 'published');
    await writeFile(exactTemporaryReport, 'partial-publication');
    await writeFile(unrelatedTemporaryReport, 'other-run');

    await cleanupAcceptanceRun(runRoot, acceptanceRoot);
    await expect(access(runRoot)).rejects.toThrow();
    await expect(access(exactTemporaryReport)).rejects.toThrow();
    await expect(access(unrelatedTemporaryReport)).resolves.toBeUndefined();
    expect(await readFile(finalReport, 'utf8')).toBe('published');
    await expect(access(sibling)).resolves.toBeUndefined();
    await expect(cleanupAcceptanceRun(sibling, acceptanceRoot)).rejects.toThrow(/exact run root/i);
    await expect(access(sibling)).resolves.toBeUndefined();
  });
});
