import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 65_536;
const SAFE_CASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const CURRENT_CASE_IDS = new Set([
  'corrupt-pdf-en',
  'native-pdf-en',
  'dual-column-pdf-en',
  'table-pdf-en',
  'formula-pdf-en',
  'references-pdf-en',
  'scan-pdf-image-only',
]);

function normalizedText(value) {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
}

function quotesAppearInOrder(text, quotes) {
  if (!Array.isArray(quotes) || quotes.length < 2 || quotes.length > 100) return false;
  let offset = 0;
  for (const rawQuote of quotes) {
    const quote = normalizedText(rawQuote);
    if (!quote || quote.length > 2_000) return false;
    const index = text.indexOf(quote, offset);
    if (index < 0) return false;
    offset = index + quote.length;
  }
  return true;
}

function result(matches, total) {
  return matches === total
    ? { status: 'succeeded', locatorMatches: matches }
    : { status: 'needs_review', locatorMatches: matches, errorCode: 'locator_miss' };
}

export function evaluateTextLocators(pages, locators) {
  if (!Array.isArray(pages) || !Array.isArray(locators) || locators.length === 0 || locators.length > 1_000) {
    throw new Error('invalid locator input');
  }
  let matches = 0;
  for (const locator of locators) {
    if (!Number.isSafeInteger(locator?.page) || locator.page < 1) continue;
    const page = pages.find((item) => item?.num === locator.page || item?.pageNumber === locator.page);
    const text = normalizedText(page?.text);
    if (!text) continue;
    if (locator.kind === 'page-text') {
      const quote = normalizedText(locator.quote);
      if (quote && quote.length <= 2_000 && text.includes(quote)) matches += 1;
    } else if (locator.kind === 'page-text-order' && quotesAppearInOrder(text, locator.quotes)) {
      matches += 1;
    }
  }
  return result(matches, locators.length);
}

function intersects(left, right) {
  return Math.min(left[2], right[2]) > Math.max(left[0], right[0])
    && Math.min(left[3], right[3]) > Math.max(left[1], right[1]);
}

export function evaluateOcrLocators(pages, locators) {
  if (!Array.isArray(pages) || !Array.isArray(locators) || locators.length === 0 || locators.length > 1_000) {
    throw new Error('invalid locator input');
  }
  let matches = 0;
  for (const locator of locators) {
    if (!Number.isSafeInteger(locator?.page) || locator.page < 1) continue;
    const page = pages.find((item) => item?.page === locator.page);
    if (!page || !Array.isArray(page.items)) continue;
    if (locator.kind === 'page-text') {
      const quote = normalizedText(locator.quote);
      const text = normalizedText(page.items.map((item) => item?.text).join(' '));
      if (quote && quote.length <= 2_000 && text.includes(quote)) matches += 1;
    } else if (locator.kind === 'page-region'
      && Array.isArray(locator.bbox)
      && locator.bbox.length === 4
      && locator.bbox.every(Number.isFinite)
      && page.items.some((item) => Array.isArray(item?.bbox)
        && item.bbox.length === 4
        && item.bbox.every(Number.isFinite)
        && intersects(item.bbox, locator.bbox))) {
      matches += 1;
    }
  }
  return result(matches, locators.length);
}

async function loadCase(manifestPath, caseId, candidate) {
  if (!SAFE_CASE_ID.test(caseId)) throw new Error('invalid case id');
  if (candidate === 'tesseract' && caseId !== 'scan-pdf-image-only') throw new Error('invalid scan case');
  if (candidate === 'current-parser' && !CURRENT_CASE_IDS.has(caseId)) throw new Error('invalid current case');
  const manifestStat = await stat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.size > MAX_MANIFEST_BYTES) throw new Error('invalid manifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest?.schemaVersion !== 2 || !Array.isArray(manifest.cases) || manifest.cases.length !== 16) {
    throw new Error('invalid evaluation corpus');
  }
  const item = manifest.cases.find((value) => value?.id === caseId);
  if (!item || !SAFE_FILENAME.test(item.filename) || basename(item.filename) !== item.filename
    || !Array.isArray(item.expectedLocators) || !/^[a-f0-9]{64}$/.test(item.sha256)) {
    throw new Error('invalid corpus case');
  }
  const sourcePath = join(dirname(manifestPath), item.filename);
  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isFile() || sourceStat.size > MAX_SOURCE_BYTES) throw new Error('invalid source');
  const source = await readFile(sourcePath);
  if (createHash('sha256').update(source).digest('hex') !== item.sha256) throw new Error('source hash mismatch');
  return { item, source };
}

export function parseTesseractTsv(tsv, page) {
  const items = [];
  for (const line of tsv.split(/\r?\n/u).slice(1)) {
    const columns = line.split('\t');
    if (columns.length !== 12) continue;
    const [left, top, width, height] = columns.slice(6, 10).map(Number);
    const text = normalizedText(columns[11]);
    if (!text || ![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    items.push({
      text,
      bbox: [
        left * 612 / page.width,
        792 - (top + height) * 792 / page.height,
        (left + width) * 612 / page.width,
        792 - top * 792 / page.height,
      ],
    });
  }
  return { page: page.pageNumber, width: 612, height: 792, items };
}

export function candidatePeakRssBytes(ownPeakRssBytes, cgroupPeakText, requireContainerPeak = false) {
  const ownPeak = Number.isSafeInteger(ownPeakRssBytes) && ownPeakRssBytes >= 0 ? ownPeakRssBytes : 0;
  const normalized = typeof cgroupPeakText === 'string' ? cgroupPeakText.trim() : '';
  const containerPeak = /^\d+$/u.test(normalized) ? Number(normalized) : Number.NaN;
  if ((!Number.isSafeInteger(containerPeak) || containerPeak < 0) && requireContainerPeak) {
    throw new Error('container peak RSS is unavailable');
  }
  return Number.isSafeInteger(containerPeak) && containerPeak >= 0
    ? Math.max(ownPeak, containerPeak)
    : ownPeak;
}

function peakRssBytes(requireContainerPeak = false) {
  const ownPeak = process.resourceUsage().maxRSS * 1024;
  let cgroupPeakText;
  for (const path of ['/sys/fs/cgroup/memory.peak', '/sys/fs/cgroup/memory/memory.max_usage_in_bytes']) {
    try {
      cgroupPeakText = readFileSync(path, 'utf8');
      break;
    } catch { /* try the other cgroup layout */ }
  }
  return candidatePeakRssBytes(ownPeak, cgroupPeakText, requireContainerPeak);
}

function writeOutcome(value) {
  const encoded = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(encoded) > MAX_OUTPUT_BYTES) throw new Error('bounded output exceeded');
  process.stdout.write(encoded);
}

async function evaluateCurrent(source, locators) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: source });
  try {
    const parsed = await parser.getText();
    const pages = Array.isArray(parsed.pages)
      ? parsed.pages.map((page) => ({ num: page.num ?? page.pageNumber, text: page.text }))
      : [{ num: 1, text: parsed.text }];
    return evaluateTextLocators(pages, locators);
  } finally {
    await parser.destroy();
  }
}

async function evaluateTesseract(source, locators) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: source });
  let page;
  try {
    const screenshots = await parser.getScreenshot({ partial: [1], scale: 2, imageBuffer: true, imageDataUrl: false });
    [page] = screenshots.pages;
  } finally {
    await parser.destroy();
  }
  if (!page?.data || !Number.isFinite(page.width) || !Number.isFinite(page.height)) throw new Error('render failed');
  const child = spawnSync('tesseract', ['stdin', 'stdout', '-l', 'eng+chi_sim', 'tsv'], {
    input: Buffer.from(page.data),
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (child.error || child.status !== 0 || typeof child.stdout !== 'string') throw new Error('ocr failed');
  return evaluateOcrLocators([parseTesseractTsv(child.stdout, page)], locators);
}

export async function run() {
  const startedAt = performance.now();
  let candidate;
  try {
    const offset = ['current-parser', 'tesseract'].includes(process.argv[1]) ? 1 : 2;
    const [, manifestPath, caseId] = process.argv.slice(offset);
    candidate = process.argv[offset];
    if (!['current-parser', 'tesseract'].includes(candidate) || !manifestPath || !caseId
      || process.argv.length !== offset + 3) {
      throw new Error('invalid arguments');
    }
    const { item, source } = await loadCase(manifestPath, caseId, candidate);
    if (!item.filename.toLowerCase().endsWith('.pdf')) throw new Error('unsupported media type');
    const evaluation = candidate === 'tesseract'
      ? await evaluateTesseract(source, item.expectedLocators)
      : await evaluateCurrent(source, item.expectedLocators);
    writeOutcome({
      ...evaluation,
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      peakRssBytes: peakRssBytes(candidate === 'tesseract'),
    });
  } catch {
    try {
      writeOutcome({
        status: 'failed',
        locatorMatches: 0,
        elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
        peakRssBytes: peakRssBytes(),
        errorCode: 'parser_exit',
      });
    } catch { /* closed output is an invalid candidate result */ }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
