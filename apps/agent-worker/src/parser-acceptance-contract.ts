import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chown, link, lstat, mkdir, open, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';

import type { DocumentSourceMap } from '@openscience/domain';
import { SDF_CORE_VERSION } from '@openscience/sdf-schema';

import { PDF_TEXT_ITEM_METADATA } from './parsers/native-pdf-contract';

export const CANONICAL_CORPUS_MANIFEST_SHA256 = '34b46c5405c7d2114183cfb8e3b938a392ddf1e43941fed0818f7a3ab3b7fae6';

export interface AcceptanceLocator extends Record<string, unknown> { kind: string }
export interface AcceptanceManifestCase {
  id: string;
  filename: string;
  sha256: string;
  expectedCurrentStatus: 'ready' | 'needs_review';
  expectedLocators: AcceptanceLocator[];
}
export interface AcceptanceManifest { schemaVersion: 2; cases: AcceptanceManifestCase[] }

const VIRTUAL_LINE_HEIGHT = 24;
const SCANNED_PDF_HASH = 'b327e6fece61a3e5bd52842250c51012b7672d81ff3dd4f11107b0e4aee6d2e0';
const MARKDOWN_TABLE_HASH = '66f861e5049bd0e33e68ae11aec6965928853e0c95c7a4c88a7f99c1f7497406';
const CSV_TABLE_HASH = 'e71f6e5c40db4f3e257ee99961e81b899c817a7b00ed2e03b9c055d537aefa20';
const XLSX_TABLE_HASH = 'c371bc99687ba51d51d4081f2ae09274f1a52b95839c543870008d9fc34f4b1f';
function sameCoordinate(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 16;
}

function isTesseractBlock(block: DocumentSourceMap['pages'][number]['blocks'][number]): boolean {
  return block.parser.name === 'tesseract' && block.parser.version === '5.3.0'
    && typeof block.confidence === 'number' && block.confidence > 0
    && block.transformations.some(({ stage, processor }) => stage === 'ocr'
      && processor.name === 'tesseract' && processor.version === '5.3.0');
}

function isVirtualBlock(block: DocumentSourceMap['pages'][number]['blocks'][number]): boolean {
  return block.transformations.some(({ stage, processor }) => stage === 'normalize'
    && processor.name === 'openscience-virtual-page'
    && processor.version === 'openscience-virtual-page-v1');
}

function hasPhysicalGeometryProvenance(
  block: DocumentSourceMap['pages'][number]['blocks'][number],
): boolean {
  const nativeTextItems = block.parser.name === PDF_TEXT_ITEM_METADATA.name
    && block.parser.version === PDF_TEXT_ITEM_METADATA.version
    && block.transformations.some(({ stage, processor }) => stage === 'extract_text'
      && processor.name === PDF_TEXT_ITEM_METADATA.name
      && processor.version === PDF_TEXT_ITEM_METADATA.version);
  return nativeTextItems
    || block.transformations.some(({ stage }) => stage === 'detect_layout' || stage === 'ocr');
}

function meaningfullyMatchesPhysicalRegion(
  block: DocumentSourceMap['pages'][number]['blocks'][number],
  box: readonly number[],
): boolean {
  if (!hasPhysicalGeometryProvenance(block) || box.length !== 4) return false;
  const [left, top, right, bottom] = box.map(Number);
  if (![left, top, right, bottom].every(Number.isFinite) || right! <= left! || bottom! <= top!) return false;
  const blockRight = block.boundingBox.x + block.boundingBox.width;
  const blockBottom = block.boundingBox.y + block.boundingBox.height;
  const intersectionWidth = Math.min(blockRight, right!) - Math.max(block.boundingBox.x, left!);
  const intersectionHeight = Math.min(blockBottom, bottom!) - Math.max(block.boundingBox.y, top!);
  if (intersectionWidth <= 0 || intersectionHeight <= 0) return false;
  const centroidX = block.boundingBox.x + block.boundingBox.width / 2;
  const centroidY = block.boundingBox.y + block.boundingBox.height / 2;
  const centroidInside = centroidX > left! && centroidX < right! && centroidY > top! && centroidY < bottom!;
  const contained = block.boundingBox.x >= left! && blockRight <= right!
    && block.boundingBox.y >= top! && blockBottom <= bottom!;
  const intersectionRatio = (intersectionWidth * intersectionHeight)
    / (block.boundingBox.width * block.boundingBox.height);
  return centroidInside || contained || intersectionRatio > 0.5;
}

function quoteMatches(block: DocumentSourceMap['pages'][number]['blocks'][number], quote: string): boolean {
  return typeof block.text === 'string' && block.text.indexOf(quote) >= 0;
}

function matchesVirtualLine(
  block: DocumentSourceMap['pages'][number]['blocks'][number],
  line: number,
): boolean {
  return isVirtualBlock(block) && sameCoordinate(block.boundingBox.y, (line - 1) * VIRTUAL_LINE_HEIGHT)
    && sameCoordinate(block.boundingBox.height, VIRTUAL_LINE_HEIGHT);
}

function virtualColumn(block: DocumentSourceMap['pages'][number]['blocks'][number]): number | undefined {
  if (!isVirtualBlock(block) || block.boundingBox.width <= 0) return undefined;
  const raw = block.boundingBox.x / block.boundingBox.width;
  const index = Math.round(raw);
  return sameCoordinate(raw, index) ? index + 1 : undefined;
}

function markdownTableCellMatches(sourceMap: DocumentSourceMap, locator: AcceptanceLocator, quote: string): boolean {
  const row = Number(locator.row);
  const column = Number(locator.column);
  if (!Number.isSafeInteger(row) || row < 1 || !Number.isSafeInteger(column) || column < 1) return false;
  const tableRows = sourceMap.pages.flatMap(({ blocks }) => blocks)
    .filter((block) => isVirtualBlock(block) && typeof block.text === 'string' && block.text.includes('|'))
    .sort((left, right) => left.boundingBox.y - right.boundingBox.y)
    .map((block) => block.text!.trim().replace(/^\|/u, '').replace(/\|$/u, ''))
    .filter((line) => !line.split('|').every((cell) => /^\s*:?-{3,}:?\s*$/u.test(cell)))
    .map((line) => line.split('|').map((cell) => cell.trim()));
  return tableRows[row - 1]?.[column - 1]?.includes(quote) ?? false;
}

export function reproduceAcceptanceLocator(
  sourceMap: DocumentSourceMap,
  locator: AcceptanceLocator,
  expectedSource?: { artifactId: string; contentHash: string },
): boolean {
  if (expectedSource && (sourceMap.artifactId !== expectedSource.artifactId
    || sourceMap.contentHash !== expectedSource.contentHash)) return false;
  if (locator.kind === 'file') {
    return sourceMap.pages.some(({ blocks }) => blocks.length > 0);
  }
  const quote = typeof locator.quote === 'string' ? locator.quote : undefined;
  const pageNumber = typeof locator.page === 'number' ? locator.page : undefined;
  const pages = pageNumber === undefined ? sourceMap.pages : sourceMap.pages.filter(({ page }) => page === pageNumber);
  const scannedPdf = sourceMap.contentHash === SCANNED_PDF_HASH;
  const blocks = pages.flatMap(({ blocks: pageBlocks }) => pageBlocks)
    .filter((block) => !scannedPdf || isTesseractBlock(block));
  if (locator.kind === 'page-text-order' && Array.isArray(locator.quotes)) {
    let blockIndex = 0;
    let characterOffset = 0;
    return locator.quotes.every((candidate) => {
      if (typeof candidate !== 'string') return false;
      for (let index = blockIndex; index < blocks.length; index += 1) {
        const text = blocks[index]?.text;
        if (typeof text !== 'string') continue;
        const found = text.indexOf(candidate, index === blockIndex ? characterOffset : 0);
        if (found < 0) continue;
        blockIndex = index;
        characterOffset = found + candidate.length;
        return true;
      }
      return false;
    });
  }
  if (!quote && locator.kind !== 'page-region' && locator.kind !== 'image-region') return false;
  if (quote && locator.kind === 'line-text') {
    const line = Number(locator.line);
    return Number.isSafeInteger(line) && line > 0
      && blocks.some((block) => matchesVirtualLine(block, line) && quoteMatches(block, quote));
  }
  if (quote && locator.kind === 'paragraph-text') {
    const paragraph = Number(locator.paragraph);
    return Number.isSafeInteger(paragraph) && paragraph > 0
      && blocks.some((block) => matchesVirtualLine(block, paragraph) && quoteMatches(block, quote));
  }
  if (quote && locator.kind === 'notebook-cell') {
    const cell = Number(locator.cell);
    return Number.isSafeInteger(cell) && cell > 0
      && blocks.some((block) => matchesVirtualLine(block, cell) && quoteMatches(block, quote));
  }
  if (quote && locator.kind === 'table-cell') {
    if (sourceMap.contentHash === MARKDOWN_TABLE_HASH) return markdownTableCellMatches(sourceMap, locator, quote);
    const row = Number(locator.row);
    const column = Number(locator.column);
    if (!Number.isSafeInteger(row) || row < 1 || !Number.isSafeInteger(column) || column < 1) return false;
    if (sourceMap.contentHash === CSV_TABLE_HASH) {
      return blocks.some((block) => matchesVirtualLine(block, row) && virtualColumn(block) === column
        && quoteMatches(block, quote));
    }
    if (sourceMap.contentHash === XLSX_TABLE_HASH && typeof locator.sheet === 'string' && locator.sheet) {
      return pages.some(({ blocks: pageBlocks }) => {
        const sheetMatches = pageBlocks.some((block) => matchesVirtualLine(block, 1)
          && block.text === locator.sheet);
        return sheetMatches && pageBlocks.some((block) => matchesVirtualLine(block, row + 1)
          && virtualColumn(block) === column && quoteMatches(block, quote));
      });
    }
    return false;
  }
  const region = Array.isArray(locator.bbox) ? locator.bbox.map(Number) : undefined;
  const candidates = region
    ? blocks.filter((block) => meaningfullyMatchesPhysicalRegion(block, region))
    : blocks;
  if (locator.kind === 'page-region' || locator.kind === 'image-region') return candidates.length > 0;
  if (quote) return candidates.some((block) => quoteMatches(block, quote));
  return false;
}

export const CANONICAL_CASE_IDENTITIES = Object.freeze([
  ['corrupt-pdf-en', 'corrupt.pdf', 'needs_review', 1],
  ['dual-column-pdf-en', 'dual-column.pdf', 'ready', 5],
  ['formula-pdf-en', 'formula.pdf', 'ready', 2],
  ['markdown-mixed', 'claim.md', 'ready', 2],
  ['native-docx-en', 'fixture.docx', 'ready', 1],
  ['native-pdf-en', 'fixture.pdf', 'ready', 1],
  ['notebook-en', 'analysis.ipynb', 'needs_review', 1],
  ['python-code-en', 'analysis.py', 'needs_review', 1],
  ['references-markdown-en', 'references.md', 'ready', 1],
  ['references-pdf-en', 'references.pdf', 'ready', 2],
  ['scan-pdf-image-only', 'scan.pdf', 'needs_review', 2],
  ['scan-png-empty', 'scan.png', 'needs_review', 1],
  ['table-csv-mixed', 'evidence.csv', 'needs_review', 1],
  ['table-pdf-en', 'table.pdf', 'ready', 3],
  ['table-xlsx-en', 'evidence.xlsx', 'needs_review', 1],
  ['tex-formula-en', 'method.tex', 'ready', 1],
] as const);

const CANONICAL_CASE_CONTENT_HASHES: Readonly<Record<string, string>> = Object.freeze({
  'corrupt-pdf-en': '75de1813b71e3d6612c90ea885ecbbcf5455b45ca6f8338503c047c91dd71ad9',
  'dual-column-pdf-en': 'd68367dc72a42818acc508bd9302353c608a60bb1e627c4d7f2beb09956c4316',
  'formula-pdf-en': 'e2048391202205cffe5132331b85148d23109add51130ac280a817ef0f583a48',
  'markdown-mixed': '66f861e5049bd0e33e68ae11aec6965928853e0c95c7a4c88a7f99c1f7497406',
  'native-docx-en': '9641d86b9ed1e3614b448ca4159d4943c11d9d08e8561d0ae01a8357c579ea3c',
  'native-pdf-en': 'b31b39df2ad697467459dc1d780865c0400df2fb361b71026c8dcdd3531ff3a0',
  'notebook-en': 'eea43d501badf223c43fe7044522e107c0c26e9f011da3e653e45f147532b946',
  'python-code-en': 'e080950cf9dc81cdb26ddff57c2ce44da974e550f142e62120f046a4ec834ab3',
  'references-markdown-en': '8d452b4e5f0d5882796f761bee9257eeadd0b6726451d9bd1f401c271385fb1a',
  'references-pdf-en': '79555938f5fd533905d894308738917475abbe7e00f43e43d58234c111555d87',
  'scan-pdf-image-only': 'b327e6fece61a3e5bd52842250c51012b7672d81ff3dd4f11107b0e4aee6d2e0',
  'scan-png-empty': '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460',
  'table-csv-mixed': 'e71f6e5c40db4f3e257ee99961e81b899c817a7b00ed2e03b9c055d537aefa20',
  'table-pdf-en': '1890fb43169ebea80d59a9a5688158caff5bf1da6001b0b528f0c3274608657a',
  'table-xlsx-en': 'c371bc99687ba51d51d4081f2ae09274f1a52b95839c543870008d9fc34f4b1f',
  'tex-formula-en': 'f643cdc4ff8c7df62e89ed8237a7cfc689450512f47c5a7eaa16c778c3589fa3',
});

const HARD_CASE_EXPECTATIONS = Object.freeze([
  ['corrupt-pdf-en', 'needs_review', 0],
  ['dual-column-pdf-en', 'succeeded', 5],
  ['formula-pdf-en', 'succeeded', 2],
  ['markdown-mixed', 'succeeded', 2],
  ['native-docx-en', 'succeeded', 1],
  ['native-pdf-en', 'succeeded', 1],
  ['notebook-en', 'needs_review', 0],
  ['python-code-en', 'needs_review', 0],
  ['references-markdown-en', 'succeeded', 1],
  ['references-pdf-en', 'succeeded', 2],
  ['scan-pdf-image-only', 'succeeded', 2],
  ['scan-png-empty', 'needs_review', 0],
  ['table-csv-mixed', 'needs_review', 0],
  ['table-pdf-en', 'succeeded', 3],
  ['table-xlsx-en', 'needs_review', 1],
  ['tex-formula-en', 'succeeded', 1],
] as const);

interface AcceptanceTransformation {
  stage: string;
  parser: string;
  version: string;
}
interface AcceptanceStage {
  parser: string;
  version: string;
  confidence: number | null;
  boundingBox: { x: number; y: number; width: number; height: number };
  transformations: AcceptanceTransformation[];
}
interface AcceptanceCaseResult {
  id: string;
  contentHash: string;
  status: string;
  handlerStatus: string;
  locatorMatches: number;
  locatorTotal: number;
  falseReady: boolean;
  elapsedMs: number;
  stages: AcceptanceStage[];
  failureStatus?: string;
}
export interface AcceptanceDraft {
  schemaVersion: 2;
  sourceSha: string;
  manifestSha256: string;
  images: { worker: string; parser: string };
  runtimeProcess: { uid: number; gid: number; effectiveEnvCount: number };
  gatewayCalls: {
    structuredFake: number;
    externalProvider: number;
    forbidden: { complete: number; ocr: number; stream: number; unknown: number };
  };
  summary: {
    falseReadyCount: number;
    failed: number;
    succeeded: number;
    needsReview: number;
    p50ElapsedMs: number;
    p95ElapsedMs: number;
  };
  cases: AcceptanceCaseResult[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const SDF_FIELDS = Object.freeze([
  'problem', 'insight', 'method', 'results', 'limitations', 'reproducibility',
] as const);

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && [...expected].sort().every((key, index) => keys[index] === key);
}

export interface AcceptanceRuntimeGraphEntry {
  path: string;
  sha256: string;
}

export interface AcceptanceRuntimeGraphManifest {
  schemaVersion: 1;
  manifestSha256: string;
  entries: AcceptanceRuntimeGraphEntry[];
}

const REQUIRED_ACCEPTANCE_RUNTIME_PATHS = Object.freeze([
  'apps/agent-worker/dist/index.js',
  'apps/agent-worker/dist/parser-acceptance-contract.js',
  'apps/agent-worker/dist/parser-acceptance-runner.js',
  'apps/agent-worker/dist/parser-job-isolation.js',
  'apps/agent-worker/dist/parsers/text-extractor.js',
  'packages/ai-gateway/dist/index.js',
  'packages/domain/dist/index.js',
] as const);
const ACCEPTANCE_RUNTIME_PATH = /^(?:apps\/agent-worker|packages\/[A-Za-z0-9._-]+)\/dist\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.js$/u;

function compareRuntimePath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function runtimeGraphPayload(entries: readonly AcceptanceRuntimeGraphEntry[]): string {
  return JSON.stringify({ schemaVersion: 1, entries });
}

export function validateAcceptanceRuntimeGraphManifest(value: unknown): AcceptanceRuntimeGraphManifest {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'manifestSha256', 'entries'])
    || value.schemaVersion !== 1 || !/^[a-f0-9]{64}$/u.test(String(value.manifestSha256))
    || !Array.isArray(value.entries) || value.entries.length < REQUIRED_ACCEPTANCE_RUNTIME_PATHS.length
    || value.entries.length > 20_000) {
    throw new Error('complete runtime graph manifest missing or invalid');
  }
  let previousPath = '';
  const seen = new Set<string>();
  const entries = value.entries.map((entryValue): AcceptanceRuntimeGraphEntry => {
    if (!isRecord(entryValue) || !hasExactKeys(entryValue, ['path', 'sha256'])
      || typeof entryValue.path !== 'string'
      || entryValue.path.length > 1_000 || !ACCEPTANCE_RUNTIME_PATH.test(entryValue.path)
      || !/^[a-f0-9]{64}$/u.test(String(entryValue.sha256))
      || entryValue.path <= previousPath || seen.has(entryValue.path)) {
      throw new Error('complete runtime graph manifest entry invalid');
    }
    previousPath = entryValue.path;
    seen.add(entryValue.path);
    return { path: entryValue.path, sha256: String(entryValue.sha256) };
  });
  if (REQUIRED_ACCEPTANCE_RUNTIME_PATHS.some((path) => !seen.has(path))) {
    throw new Error('complete runtime graph is missing a transitive build output');
  }
  const digest = createHash('sha256').update(runtimeGraphPayload(entries)).digest('hex');
  if (digest !== value.manifestSha256) throw new Error('complete runtime graph manifest digest mismatch');
  return { schemaVersion: 1, manifestSha256: digest, entries };
}

async function buildOutputEntry(
  releaseRoot: string,
  path: string,
): Promise<AcceptanceRuntimeGraphEntry> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat();
    const canonical = await realpath(path);
    const relativePath = relative(releaseRoot, canonical).replaceAll('\\', '/');
    if (!before.isFile() || relativePath.startsWith('../') || relativePath === ''
      || !ACCEPTANCE_RUNTIME_PATH.test(relativePath)) {
      throw new Error('runtime build output escaped the exact release root');
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size) {
      throw new Error('runtime build output identity changed while hashing');
    }
    return { path: relativePath, sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally {
    await handle?.close();
  }
}

async function collectRuntimeBuildOutputs(
  releaseRoot: string,
  directory: string,
  output: AcceptanceRuntimeGraphEntry[],
): Promise<void> {
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || await realpath(directory) !== resolve(directory)) {
    throw new Error('runtime build output directory is not canonical');
  }
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareRuntimePath(left.name, right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('runtime build output must not be a symlink');
    if (entry.isDirectory()) {
      await collectRuntimeBuildOutputs(releaseRoot, path, output);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      output.push(await buildOutputEntry(releaseRoot, path));
    }
  }
}

export async function buildAcceptanceRuntimeGraphManifest(
  releaseRootValue: string,
): Promise<AcceptanceRuntimeGraphManifest> {
  const releaseRoot = resolve(releaseRootValue);
  if (await realpath(releaseRoot) !== releaseRoot) throw new Error('exact release root is not canonical');
  const entries: AcceptanceRuntimeGraphEntry[] = [];
  await collectRuntimeBuildOutputs(releaseRoot, join(releaseRoot, 'apps', 'agent-worker', 'dist'), entries);
  const packagesRoot = join(releaseRoot, 'packages');
  const packages = await readdir(packagesRoot, { withFileTypes: true });
  packages.sort((left, right) => compareRuntimePath(left.name, right.name));
  for (const entry of packages) {
    if (entry.isSymbolicLink()) throw new Error('workspace package must not be a symlink');
    if (!entry.isDirectory()) continue;
    const dist = join(packagesRoot, entry.name, 'dist');
    try {
      await collectRuntimeBuildOutputs(releaseRoot, dist, entries);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  entries.sort((left, right) => compareRuntimePath(left.path, right.path));
  const manifest = {
    schemaVersion: 1 as const,
    manifestSha256: createHash('sha256').update(runtimeGraphPayload(entries)).digest('hex'),
    entries,
  };
  return validateAcceptanceRuntimeGraphManifest(manifest);
}

export async function verifyAcceptanceRuntimeGraphManifest(
  releaseRoot: string,
  expectedValue: unknown,
): Promise<void> {
  const expected = validateAcceptanceRuntimeGraphManifest(expectedValue);
  const current = await buildAcceptanceRuntimeGraphManifest(releaseRoot);
  if (current.manifestSha256 !== expected.manifestSha256
    || JSON.stringify(current.entries) !== JSON.stringify(expected.entries)) {
    throw new Error('complete runtime graph build output identity changed');
  }
}

export function classifyAcceptanceHandlerResult(value: unknown): 'completed' | 'needs_review' {
  if (!isRecord(value)) throw new Error('invalid sdf.extract handler result');
  if (value.status === 'needs_review') {
    if (!hasExactKeys(value, ['status', 'format', 'reason'])
      || typeof value.format !== 'string' || !value.format
      || typeof value.reason !== 'string' || !value.reason) {
      throw new Error('invalid sdf.extract handler result');
    }
    return 'needs_review';
  }
  if (!hasExactKeys(value, ['core', 'evidence', 'needsMoreInformation'])
    || !isRecord(value.core) || !isRecord(value.evidence)
    || !Array.isArray(value.needsMoreInformation)) {
    throw new Error('invalid sdf.extract handler result');
  }
  const core = value.core;
  const evidenceByField = value.evidence;
  const needsMoreInformation = value.needsMoreInformation;
  if (!hasExactKeys(core, ['schemaVersion', ...SDF_FIELDS])
    || core.schemaVersion !== SDF_CORE_VERSION
    || SDF_FIELDS.some((field) => typeof core[field] !== 'string')
    || !hasExactKeys(evidenceByField, SDF_FIELDS)
    || SDF_FIELDS.some((field) => {
      const evidence = evidenceByField[field];
      return !isRecord(evidence) || !hasExactKeys(evidence, ['quote', 'locator'])
        || typeof evidence.quote !== 'string' || typeof evidence.locator !== 'string';
    })
    || new Set(needsMoreInformation).size !== needsMoreInformation.length
    || needsMoreInformation.some((field) => !SDF_FIELDS.includes(field))) {
    throw new Error('invalid sdf.extract handler result');
  }
  return 'completed';
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function validBox(value: unknown): value is AcceptanceStage['boundingBox'] {
  if (!isRecord(value)) return false;
  return ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key]))
    && Number(value.width) > 0 && Number(value.height) > 0;
}

function validateStage(stage: unknown): asserts stage is AcceptanceStage {
  if (!isRecord(stage) || typeof stage.parser !== 'string' || !stage.parser
    || typeof stage.version !== 'string' || !stage.version
    || (stage.confidence !== null && (!Number.isFinite(stage.confidence)
      || Number(stage.confidence) < 0 || Number(stage.confidence) > 1))
    || !validBox(stage.boundingBox) || !Array.isArray(stage.transformations)
    || stage.transformations.length === 0
    || stage.transformations.some((item) => !isRecord(item) || typeof item.stage !== 'string' || !item.stage
      || typeof item.parser !== 'string' || !item.parser || typeof item.version !== 'string' || !item.version)) {
    throw new Error('missing stage provenance');
  }
}

export function validateAcceptanceDraft(value: unknown): AcceptanceDraft {
  if (!isRecord(value) || value.schemaVersion !== 2 || !/^[a-f0-9]{40}$/.test(String(value.sourceSha))
    || value.manifestSha256 !== CANONICAL_CORPUS_MANIFEST_SHA256 || !isRecord(value.images)
    || !/^sha256:[a-f0-9]{64}$/.test(String(value.images.worker))
    || !/^sha256:[a-f0-9]{64}$/.test(String(value.images.parser))) {
    throw new Error('invalid acceptance draft identity');
  }
  if (!isRecord(value.runtimeProcess) || value.runtimeProcess.uid !== 1000
    || value.runtimeProcess.gid !== 1000 || value.runtimeProcess.effectiveEnvCount !== 0) {
    throw new Error('runtime process identity mismatch');
  }
  const gateway = value.gatewayCalls;
  if (!isRecord(gateway) || gateway.structuredFake !== 10) throw new Error('structured fake call count mismatch');
  const forbiddenCalls = gateway.forbidden;
  if (gateway.externalProvider !== 0 || !isRecord(forbiddenCalls)
    || ['complete', 'ocr', 'stream', 'unknown'].some((key) => forbiddenCalls[key] !== 0)) {
    throw new Error('forbidden gateway call observed');
  }
  if (!Array.isArray(value.cases) || value.cases.length !== HARD_CASE_EXPECTATIONS.length) {
    throw new Error('acceptance cases must contain the exact 16 cases');
  }
  const manifestCases = CANONICAL_CASE_IDENTITIES;
  const seen = new Set<string>();
  let succeeded = 0;
  let needsReview = 0;
  const elapsed: number[] = [];
  value.cases.forEach((raw, index) => {
    if (!isRecord(raw)) throw new Error('invalid acceptance case');
    const item = raw as unknown as AcceptanceCaseResult;
    const expected = HARD_CASE_EXPECTATIONS[index]!;
    const manifest = manifestCases[index]!;
    if (item.id !== expected[0] || seen.has(item.id)) throw new Error('acceptance case identity mismatch');
    seen.add(item.id);
    if (item.contentHash !== CANONICAL_CASE_CONTENT_HASHES[item.id]) {
      throw new Error(`content hash mismatch: ${item.id}`);
    }
    if (item.status !== expected[1]) throw new Error(`status mismatch: ${item.id}`);
    const expectedHandlerStatus = item.status === 'succeeded' ? 'completed' : 'needs_review';
    if (item.handlerStatus !== expectedHandlerStatus || item.failureStatus !== undefined) {
      throw new Error(`handler failure: ${item.id}`);
    }
    if (item.locatorTotal !== manifest[3] || item.locatorMatches !== expected[2]) {
      throw new Error(`locator reproduction mismatch: ${item.id}`);
    }
    if (item.falseReady !== false) throw new Error(`false-ready result: ${item.id}`);
    if (!Number.isFinite(item.elapsedMs) || item.elapsedMs < 0) throw new Error(`invalid elapsed time: ${item.id}`);
    elapsed.push(item.elapsedMs);
    if (!Array.isArray(item.stages)) throw new Error(`missing stage provenance: ${item.id}`);
    if (item.status === 'succeeded' && item.stages.length === 0) throw new Error(`missing stage provenance: ${item.id}`);
    item.stages.forEach(validateStage);
    if (item.id === 'scan-pdf-image-only') {
      const tesseract = item.stages.find((stage) => stage.parser === 'tesseract' && stage.version === '5.3.0'
        && typeof stage.confidence === 'number' && stage.confidence > 0
        && stage.transformations.some((entry) => entry.stage === 'ocr'
          && entry.parser === 'tesseract' && entry.version === '5.3.0'));
      if (!tesseract) throw new Error('mandatory scanned-PDF Tesseract provenance missing');
    }
    if (item.status === 'succeeded') succeeded += 1;
    else needsReview += 1;
  });
  const summary = value.summary;
  if (!isRecord(summary) || summary.falseReadyCount !== 0 || summary.failed !== 0
    || summary.succeeded !== succeeded || summary.needsReview !== needsReview
    || summary.p50ElapsedMs !== percentile(elapsed, 0.5)
    || summary.p95ElapsedMs !== percentile(elapsed, 0.95)) {
    throw new Error('acceptance summary mismatch');
  }
  return value as unknown as AcceptanceDraft;
}

interface AcceptanceMount {
  type: 'bind' | 'volume';
  source: string;
  destination: string;
  readOnly: boolean;
}
interface CgroupSample {
  elapsedMs: number;
  cpuUsageMicros: number;
  memoryPeakBytes: number;
  terminal: boolean;
}
interface HostCgroupSamplingEvidence {
  source: 'host-cgroup-v2';
  clock: 'host-monotonic';
  cgroupVersion: 2;
  hostPid: number;
  cgroupPath: string;
  cgroupIdentity: string;
  samples: CgroupSample[];
}
interface ContainerResourceEvidence {
  containerId: string;
  imageId: string;
  running: boolean;
  exitCode: number;
  user: string;
  effectiveEnvCount: number;
  networkMode: string;
  readOnlyRootfs: boolean;
  capDrop: string[];
  noNewPrivileges: boolean;
  memoryBytes: number;
  memorySwapBytes: number;
  nanoCpus: number;
  pidsLimit: number;
  tmpfsBytes: number;
  jobVolumeBytes: number;
  sampling: HostCgroupSamplingEvidence;
  cumulativeCpuUsageMicros: number;
  peakCpuQuotaPercent: number;
  peakMemoryBytes: number;
  mounts: AcceptanceMount[];
}
export interface AcceptanceRuntimeEvidence {
  build: {
    sourceSha: string;
    runnerSha256: string;
    contractSha256: string;
    runtimeGraph: AcceptanceRuntimeGraphManifest;
  };
  worker: ContainerResourceEvidence;
  parser: ContainerResourceEvidence;
  maxima: {
    cumulativeCpuUsageMicros: number;
    peakCpuQuotaPercent: number;
    peakMemoryBytes: number;
  };
}

function roundedRate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function validateHostCgroupSampling(
  role: 'worker' | 'parser',
  value: Record<string, unknown>,
  containerId: string,
  memoryBytes: number,
): void {
  const sampling = value.sampling;
  if (!isRecord(sampling) || sampling.source !== 'host-cgroup-v2'
    || sampling.clock !== 'host-monotonic' || sampling.cgroupVersion !== 2) {
    throw new Error(`${role} host cgroup v2 sampling series missing`);
  }
  if (!Number.isSafeInteger(sampling.hostPid) || Number(sampling.hostPid) <= 1
    || typeof sampling.cgroupPath !== 'string'
    || !sampling.cgroupPath.startsWith('/sys/fs/cgroup/') || !sampling.cgroupPath.includes(containerId)
    || sampling.cgroupPath.split('/').some((segment) => segment === '.' || segment === '..')
    || typeof sampling.cgroupIdentity !== 'string' || !/^\d+:\d+:\d+$/u.test(sampling.cgroupIdentity)) {
    throw new Error(`${role} cgroup container identity mismatch`);
  }
  if (!Array.isArray(sampling.samples) || sampling.samples.length < 2) {
    throw new Error(`${role} host cgroup sampling series missing`);
  }
  const samples = sampling.samples;
  let previousElapsed = -1;
  let previousCpu = -1;
  let previousMemory = -1;
  let peakCpuQuotaPercent = 0;
  samples.forEach((raw, index) => {
    if (!isRecord(raw) || !Number.isSafeInteger(raw.elapsedMs) || Number(raw.elapsedMs) < 0
      || !Number.isSafeInteger(raw.cpuUsageMicros) || Number(raw.cpuUsageMicros) < 0
      || !Number.isSafeInteger(raw.memoryPeakBytes) || Number(raw.memoryPeakBytes) <= 0
      || Number(raw.memoryPeakBytes) > memoryBytes || typeof raw.terminal !== 'boolean') {
      throw new Error(`${role} host cgroup sampling series invalid`);
    }
    const elapsed = Number(raw.elapsedMs);
    const cpu = Number(raw.cpuUsageMicros);
    const memory = Number(raw.memoryPeakBytes);
    if ((index === 0 && elapsed !== 0) || (index > 0 && elapsed <= previousElapsed)
      || cpu < previousCpu || memory < previousMemory || (index < samples.length - 1 && raw.terminal)) {
      throw new Error(`${role} host cgroup sampling series invalid`);
    }
    if (index > 0) {
      const rate = ((cpu - previousCpu) / ((elapsed - previousElapsed) * 1_000)) / 2 * 100;
      peakCpuQuotaPercent = Math.max(peakCpuQuotaPercent, roundedRate(rate));
    }
    previousElapsed = elapsed;
    previousCpu = cpu;
    previousMemory = memory;
  });
  const terminal = samples.at(-1) as CgroupSample;
  if (terminal.terminal !== true) throw new Error(`${role} terminal cgroup sample missing`);
  if (value.cumulativeCpuUsageMicros !== terminal.cpuUsageMicros
    || value.peakMemoryBytes !== terminal.memoryPeakBytes
    || value.peakCpuQuotaPercent !== peakCpuQuotaPercent) {
    throw new Error(`${role} interval CPU formula or memory peak mismatch`);
  }
}

function validateContainerBounds(
  role: 'worker' | 'parser',
  value: unknown,
  imageId: string,
  memoryBytes: number,
): asserts value is ContainerResourceEvidence {
  if (!isRecord(value)) throw new Error(`${role} resource evidence missing`);
  if (value.imageId !== imageId || !/^[a-f0-9]{64}$/.test(String(value.containerId))) {
    throw new Error(`${role} image identity mismatch`);
  }
  const expectedRunning = role === 'parser';
  if (value.running !== expectedRunning || value.exitCode !== 0) {
    throw new Error(`${role} lifecycle evidence mismatch`);
  }
  if (value.user !== '1000:1000') throw new Error(`${role} numeric non-root user mismatch`);
  if (value.effectiveEnvCount !== 0) throw new Error(`${role} effective environment is not empty`);
  if (value.networkMode !== 'none' || value.readOnlyRootfs !== true
    || !Array.isArray(value.capDrop) || value.capDrop.length !== 1 || value.capDrop[0] !== 'ALL'
    || value.noNewPrivileges !== true || value.memoryBytes !== memoryBytes
    || value.memorySwapBytes !== memoryBytes
    || value.nanoCpus !== 2_000_000_000 || value.pidsLimit !== 64
    || value.tmpfsBytes !== 67_108_864 || value.jobVolumeBytes !== 67_108_864) {
    throw new Error(`${role} runtime limit mismatch`);
  }
  validateHostCgroupSampling(role, value, String(value.containerId), memoryBytes);
  if (!Array.isArray(value.mounts)) throw new Error(`${role} mount evidence missing`);
}

function mountMatches(
  mount: AcceptanceMount,
  expected: { type: 'bind' | 'volume'; source: string; destination: string; readOnly: boolean },
): boolean {
  return mount.type === expected.type && mount.source === expected.source
    && mount.destination === expected.destination && mount.readOnly === expected.readOnly;
}

export function validateRuntimeEvidence(value: unknown, draftValue: unknown): AcceptanceRuntimeEvidence {
  const draft = validateAcceptanceDraft(draftValue);
  if (!isRecord(value)) throw new Error('runtime resource evidence missing');
  const build = value.build;
  if (!isRecord(build) || build.sourceSha !== draft.sourceSha
    || !/^[a-f0-9]{64}$/.test(String(build.runnerSha256))
    || !/^[a-f0-9]{64}$/.test(String(build.contractSha256))) {
    throw new Error('fresh build identity evidence mismatch');
  }
  validateAcceptanceRuntimeGraphManifest(build.runtimeGraph);
  validateContainerBounds('worker', value.worker, draft.images.worker, 1_073_741_824);
  validateContainerBounds('parser', value.parser, draft.images.parser, 536_870_912);
  const worker = value.worker;
  const parser = value.parser;
  if (worker.sampling.hostPid === parser.sampling.hostPid
    || worker.sampling.cgroupPath === parser.sampling.cgroupPath
    || worker.sampling.cgroupIdentity === parser.sampling.cgroupIdentity) {
    throw new Error('worker/parser cgroup identity must be independent');
  }
  const releaseRoot = `/opt/openscience-releases/${draft.sourceSha}`;
  const acceptanceRoot = `/opt/openscience-acceptance/document-parser/${draft.sourceSha}`;
  const outputMount = worker.mounts.find((mount) => mount.destination === '/acceptance-output');
  const runPrefix = `${acceptanceRoot}/.run-${draft.sourceSha.slice(0, 12)}-`;
  const outputSuffix = outputMount?.source.startsWith(runPrefix)
    ? outputMount.source.slice(runPrefix.length) : '';
  if (!outputMount || outputMount.type !== 'bind' || outputMount.readOnly
    || !/^\d+\/worker-output$/.test(outputSuffix)) {
    throw new Error('worker output mount mismatch');
  }
  const runRoot = dirname(outputMount.source);
  const runId = basename(runRoot).slice('.run-'.length);
  const jobVolume = `openscience-parser-accept-jobs-${runId}`;
  const expectedWorkerMounts = [
    { type: 'volume' as const, source: jobVolume, destination: '/parser-jobs', readOnly: false },
    { type: 'bind' as const, source: releaseRoot, destination: '/opt/openscience', readOnly: true },
    { type: 'bind' as const, source: `${acceptanceRoot}/corpus`, destination: '/acceptance-corpus', readOnly: true },
    { type: 'bind' as const, source: outputMount.source, destination: '/acceptance-output', readOnly: false },
  ];
  if (worker.mounts.length !== expectedWorkerMounts.length
    || expectedWorkerMounts.some((expected) => !worker.mounts.some((mount) => mountMatches(mount, expected)))) {
    throw new Error('worker mount evidence mismatch');
  }
  const expectedParserMount = { type: 'volume' as const, source: jobVolume, destination: '/parser-jobs', readOnly: false };
  if (parser.mounts.length !== 1 || !mountMatches(parser.mounts[0]!, expectedParserMount)) {
    throw new Error('parser mount evidence mismatch');
  }
  const maxima = value.maxima;
  if (!isRecord(maxima)
    || maxima.cumulativeCpuUsageMicros !== Math.max(
      worker.cumulativeCpuUsageMicros, parser.cumulativeCpuUsageMicros,
    )
    || maxima.peakCpuQuotaPercent !== Math.max(worker.peakCpuQuotaPercent, parser.peakCpuQuotaPercent)
    || maxima.peakMemoryBytes !== Math.max(worker.peakMemoryBytes, parser.peakMemoryBytes)) {
    throw new Error('topology maxima mismatch');
  }
  return value as unknown as AcceptanceRuntimeEvidence;
}

export function buildFinalAcceptanceReport(draftValue: unknown, resourcesValue: unknown) {
  const draft = validateAcceptanceDraft(draftValue);
  const resources = validateRuntimeEvidence(resourcesValue, draft);
  return { ...draft, resources };
}

export function createAcceptanceGatewaySeam<T>(structuredValue: T) {
  const counts = {
    structuredFake: 0,
    externalProvider: 0,
    forbidden: { complete: 0, ocr: 0, stream: 0, unknown: 0 },
  };
  const forbidden = (kind: keyof typeof counts.forbidden) => async (): Promise<never> => {
    counts.forbidden[kind] += 1;
    throw new Error(`forbidden gateway seam invoked: ${kind}`);
  };
  const target: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    completeStructured: async () => {
      counts.structuredFake += 1;
      return structuredValue;
    },
    complete: forbidden('complete'),
    ocr: forbidden('ocr'),
    stream: forbidden('stream'),
  };
  const gateway = new Proxy(target, {
    get(object, property, receiver) {
      if (typeof property !== 'string' || Reflect.has(object, property)) return Reflect.get(object, property, receiver);
      return forbidden('unknown');
    },
  });
  return {
    gateway,
    snapshot: () => ({
      structuredFake: counts.structuredFake,
      externalProvider: counts.externalProvider,
      forbidden: { ...counts.forbidden },
    }),
  };
}

export interface PreparedAcceptancePaths {
  releaseRoot: string;
  acceptanceRoot: string;
  corpusRoot: string;
  runRoot: string;
  workerOutputRoot: string;
  runtimeGraphPath: string;
  draftReportPath: string;
  unpublishedReportPath: string;
  finalReportPath: string;
}

async function validateSecureDirectory(
  path: string,
  expected: string,
  expectedUid: number,
  enforceMode: boolean,
): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`directory is a symlink or not a directory: ${path}`);
  const canonical = await realpath(path);
  if (canonical !== resolve(expected)) throw new Error(`directory is not canonical: ${path}`);
  if (info.uid !== expectedUid) throw new Error(`directory owner mismatch: ${path}`);
  if (enforceMode && (info.mode & 0o022) !== 0) throw new Error(`directory is group/other writable: ${path}`);
}

export async function prepareAcceptancePaths(options: {
  sourceSha: string;
  runId: string;
  releaseBase?: string;
  acceptanceBase?: string;
  expectedUid?: number;
  workerOutputOwnerUid?: number;
  workerOutputOwnerGid?: number;
  enforceMode?: boolean;
}): Promise<PreparedAcceptancePaths> {
  const { sourceSha, runId } = options;
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('invalid exact source SHA');
  if (!new RegExp(`^${sourceSha.slice(0, 12)}-[1-9][0-9]*$`).test(runId)) throw new Error('invalid acceptance run id');
  const releaseBase = resolve(options.releaseBase ?? '/opt/openscience-releases');
  const acceptanceBase = resolve(options.acceptanceBase ?? '/opt/openscience-acceptance/document-parser');
  const releaseRoot = join(releaseBase, sourceSha);
  const acceptanceRoot = join(acceptanceBase, sourceSha);
  const corpusRoot = join(acceptanceRoot, 'corpus');
  const expectedUid = options.expectedUid ?? 0;
  const enforceMode = options.enforceMode ?? true;
  await validateSecureDirectory(releaseRoot, releaseRoot, expectedUid, enforceMode);
  await validateSecureDirectory(acceptanceRoot, acceptanceRoot, expectedUid, enforceMode);
  await validateSecureDirectory(corpusRoot, corpusRoot, expectedUid, enforceMode);
  const releaseEntries = await readdir(releaseRoot);
  if (releaseEntries.some((name) => name !== '.env.example' && /^\.env(?:\.|$)/u.test(name))) {
    throw new Error('release root is not secret-free');
  }
  const finalReportPath = join(acceptanceRoot, 'report.json');
  try {
    await lstat(finalReportPath);
    throw new Error('final acceptance report already exists');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const runRoot = join(acceptanceRoot, `.run-${runId}`);
  const workerOutputRoot = join(runRoot, 'worker-output');
  let created = false;
  try {
    await mkdir(runRoot, { mode: 0o700 });
    created = true;
    await mkdir(workerOutputRoot, { mode: 0o700 });
    if (options.workerOutputOwnerUid !== undefined || options.workerOutputOwnerGid !== undefined) {
      await chown(workerOutputRoot, options.workerOutputOwnerUid ?? 1000, options.workerOutputOwnerGid ?? 1000);
    }
  } catch (error) {
    if (created) await rm(runRoot, { recursive: true }).catch(() => undefined);
    throw error;
  }
  return {
    releaseRoot, acceptanceRoot, corpusRoot, runRoot, workerOutputRoot,
    runtimeGraphPath: join(runRoot, 'runtime-graph.json'),
    draftReportPath: join(workerOutputRoot, 'report.draft.json'),
    unpublishedReportPath: join(acceptanceRoot, `.report-unpublished-${runId}.json`),
    finalReportPath,
  };
}

function exactUnpublishedPath(path: string): { acceptanceRoot: string; runId: string } {
  const candidate = resolve(path);
  const name = basename(candidate);
  const match = /^\.report-unpublished-([a-f0-9]{12}-[1-9][0-9]*)\.json$/u.exec(name);
  if (!match) throw new Error('invalid unpublished acceptance report path');
  return { acceptanceRoot: dirname(candidate), runId: match[1]! };
}

export async function writeUnpublishedAcceptanceCandidate(
  path: string,
  report: unknown,
  requiredUid = 0,
): Promise<void> {
  if (!Number.isSafeInteger(requiredUid) || requiredUid < 0) throw new Error('invalid required acceptance owner');
  exactUnpublishedPath(path);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const info = await lstat(path);
  const currentUid = process.getuid?.();
  if (!info.isFile() || info.isSymbolicLink()
    || (currentUid !== undefined
      && (currentUid !== requiredUid || info.uid !== requiredUid || (info.mode & 0o077) !== 0))
    || await realpath(path) !== resolve(path)) {
    await rm(path, { force: true });
    throw new Error('unpublished acceptance report is not a root-owned regular file');
  }
}

export async function publishAcceptanceCandidate(
  candidatePath: string,
  finalPath: string,
  requiredUid = 0,
): Promise<void> {
  if (!Number.isSafeInteger(requiredUid) || requiredUid < 0) throw new Error('invalid required acceptance owner');
  const { acceptanceRoot } = exactUnpublishedPath(candidatePath);
  if (resolve(finalPath) !== join(acceptanceRoot, 'report.json')) {
    throw new Error('invalid final acceptance report path');
  }
  const candidateInfo = await lstat(candidatePath);
  const parentInfo = await lstat(acceptanceRoot);
  const currentUid = process.getuid?.();
  if (!candidateInfo.isFile() || candidateInfo.isSymbolicLink() || candidateInfo.uid !== parentInfo.uid
    || (currentUid !== undefined && (currentUid !== requiredUid || candidateInfo.uid !== requiredUid
      || parentInfo.uid !== requiredUid || (candidateInfo.mode & 0o077) !== 0))
    || await realpath(candidatePath) !== resolve(candidatePath)) {
    throw new Error('unpublished acceptance report ownership mismatch');
  }
  await readBoundedAcceptanceJson(candidatePath);
  await link(candidatePath, finalPath);
  await rm(candidatePath);
}

export async function verifyAndPublishAcceptanceCandidate(
  releaseRoot: string,
  candidatePath: string,
  finalPath: string,
  requiredUid = 0,
): Promise<void> {
  const report = await readBoundedAcceptanceJson(candidatePath);
  if (!isRecord(report) || !isRecord(report.resources)) {
    throw new Error('unpublished acceptance report runtime evidence missing');
  }
  const resources = validateRuntimeEvidence(report.resources, report);
  await verifyAcceptanceRuntimeGraphManifest(releaseRoot, resources.build.runtimeGraph);
  await publishAcceptanceCandidate(candidatePath, finalPath, requiredUid);
}

export async function writeAtomicAcceptanceReport(
  finalPath: string,
  report: unknown,
  publicationId = `${process.pid}-${Date.now()}`,
): Promise<void> {
  if (!/^[a-z0-9-]+$/u.test(publicationId)) throw new Error('invalid publication id');
  const temporaryPath = `${finalPath}.tmp-${publicationId}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await link(temporaryPath, finalPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function readBoundedAcceptanceJson(path: string, maxBytes = 16 * 1024 * 1024): Promise<unknown> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > maxBytes) {
    throw new Error('acceptance input is not a bounded regular file');
  }
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const after = await handle.stat();
    if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size) {
      throw new Error('acceptance input regular-file identity changed');
    }
    return JSON.parse(await handle.readFile({ encoding: 'utf8' }));
  } finally {
    await handle.close();
  }
}

export async function cleanupAcceptanceRun(
  runRootValue: string,
  acceptanceRootValue: string,
  preserveUnpublishedCandidate = false,
): Promise<void> {
  const acceptanceRoot = resolve(acceptanceRootValue);
  const runRoot = resolve(runRootValue);
  if (dirname(runRoot) !== acceptanceRoot || !/^\.run-[a-f0-9]{12}-[1-9][0-9]*$/u.test(basename(runRoot))) {
    throw new Error('cleanup target is not an exact run root');
  }
  const runId = basename(runRoot).slice('.run-'.length);
  const exactTemporaryReport = join(acceptanceRoot, `report.json.tmp-${runId}`);
  const unpublishedReport = join(acceptanceRoot, `.report-unpublished-${runId}.json`);
  let info;
  try {
    info = await lstat(runRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await rm(exactTemporaryReport, { force: true });
      if (!preserveUnpublishedCandidate) await rm(unpublishedReport, { force: true });
      return;
    }
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(runRoot) !== runRoot) {
    throw new Error('cleanup target is not a canonical run directory');
  }
  await rm(runRoot, { recursive: true });
  await rm(exactTemporaryReport, { force: true });
  if (!preserveUnpublishedCandidate) await rm(unpublishedReport, { force: true });
}

export function parseCanonicalManifest(serialized: Buffer | string): AcceptanceManifest {
  const bytes = Buffer.isBuffer(serialized) ? serialized : Buffer.from(serialized, 'utf8');
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== CANONICAL_CORPUS_MANIFEST_SHA256) throw new Error('canonical manifest hash mismatch');
  const manifest: unknown = JSON.parse(bytes.toString('utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('invalid canonical manifest');
  const candidate = manifest as Partial<AcceptanceManifest>;
  if (candidate.schemaVersion !== 2 || !Array.isArray(candidate.cases)
    || candidate.cases.length !== CANONICAL_CASE_IDENTITIES.length) {
    throw new Error('invalid canonical manifest');
  }
  const ids = new Set<string>();
  const filenames = new Set<string>();
  candidate.cases.forEach((item, index) => {
    const expected = CANONICAL_CASE_IDENTITIES[index]!;
    if (!item || item.id !== expected[0] || item.filename !== expected[1]
      || item.expectedCurrentStatus !== expected[2] || item.expectedLocators?.length !== expected[3]
      || item.sha256 !== CANONICAL_CASE_CONTENT_HASHES[item.id] || basename(item.filename) !== item.filename
      || ids.has(item.id) || filenames.has(item.filename)) {
      throw new Error('invalid canonical manifest case identity');
    }
    ids.add(item.id);
    filenames.add(item.filename);
  });
  return candidate as AcceptanceManifest;
}

export function deriveFixedAcceptancePaths(sourceSha: string, runId: string): PreparedAcceptancePaths {
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('invalid exact source SHA');
  if (!new RegExp(`^${sourceSha.slice(0, 12)}-[1-9][0-9]*$`).test(runId)) {
    throw new Error('invalid acceptance run id');
  }
  const acceptanceRoot = `/opt/openscience-acceptance/document-parser/${sourceSha}`;
  const runRoot = `${acceptanceRoot}/.run-${runId}`;
  const workerOutputRoot = `${runRoot}/worker-output`;
  return {
    releaseRoot: `/opt/openscience-releases/${sourceSha}`,
    acceptanceRoot,
    corpusRoot: `${acceptanceRoot}/corpus`,
    runRoot,
    workerOutputRoot,
    runtimeGraphPath: `${runRoot}/runtime-graph.json`,
    draftReportPath: `${workerOutputRoot}/report.draft.json`,
    unpublishedReportPath: `${acceptanceRoot}/.report-unpublished-${runId}.json`,
    finalReportPath: `${acceptanceRoot}/report.json`,
  };
}

async function contractCli(): Promise<void> {
  const [command, sourceSha, runId, ...extra] = process.argv.slice(2);
  if (extra.length !== 0 || !command || !sourceSha || !runId) {
    throw new Error('usage: parser-acceptance-contract <prepare|runtime-manifest|verify-runtime-manifest|finalize|cleanup-run|cleanup|publish> <source-sha> <run-id>');
  }
  if (command === 'prepare') {
    const paths = await prepareAcceptancePaths({
      sourceSha, runId, expectedUid: 0, workerOutputOwnerUid: 1000, workerOutputOwnerGid: 1000,
    });
    process.stdout.write(`${JSON.stringify(paths)}\n`);
    return;
  }
  const paths = deriveFixedAcceptancePaths(sourceSha, runId);
  if (command === 'runtime-manifest') {
    process.stdout.write(`${JSON.stringify(await buildAcceptanceRuntimeGraphManifest(paths.releaseRoot))}\n`);
    return;
  }
  if (command === 'verify-runtime-manifest') {
    const manifest = await readBoundedAcceptanceJson(paths.runtimeGraphPath);
    await verifyAcceptanceRuntimeGraphManifest(paths.releaseRoot, manifest);
    return;
  }
  if (command === 'cleanup') {
    await cleanupAcceptanceRun(paths.runRoot, paths.acceptanceRoot);
    return;
  }
  if (command === 'cleanup-run') {
    await cleanupAcceptanceRun(paths.runRoot, paths.acceptanceRoot, true);
    return;
  }
  if (command === 'finalize') {
    const runtimeGraph = await readBoundedAcceptanceJson(paths.runtimeGraphPath);
    await verifyAcceptanceRuntimeGraphManifest(paths.releaseRoot, runtimeGraph);
    const draft = await readBoundedAcceptanceJson(paths.draftReportPath);
    const resources = await readBoundedAcceptanceJson(join(paths.runRoot, 'resources.json'));
    await writeUnpublishedAcceptanceCandidate(
      paths.unpublishedReportPath,
      buildFinalAcceptanceReport(draft, resources),
    );
    return;
  }
  if (command === 'publish') {
    await verifyAndPublishAcceptanceCandidate(
      paths.releaseRoot,
      paths.unpublishedReportPath,
      paths.finalReportPath,
    );
    return;
  }
  throw new Error('unknown parser acceptance contract command');
}

if (require.main === module) {
  void contractCli().catch((error) => {
    console.error(error instanceof Error ? error.message : 'parser acceptance contract failed');
    process.exitCode = 1;
  });
}
