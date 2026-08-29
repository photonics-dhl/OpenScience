import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const SAFE_CASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

function pageText(page) {
  if (typeof page?.text === 'string') return page.text;
  if (!Array.isArray(page?.textItems)) return '';
  return page.textItems
    .map((item) => (typeof item?.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join(' ');
}

function quotesAppearInOrder(text, quotes) {
  if (!Array.isArray(quotes) || quotes.length < 2 || quotes.length > 100) return false;
  let offset = 0;
  for (const quote of quotes) {
    if (typeof quote !== 'string' || !quote || quote.length > 2_000) return false;
    const index = text.indexOf(quote, offset);
    if (index < 0) return false;
    offset = index + quote.length;
  }
  return true;
}

function textInRegion(page, bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) return '';
  const [x0, y0, x1, y1] = bbox;
  if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0 || x1 > page.width || y1 > page.height) return '';
  if (!Array.isArray(page.textItems)) return '';
  return page.textItems
    .filter((item) => {
      if (![item?.x, item?.y, item?.width, item?.height].every(Number.isFinite)) return false;
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      return centerX >= x0 && centerX <= x1 && centerY >= y0 && centerY <= y1;
    })
    .map((item) => item.text)
    .filter((text) => typeof text === 'string' && text)
    .join(' ');
}

export function evaluateLiteParseLocators(result, locators) {
  if (!Array.isArray(locators) || locators.length === 0 || locators.length > 1_000) {
    throw new Error('invalid locator set');
  }
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  let locatorMatches = 0;

  for (const locator of locators) {
    if (!Number.isSafeInteger(locator?.page) || locator.page < 1) continue;
    const page = pages.find((item) => item?.pageNum === locator.page || item?.pageNumber === locator.page);
    if (!page) continue;
    if (locator.kind === 'page-text'
      && typeof locator.quote === 'string'
      && locator.quote
      && locator.quote.length <= 2_000
      && pageText(page).includes(locator.quote)) locatorMatches += 1;
    if (locator.kind === 'page-text-order' && quotesAppearInOrder(pageText(page), locator.quotes)) locatorMatches += 1;
    if (locator.kind === 'page-region-text'
      && typeof locator.quote === 'string'
      && locator.quote
      && locator.quote.length <= 2_000
      && textInRegion(page, locator.bbox).includes(locator.quote)) locatorMatches += 1;
  }

  return locatorMatches === locators.length
    ? { status: 'succeeded', locatorMatches }
    : { status: 'needs_review', locatorMatches, errorCode: 'locator_miss' };
}

function boundedPeakRssBytes() {
  const value = process.resourceUsage().maxRSS * 1024;
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function writeOutcome(outcome) {
  process.stdout.write(`${JSON.stringify(outcome)}\n`);
}

async function loadCase(manifestPath, caseId) {
  if (!SAFE_CASE_ID.test(caseId)) throw new Error('invalid case id');
  const manifestStat = await stat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.size > MAX_MANIFEST_BYTES) throw new Error('invalid manifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest?.cases) || manifest.cases.length === 0 || manifest.cases.length > 1_000) {
    throw new Error('invalid manifest cases');
  }
  const item = manifest.cases.find((candidate) => candidate?.id === caseId);
  if (!item || !SAFE_FILENAME.test(item.filename) || basename(item.filename) !== item.filename) {
    throw new Error('invalid corpus case');
  }
  return item;
}

async function run() {
  const startedAt = performance.now();
  try {
    const [manifestPath, caseId] = process.argv.slice(2);
    if (!manifestPath || !caseId || process.argv.length !== 4) throw new Error('invalid arguments');
    const item = await loadCase(manifestPath, caseId);
    if (!item.filename.toLowerCase().endsWith('.pdf')) throw new Error('unsupported media type');
    const sourcePath = join(dirname(manifestPath), item.filename);
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.size > MAX_SOURCE_BYTES) throw new Error('invalid source');

    const { LiteParse } = await import('@llamaindex/liteparse');
    const parser = new LiteParse({
      ocrEnabled: false,
      outputFormat: 'json',
      extractImages: false,
      extractScreenshots: false,
      maxPages: 100,
      numWorkers: 1,
      quiet: true,
    });
    const result = await parser.parse(sourcePath);
    const evaluation = evaluateLiteParseLocators(result, item.expectedLocators);
    writeOutcome({
      ...evaluation,
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      peakRssBytes: boundedPeakRssBytes(),
    });
  } catch {
    try {
      writeOutcome({
        status: 'failed',
        locatorMatches: 0,
        elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
        peakRssBytes: boundedPeakRssBytes(),
        errorCode: 'parser_exit',
      });
    } catch { /* a closed output stream is an invalid candidate result */ }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
