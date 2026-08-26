import type { DocumentBlock, DocumentSourceMap } from './document-source-map';
import { parseDocumentSourceMap } from './document-source-map';
import type { SourceLocator } from './types';
import { validateSourceLocator } from './validation';

type CharRange = NonNullable<SourceLocator['charRange']>;
type TableCell = NonNullable<SourceLocator['tableCell']>;
type CodeRange = NonNullable<SourceLocator['codeRange']>;
const SOURCE_LOCATOR_MAX_RAW_JSON_CHARACTERS = 12_000;

function locatorError(message: string): Error {
  return new Error(`SourceLocator ${message}`);
}

function mapBlock(sourceMap: DocumentSourceMap, blockId: string): { page: number; block: DocumentBlock } {
  if (!blockId.trim()) throw locatorError('blockId is required');
  for (const page of sourceMap.pages) {
    const block = page.blocks.find((candidate) => candidate.id === blockId);
    if (block) return { page: page.page, block };
  }
  throw locatorError('blockId does not exist in the document source map');
}

function pageLocator(sourceMap: DocumentSourceMap, page: number, block: DocumentBlock): SourceLocator {
  return {
    artifactId: sourceMap.artifactId,
    contentHash: sourceMap.contentHash,
    blockId: block.id,
    page,
    boundingBox: { ...block.boundingBox },
  };
}

function validateBlockRange(block: DocumentBlock, charRange: CharRange): void {
  if (typeof block.text !== 'string') throw locatorError('text charRange requires a text-bearing block');
  if (!Number.isInteger(charRange.start) || !Number.isInteger(charRange.end)
    || charRange.start < 0 || charRange.end <= charRange.start || charRange.end > block.text.length) {
    throw locatorError('charRange must be within the block text');
  }
}

export function createBlockSourceLocator(
  value: DocumentSourceMap,
  blockId: string,
  options: { charRange?: CharRange } = {},
): SourceLocator {
  const sourceMap = parseDocumentSourceMap(value);
  const { page, block } = mapBlock(sourceMap, blockId);
  const locator = pageLocator(sourceMap, page, block);
  if (options.charRange !== undefined) {
    validateBlockRange(block, options.charRange);
    locator.charRange = { ...options.charRange };
  }
  return validateSourceLocator(locator);
}

export function createTableCellSourceLocator(value: DocumentSourceMap, blockId: string, tableCell: TableCell): SourceLocator {
  const sourceMap = parseDocumentSourceMap(value);
  const { page, block } = mapBlock(sourceMap, blockId);
  if (block.kind !== 'table') throw locatorError('tableCell requires a table block');
  return validateSourceLocator({ ...pageLocator(sourceMap, page, block), tableCell: { ...tableCell } });
}

export function createCodeSourceLocator(artifactId: string, contentHash: string, codeRange: CodeRange): SourceLocator {
  return validateSourceLocator({ artifactId, contentHash, codeRange: { ...codeRange } });
}

function sameBoundingBox(a: NonNullable<SourceLocator['boundingBox']>, b: DocumentBlock['boundingBox']): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function resolveSourceLocator(value: DocumentSourceMap, locatorValue: SourceLocator): DocumentBlock {
  const locator = validateSourceLocator(locatorValue);
  if (locator.codeRange !== undefined) throw locatorError('codeRange cannot resolve against a document source map');
  const sourceMap = parseDocumentSourceMap(value);
  if (locator.artifactId !== sourceMap.artifactId) throw locatorError('artifactId does not match the document source map');
  if (locator.contentHash !== sourceMap.contentHash) throw locatorError('contentHash does not match the document source map');
  if (!locator.blockId) throw locatorError('blockId is required for document source map resolution');
  const { page, block } = mapBlock(sourceMap, locator.blockId);
  if (locator.page !== page) throw locatorError('page does not match the document source map');
  if (!locator.boundingBox || !sameBoundingBox(locator.boundingBox, block.boundingBox)) {
    throw locatorError('boundingBox does not match the document source map');
  }
  if (locator.charRange !== undefined) validateBlockRange(block, locator.charRange);
  if (locator.tableCell !== undefined && block.kind !== 'table') throw locatorError('tableCell requires a table block');
  return block;
}

export function serializeSourceLocator(value: unknown): string {
  return JSON.stringify(validateSourceLocator(value));
}

export function deserializeSourceLocator(json: string): SourceLocator {
  if (json.length > SOURCE_LOCATOR_MAX_RAW_JSON_CHARACTERS) {
    throw locatorError('limit_exceeded: raw JSON');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw locatorError('JSON is invalid');
  }
  return validateSourceLocator(parsed);
}
