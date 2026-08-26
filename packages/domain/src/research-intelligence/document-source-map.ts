export const DOCUMENT_BLOCK_KINDS = [
  'heading',
  'paragraph',
  'figure',
  'table',
  'equation',
  'caption',
  'reference',
] as const;

export const DOCUMENT_TRANSFORMATION_STAGES = [
  'extract_text',
  'detect_layout',
  'classify',
  'ocr',
  'normalize',
  'merge',
] as const;

export type DocumentBlockKind = (typeof DOCUMENT_BLOCK_KINDS)[number];
export type DocumentTransformationStage = (typeof DOCUMENT_TRANSFORMATION_STAGES)[number];

export interface DocumentParserMetadata {
  name: string;
  version: string;
  modelHash?: string;
}

export interface DocumentTransformation {
  stage: DocumentTransformationStage;
  processor: DocumentParserMetadata;
}

export interface DocumentBlock {
  id: string;
  kind: DocumentBlockKind;
  text?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence?: number;
  parser: DocumentParserMetadata;
  transformations: DocumentTransformation[];
}

export interface DocumentPage {
  page: number;
  width: number;
  height: number;
  blocks: DocumentBlock[];
}

export interface DocumentSourceMap {
  artifactId: string;
  contentHash: string;
  parser: DocumentParserMetadata;
  pages: DocumentPage[];
}

const TEXT_BEARING_BLOCK_KINDS = new Set<DocumentBlockKind>(['heading', 'paragraph', 'caption', 'reference']);
const MAX_TOTAL_BLOCKS = 10_000;
const MAX_TOTAL_TRANSFORMATIONS = 25_000;
const MAX_TOTAL_TEXT_CHARACTERS = 5_000_000;
const MAX_SERIALIZED_CONTENT_CHARACTERS = 8_000_000;
// 8 MB accepted string content can expand sixfold in JSON escapes; 16 MB covers all bounded structure and numbers.
export const DOCUMENT_SOURCE_MAP_MAX_RAW_JSON_CHARACTERS = 64_000_000;

interface ParseBudget {
  blocks: number;
  transformations: number;
  textCharacters: number;
  serializedContentCharacters: number;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} has unknown field "${unknown}"`);
}

function consume(budget: ParseBudget, field: keyof ParseBudget, amount: number, maximum: number): void {
  budget[field] += amount;
  if (budget[field] > maximum) throw new Error(`DocumentSourceMap limit_exceeded: ${field}`);
}

function requiredString(value: unknown, label: string, maxLength = 2_000, budget?: ParseBudget): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (budget) consume(budget, 'serializedContentCharacters', value.length, MAX_SERIALIZED_CONTENT_CHARACTERS);
  return value;
}

function finitePositive(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value;
}

function parseParserMetadata(value: unknown, label: string, budget: ParseBudget): DocumentParserMetadata {
  const metadata = record(value, label);
  onlyKeys(metadata, ['name', 'version', 'modelHash'], label);
  const result: DocumentParserMetadata = {
    name: requiredString(metadata.name, `${label} name`, 200, budget),
    version: requiredString(metadata.version, `${label} version`, 200, budget),
  };
  if (metadata.modelHash !== undefined) result.modelHash = requiredString(metadata.modelHash, `${label} modelHash`, 200, budget);
  return result;
}

function parseBoundingBox(value: unknown, page: DocumentPage): DocumentBlock['boundingBox'] {
  const box = record(value, 'DocumentBlock boundingBox');
  onlyKeys(box, ['x', 'y', 'width', 'height'], 'DocumentBlock boundingBox');
  const x = typeof box.x === 'number' && Number.isFinite(box.x) && box.x >= 0 ? box.x : undefined;
  const y = typeof box.y === 'number' && Number.isFinite(box.y) && box.y >= 0 ? box.y : undefined;
  const width = finitePositive(box.width, 'DocumentBlock boundingBox width');
  const height = finitePositive(box.height, 'DocumentBlock boundingBox height');
  const xTolerance = Number.EPSILON * Math.max(1, Math.abs(x ?? 0), width, page.width) * 16;
  const yTolerance = Number.EPSILON * Math.max(1, Math.abs(y ?? 0), height, page.height) * 16;
  if (x === undefined || y === undefined || x + width - page.width > xTolerance || y + height - page.height > yTolerance) {
    throw new Error('DocumentBlock boundingBox must be within its page');
  }
  return { x, y, width, height };
}

function parseBlock(value: unknown, page: DocumentPage, blockIds: Set<string>, budget: ParseBudget): DocumentBlock {
  const block = record(value, 'DocumentBlock');
  onlyKeys(block, ['id', 'kind', 'text', 'boundingBox', 'confidence', 'parser', 'transformations'], 'DocumentBlock');
  consume(budget, 'blocks', 1, MAX_TOTAL_BLOCKS);
  const id = requiredString(block.id, 'DocumentBlock id', 200, budget);
  if (blockIds.has(id)) throw new Error('DocumentBlock id must be globally unique');
  if (typeof block.kind !== 'string' || !DOCUMENT_BLOCK_KINDS.includes(block.kind as DocumentBlockKind)) {
    throw new Error('DocumentBlock kind is unsupported');
  }
  const kind = block.kind as DocumentBlockKind;
  if (block.text !== undefined && typeof block.text !== 'string') throw new Error('DocumentBlock text must be a string');
  if (TEXT_BEARING_BLOCK_KINDS.has(kind) && !requiredString(block.text, 'DocumentBlock text', 50_000, budget)) {
    throw new Error('DocumentBlock text is required');
  }
  if (block.text !== undefined && (!block.text.trim() || block.text.length > 50_000)) {
    throw new Error('DocumentBlock text must be a non-empty string');
  }
  if (block.text !== undefined) {
    if (!TEXT_BEARING_BLOCK_KINDS.has(kind)) requiredString(block.text, 'DocumentBlock text', 50_000, budget);
    consume(budget, 'textCharacters', block.text.length, MAX_TOTAL_TEXT_CHARACTERS);
  }
  let confidence: number | undefined;
  if (block.confidence !== undefined) {
    if (typeof block.confidence !== 'number' || !Number.isFinite(block.confidence) || block.confidence < 0 || block.confidence > 1) {
      throw new Error('DocumentBlock confidence must be between zero and one');
    }
    confidence = block.confidence;
  }
  if (!Array.isArray(block.transformations) || block.transformations.length > 100) {
    throw new Error('DocumentBlock transformations must be an array');
  }
  const transformations = block.transformations.map((value) => {
    consume(budget, 'transformations', 1, MAX_TOTAL_TRANSFORMATIONS);
    const transformation = record(value, 'DocumentTransformation');
    onlyKeys(transformation, ['stage', 'processor'], 'DocumentTransformation');
    if (typeof transformation.stage !== 'string'
      || !DOCUMENT_TRANSFORMATION_STAGES.includes(transformation.stage as DocumentTransformationStage)) {
      throw new Error('DocumentTransformation stage is unsupported');
    }
    return {
      stage: transformation.stage as DocumentTransformationStage,
      processor: parseParserMetadata(transformation.processor, 'DocumentTransformation processor', budget),
    };
  });
  blockIds.add(id);
  return {
    id,
    kind,
    ...(block.text === undefined ? {} : { text: block.text }),
    boundingBox: parseBoundingBox(block.boundingBox, page),
    ...(confidence === undefined ? {} : { confidence }),
    parser: parseParserMetadata(block.parser, 'DocumentBlock parser', budget),
    transformations,
  };
}

export function parseDocumentSourceMap(value: unknown): DocumentSourceMap {
  const sourceMap = record(value, 'DocumentSourceMap');
  onlyKeys(sourceMap, ['artifactId', 'contentHash', 'parser', 'pages'], 'DocumentSourceMap');
  const artifactId = requiredString(sourceMap.artifactId, 'DocumentSourceMap artifactId', 200);
  if (typeof sourceMap.contentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(sourceMap.contentHash)) {
    throw new Error('DocumentSourceMap contentHash must be a SHA-256 hex digest');
  }
  if (!Array.isArray(sourceMap.pages) || sourceMap.pages.length > 10_000) {
    throw new Error('DocumentSourceMap pages must be an array');
  }
  const pageNumbers = new Set<number>();
  const blockIds = new Set<string>();
  const budget: ParseBudget = { blocks: 0, transformations: 0, textCharacters: 0, serializedContentCharacters: 0 };
  const parser = parseParserMetadata(sourceMap.parser, 'DocumentSourceMap parser', budget);
  const pages = sourceMap.pages.map((value) => {
    const page = record(value, 'DocumentPage');
    onlyKeys(page, ['page', 'width', 'height', 'blocks'], 'DocumentPage');
    if (!Number.isInteger(page.page) || (page.page as number) < 1) throw new Error('DocumentPage page must be a positive integer');
    if (pageNumbers.has(page.page as number)) throw new Error('DocumentPage page numbers must be unique');
    const parsedPage: DocumentPage = {
      page: page.page as number,
      width: finitePositive(page.width, 'DocumentPage width'),
      height: finitePositive(page.height, 'DocumentPage height'),
      blocks: [],
    };
    if (!Array.isArray(page.blocks) || page.blocks.length > 100_000) throw new Error('DocumentPage blocks must be an array');
    pageNumbers.add(parsedPage.page);
    parsedPage.blocks = page.blocks.map((block) => parseBlock(block, parsedPage, blockIds, budget));
    return parsedPage;
  });
  return {
    artifactId,
    contentHash: sourceMap.contentHash,
    parser,
    pages,
  };
}

export function serializeDocumentSourceMap(value: unknown): string {
  return JSON.stringify(parseDocumentSourceMap(value));
}

export function deserializeDocumentSourceMap(json: string): DocumentSourceMap {
  if (json.length > DOCUMENT_SOURCE_MAP_MAX_RAW_JSON_CHARACTERS) {
    throw new Error('DocumentSourceMap limit_exceeded: raw JSON');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('DocumentSourceMap JSON is invalid');
  }
  return parseDocumentSourceMap(parsed);
}
