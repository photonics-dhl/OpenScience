import { createHash } from 'node:crypto';
import {
  parseDocumentSourceMap,
  parseExtractionResult,
  type DocumentParserMetadata,
  type DocumentSourceMap,
  type ExtractionResult,
} from '@openscience/domain';
import type { DocumentParser, ParserInput } from './types';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_MEDIA_TYPE_LENGTH = 200;
const MAX_WARNING_OR_REASON_COUNT = 100;
const MAX_PAGE_COUNT = 10_000;
const MAX_BLOCK_COUNT = 10_000;
const MAX_TRANSFORMATION_COUNT = 25_000;
const MAX_TEXT_LENGTH = 50_000;
const MAX_SERIALIZED_STRING_LENGTH = 8_000_000;

export class ParserContractError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ParserContractError';
  }
}

type UnknownRecord = Record<string, unknown>;
interface ParseBudget { strings: number; blocks: number; transformations: number }
interface InputSnapshot { input: ParserInput; metadata: DocumentParserMetadata }

function contract(message: string): never { throw new ParserContractError(message); }

function object(value: unknown, label: string, allowed: readonly string[]): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    contract(`preflight ${label} must be a plain object`);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'toJSON')) contract(`preflight ${label} must not define toJSON`);
  const keys = Object.keys(value);
  if (keys.length > allowed.length || keys.some((key) => !allowed.includes(key))) contract(`preflight ${label} has an unknown field`);
  return value as UnknownRecord;
}

function onlyKeys(value: UnknownRecord, label: string, allowed: readonly string[]): void {
  const keys = Object.keys(value);
  if (keys.length > allowed.length || keys.some((key) => !allowed.includes(key))) contract(`preflight ${label} has an unknown field`);
}

function string(value: unknown, label: string, maximum: number, budget?: ParseBudget): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) contract(`preflight ${label} must be a bounded non-empty string`);
  if (budget) {
    budget.strings += value.length;
    if (budget.strings > MAX_SERIALIZED_STRING_LENGTH) contract('preflight string budget exceeded');
  }
  return value;
}

function number(value: unknown, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) contract(`preflight ${label} must be a finite number`);
}

function array(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) contract(`preflight ${label} must be an array`);
  if (value.length > maximum) contract(`preflight ${label} exceeds its maximum length`);
  if (Object.prototype.hasOwnProperty.call(value, 'toJSON')) contract(`preflight ${label} must not define toJSON`);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) contract(`preflight ${label} must not be sparse`);
  }
  if (Object.keys(value).length !== value.length) contract(`preflight ${label} has unsupported properties`);
  return value;
}

function metadata(value: unknown, label: string, budget: ParseBudget): void {
  const candidate = object(value, label, ['name', 'version', 'modelHash']);
  string(candidate.name, `${label} name`, MAX_IDENTIFIER_LENGTH, budget);
  string(candidate.version, `${label} version`, MAX_IDENTIFIER_LENGTH, budget);
  if (candidate.modelHash !== undefined) string(candidate.modelHash, `${label} modelHash`, MAX_IDENTIFIER_LENGTH, budget);
}

function boundingBox(value: unknown): void {
  const candidate = object(value, 'boundingBox', ['x', 'y', 'width', 'height']);
  number(candidate.x, 'boundingBox x'); number(candidate.y, 'boundingBox y');
  number(candidate.width, 'boundingBox width'); number(candidate.height, 'boundingBox height');
}

function sourceMap(value: unknown, budget: ParseBudget): void {
  const candidate = object(value, 'DocumentSourceMap', ['artifactId', 'contentHash', 'parser', 'pages']);
  string(candidate.artifactId, 'DocumentSourceMap artifactId', MAX_IDENTIFIER_LENGTH, budget);
  string(candidate.contentHash, 'DocumentSourceMap contentHash', 64, budget);
  metadata(candidate.parser, 'DocumentSourceMap parser', budget);
  const pages = array(candidate.pages, 'DocumentSourceMap pages', MAX_PAGE_COUNT);
  for (const pageValue of pages) {
    const page = object(pageValue, 'DocumentPage', ['page', 'width', 'height', 'blocks']);
    number(page.page, 'DocumentPage page'); number(page.width, 'DocumentPage width'); number(page.height, 'DocumentPage height');
    const blocks = array(page.blocks, 'DocumentPage blocks', MAX_BLOCK_COUNT - budget.blocks);
    budget.blocks += blocks.length;
    for (const blockValue of blocks) {
      const block = object(blockValue, 'DocumentBlock', ['id', 'kind', 'text', 'boundingBox', 'confidence', 'parser', 'transformations']);
      string(block.id, 'DocumentBlock id', MAX_IDENTIFIER_LENGTH, budget);
      string(block.kind, 'DocumentBlock kind', 20, budget);
      if (block.text !== undefined) string(block.text, 'DocumentBlock text', MAX_TEXT_LENGTH, budget);
      boundingBox(block.boundingBox);
      if (block.confidence !== undefined) number(block.confidence, 'DocumentBlock confidence');
      metadata(block.parser, 'DocumentBlock parser', budget);
      const transformations = array(block.transformations, 'DocumentBlock transformations', Math.min(100, MAX_TRANSFORMATION_COUNT - budget.transformations));
      budget.transformations += transformations.length;
      for (const transformationValue of transformations) {
        const transformation = object(transformationValue, 'DocumentTransformation', ['stage', 'processor']);
        string(transformation.stage, 'DocumentTransformation stage', 20, budget);
        metadata(transformation.processor, 'DocumentTransformation processor', budget);
      }
    }
  }
}

/** Rejects unbounded or non-JSON-shaped provider output before JSON.stringify can traverse it. */
function preflightExtractionResult(value: unknown): void {
  const result = object(value, 'ExtractionResult', ['status', 'sourceMap', 'warnings', 'reasons', 'code', 'message', 'retryable', 'provider']);
  const status = string(result.status, 'ExtractionResult status', 20);
  const budget: ParseBudget = { strings: status.length, blocks: 0, transformations: 0 };
  if (status === 'succeeded' || status === 'needs_review') {
    onlyKeys(result, 'ExtractionResult', status === 'succeeded' ? ['status', 'sourceMap', 'warnings'] : ['status', 'sourceMap', 'reasons']);
    sourceMap(result.sourceMap, budget);
    const entries = array(status === 'succeeded' ? result.warnings : result.reasons, `ExtractionResult ${status === 'succeeded' ? 'warnings' : 'reasons'}`, MAX_WARNING_OR_REASON_COUNT);
    for (const entry of entries) string(entry, 'ExtractionResult entry', 500, budget);
    return;
  }
  if (status === 'blocked') {
    onlyKeys(result, 'ExtractionResult', ['status', 'code', 'message']);
    string(result.code, 'ExtractionResult code', 50, budget); string(result.message, 'ExtractionResult message', 2_000, budget); return;
  }
  if (status === 'failed') {
    onlyKeys(result, 'ExtractionResult', ['status', 'retryable', 'provider', 'message']);
    if (typeof result.retryable !== 'boolean') contract('preflight ExtractionResult retryable must be boolean');
    string(result.provider, 'ExtractionResult provider', 2_000, budget); string(result.message, 'ExtractionResult message', 2_000, budget); return;
  }
  contract('preflight ExtractionResult status is invalid');
}

function snapshotMetadata(value: unknown): DocumentParserMetadata {
  const budget: ParseBudget = { strings: 0, blocks: 0, transformations: 0 };
  metadata(value, 'DocumentParser metadata', budget);
  const candidate = value as DocumentParserMetadata;
  return { name: candidate.name, version: candidate.version, ...(candidate.modelHash === undefined ? {} : { modelHash: candidate.modelHash }) };
}

function snapshotInput(input: unknown, parser: unknown): InputSnapshot {
  const value = object(input, 'ParserInput', ['artifactId', 'contentHash', 'content', 'mediaType']);
  const artifactId = string(value.artifactId, 'ParserInput artifactId', MAX_IDENTIFIER_LENGTH);
  const contentHash = string(value.contentHash, 'ParserInput contentHash', 64);
  const mediaType = string(value.mediaType, 'ParserInput mediaType', MAX_MEDIA_TYPE_LENGTH);
  if (!/^[a-f0-9]{64}$/.test(contentHash)) contract('ParserInput contentHash must be a SHA-256 hex digest');
  if (!Buffer.isBuffer(value.content)) contract('ParserInput content must be a Buffer');
  if (value.content.length > MAX_INPUT_BYTES) contract('ParserInput content exceeds maximum size');
  if (!parser || typeof parser !== 'object') contract('DocumentParser must be an object');
  const selected = parser as DocumentParser;
  const privateContent = Buffer.from(value.content);
  const actualHash = createHash('sha256').update(privateContent).digest('hex');
  if (contentHash !== actualHash) contract('ParserInput contentHash does not match content');
  return { input: { artifactId, contentHash, mediaType, content: privateContent }, metadata: snapshotMetadata(selected.metadata) };
}

function callbackInput(snapshot: ParserInput): ParserInput {
  return { artifactId: snapshot.artifactId, contentHash: snapshot.contentHash, mediaType: snapshot.mediaType, content: Buffer.from(snapshot.content) };
}

function equalMetadata(actual: DocumentParserMetadata, expected: DocumentParserMetadata): boolean {
  return actual.name === expected.name && actual.version === expected.version && actual.modelHash === expected.modelHash;
}

function parseResult(value: unknown): ExtractionResult<DocumentSourceMap> {
  preflightExtractionResult(value);
  try {
    return parseExtractionResult(JSON.stringify(value), parseDocumentSourceMap);
  } catch (error) {
    throw new ParserContractError('Document parser returned an invalid extraction result', { cause: error });
  }
}

function validateSourceMapIdentity(sourceMapValue: DocumentSourceMap, input: ParserInput, parserMetadata: DocumentParserMetadata): void {
  if (sourceMapValue.artifactId !== input.artifactId) contract('DocumentSourceMap artifactId does not match parser input');
  if (sourceMapValue.contentHash !== input.contentHash) contract('DocumentSourceMap contentHash does not match parser input');
  if (!equalMetadata(sourceMapValue.parser, parserMetadata)) contract('DocumentSourceMap parser metadata does not match selected parser');
}

/** Executes an untrusted parser behind a bounded, snapshot-based domain contract. */
export async function runDocumentParser(input: ParserInput, parser: DocumentParser): Promise<ExtractionResult<DocumentSourceMap>> {
  const snapshot = snapshotInput(input, parser);
  if (typeof parser.supports !== 'function' || typeof parser.parse !== 'function') contract('DocumentParser must implement supports and parse');
  if (!await parser.supports(callbackInput(snapshot.input))) contract('Document parser does not support this input');
  const result = parseResult(await parser.parse(callbackInput(snapshot.input)));
  if (result.status !== 'succeeded' && result.status !== 'needs_review') return result;
  validateSourceMapIdentity(result.sourceMap, snapshot.input, snapshot.metadata);
  if (result.status === 'succeeded' && result.sourceMap.pages.every((page) => page.blocks.length === 0)) {
    contract('Succeeded DocumentSourceMap must contain at least one block');
  }
  return result;
}
